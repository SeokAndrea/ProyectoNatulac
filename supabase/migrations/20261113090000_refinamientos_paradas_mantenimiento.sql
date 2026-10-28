-- ============================================================
-- PARADAS Y MANTENIMIENTO: refinamientos (dueña, 2026-10-28)
-- ============================================================
--   1. Lote y sabor en TODAS las paradas: antes solo los copiaban Parar
--      (pausar_linea) y abrir_parada_mantenimiento. Anotar, Cubrir y el +1
--      quedaban sin lote ni sabor en el reporte. Un trigger los toma de la
--      corrida que estaba en la línea a la hora de inicio (si no vienen).
--      Se rellenan las ya guardadas que quedaron sin ellos.
--   2. paradas.reparacion_min: cuánto tardó Mantenimiento en repararla
--      (opcional, solo registro; no cambia el tiempo de la parada).
--      terminar_parada() gana p_reparacion_min.
--   3. listar_paradas(): + reparacion_min y equipo_nombre (el equipo de
--      Producción sale del servidor, no del catálogo que tenga cargado la
--      pantalla).
--   4. Solicitudes: la Inspección también lleva responsable (queda «en
--      revisión»); el responsable se elige entre el personal de
--      Mantenimiento (listar_personal_mantenimiento). Si una Inspección con
--      responsable sube a Intervención, pasa directo a En reparación con él.
--   5. completar_primer_ingreso(): la cédula es opcional.
--   6. Rol ↔ área: en Mantenimiento solo va el rol Mantenimiento (o Solo
--      Vista), y el rol Mantenimiento solo va en su área (o en Pruebas).
--      Antes al elegir Mantenimiento salían Jefe de Producción, Analista…
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lote y sabor de la corrida
-- ------------------------------------------------------------
-- La corrida de la línea que estaba en marcha a esa hora (arrancó antes y
-- no había terminado). Sin corrida: null.
create or replace function lote_sabor_de_linea(p_linea_id uuid, p_momento timestamptz)
returns table (lote text, sabor text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(tl.lote), ''), (select pr.lote from preparaciones pr where pr.id = tl.lote_id)),
         (select s.nombre from sabores s where s.id = tl.sabor_id)
  from turno_lineas tl
  where tl.linea_id = p_linea_id
    and tl.activada_en <= p_momento
    and (tl.activa or tl.finalizada_en is not null or tl.entregada_en is not null)
    and coalesce(tl.finalizada_en, tl.entregada_en, 'infinity'::timestamptz) > p_momento
  order by tl.activada_en desc
  limit 1;
$$;
revoke execute on function lote_sabor_de_linea(uuid, timestamptz) from public, anon, authenticated;

create or replace function paradas_lote_sabor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote text;
  v_sabor text;
begin
  if new.lote is null and new.sabor is null and new.linea_id is not null and not coalesce(new.sin_corrida, false) then
    select x.lote, x.sabor into v_lote, v_sabor from lote_sabor_de_linea(new.linea_id, new.inicio) x;
    new.lote := v_lote;
    new.sabor := v_sabor;
  end if;
  return new;
end;
$$;

drop trigger if exists paradas_lote_sabor on paradas;
-- Al completar un +1 cambia el inicio: se vuelve a mirar si sigue sin lote.
create trigger paradas_lote_sabor
before insert or update of inicio on paradas
for each row execute function paradas_lote_sabor();

-- Las ya guardadas sin lote ni sabor (Anotar, Cubrir, +1).
do $$
declare
  v_n integer;
begin
  with rellenas as (
    update paradas p
    set lote = x.lote, sabor = x.sabor
    from (
      select q.id, l.lote, l.sabor
      from paradas q
      cross join lateral lote_sabor_de_linea(q.linea_id, q.inicio) l
      where q.lote is null and q.sabor is null and not q.sin_corrida and q.linea_id is not null
        and (l.lote is not null or l.sabor is not null)
    ) x
    where p.id = x.id
    returning p.id
  )
  select count(*) into v_n from rellenas;
  if v_n > 0 then
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'paradas', null, 'Migración 20261113090000',
      format('Lote y sabor completados en %s paradas que quedaron sin ellos (Anotar, Cubrir, +1)', v_n),
      null, jsonb_build_object('paradas', v_n));
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Tiempo de reparación
-- ------------------------------------------------------------
alter table paradas add column if not exists reparacion_min integer
  check (reparacion_min is null or reparacion_min between 1 and 43200);
comment on column paradas.reparacion_min is
  'Minutos que tardó Mantenimiento en repararla (opcional, solo registro; 20261113090000).';

-- terminar_parada(): copia de 20261112990000 + p_reparacion_min. Se borra la
-- firma vieja para que quede UNA (con dos, PostgREST no sabe cuál llamar).
drop function if exists terminar_parada(text, uuid, text, text, text, text, text, text, text);

create or replace function terminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_fin text default null,
  p_inicio text default null,
  p_pagina text default 'Reportes de paradas',
  p_mtto_equipo_codigo text default null,
  p_reparacion_min integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  v_usuario_id uuid;
  v_p paradas;
  v_tipo paradas_tipos;
  v_nombre text;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
  v_sub text := nullif(btrim(coalesce(p_subsistema_codigo, '')), '');
  v_mtto_eq mtto_equipos;
  v_de_mtto boolean := es_de_mantenimiento(p_usuario);
  v_sub_nombre text;
  v_cierre timestamptz;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
  v_reparacion integer := p_reparacion_min;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  -- Una pendiente (el +1 sin completar) se guarda con fin = inicio: se puede terminar.
  if v_p.fin is not null and not v_p.pendiente then
    raise exception 'Esa parada ya terminó.';
  end if;
  -- La dueña también (prueba en Pruebas, donde el interruptor está encendido).
  if la_termina_mantenimiento(p_parada_id) and not es_de_mantenimiento(p_usuario) and not es_dueno(p_usuario) then
    raise exception 'Esta parada la termina Mantenimiento.';
  end if;

  -- El equipo y la falla de Producción son del supervisor: no se tocan. Solo se
  -- completan si la parada quedó con el tipo provisional (por clasificar).
  select * into v_tipo from paradas_tipos where id = v_p.tipo_id;
  if v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
    if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige el código de la parada del catálogo.';
    end if;
  elsif nullif(btrim(coalesce(p_tipo_codigo, '')), '') is not null and p_tipo_codigo is distinct from v_tipo.codigo then
    raise exception 'El equipo y la falla de Producción no se cambian.';
  end if;
  -- Lo de Mantenimiento: su equipo y su subsistema, de su catálogo. El supervisor
  -- (interruptor apagado) no los conoce: queda «Sin subsistema» y sin equipo.
  if v_de_mtto then
    select * into v_mtto_eq from mtto_equipos where codigo = upper(nullif(btrim(coalesce(p_mtto_equipo_codigo, '')), '')) and activo;
    if v_sub is null then
      raise exception 'Elige el subsistema (o «Sin subsistema»).';
    end if;
    if v_mtto_eq.codigo is null then
      raise exception 'Elige el equipo de Mantenimiento.';
    end if;
  else
    v_sub := 'SIN_SUBSISTEMA';
  end if;
  if v_sub = 'SIN_SUBSISTEMA' then
    v_sub_nombre := 'Sin subsistema';
  else
    select nombre into v_sub_nombre from mtto_subsistemas where equipo_codigo = v_mtto_eq.codigo and codigo = v_sub and activo;
    if v_sub_nombre is null then
      raise exception 'Elige el subsistema de la lista.';
    end if;
  end if;
  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la parada.';
  end if;
  -- Tiempo de reparación: opcional, solo registro (la pantalla lo pide solo a Mantenimiento).
  if v_reparacion is not null and v_reparacion not between 1 and 43200 then
    raise exception 'El tiempo de reparación va en minutos (1 o más).';
  end if;
  if v_p.tipo_id is not distinct from v_tipo.id then
    v_nombre := v_p.tipo_nombre;
  else
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  end if;

  -- Lo cerrado queda fijo: si un turno cerrado ya contó un tramo, el comienzo
  -- no se toca y el fin no puede caer antes de su cierre.
  v_cierre := parada_cierre_turno_cerrado(p_parada_id);
  if v_cierre is not null then
    v_fin := hora_planta_a_timestamptz(p_fin, 'fin');
    if v_fin is null then
      raise exception 'La parada viene de un turno ya cerrado: pon la hora de fin.';
    end if;
    if v_fin < v_cierre then
      raise exception 'El fin no puede caer en un turno ya cerrado (cerró a las %).',
        to_char(v_cierre at time zone 'America/Caracas', 'DD/MM HH24:MI');
    end if;
    v_ini := v_p.inicio;
  else
    v_ini := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), v_p.inicio);
    v_fin := coalesce(hora_planta_a_timestamptz(p_fin, 'fin'), now());
    -- Los minutos mandan (dueña, 2026-10-27): el comienzo puede caer en un turno ya cerrado.
  end if;

  if v_ini > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_fin > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;
  if v_fin < v_ini then
    raise exception 'El fin no puede ser anterior al inicio.';
  end if;
  v_min := round(extract(epoch from (v_fin - v_ini)) / 60);

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      subsistema_codigo = left(v_sub, 40),
      subsistema_nombre = v_sub_nombre,
      mtto_equipo_codigo = v_mtto_eq.codigo,
      mtto_equipo_nombre = v_mtto_eq.nombre,
      solucion = left(v_solucion, 300),
      reparacion_min = v_reparacion,
      inicio = v_ini,
      fin = v_fin,
      pendiente = false,
      terminada_por = v_usuario_id,
      terminada_en = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Terminó la parada de la %s como «%s» (%s min): %s',
           (select nombre from lineas where id = v_p.linea_id), v_nombre, v_min, v_solucion),
    jsonb_build_object('inicio', v_p.inicio, 'fin', null, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('inicio', v_ini, 'fin', v_fin, 'tipo', v_nombre, 'subsistema', v_sub,
                       'minutos', v_min, 'solucion', v_solucion, 'reparacion_min', v_reparacion)
  );
end;
$$;
grant execute on function terminar_parada(text, uuid, text, text, text, text, text, text, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. listar_paradas(): copia de 20261112590000 + reparacion_min y equipo_nombre
-- ------------------------------------------------------------
drop function if exists listar_paradas(date, date, text, text, uuid, text);

create function listar_paradas(
  p_desde date,
  p_hasta date,
  p_linea text default null,
  p_clase text default null,
  p_turno_id uuid default null,
  p_area text default null
)
returns table (
  id uuid,
  turno_id uuid,
  clase text,
  origen text,
  linea_codigo text,
  turno_tipo text,
  tipo_codigo text,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio text,
  fin text,
  supervisor_nombre text,
  pendiente boolean,
  solucion text,
  la_termina_mantenimiento boolean,
  responsable text,
  subsistema_codigo text,
  lote text,
  sabor text,
  terminada_por_nombre text,
  abierta boolean,
  inicio_real text,
  mtto_equipo_codigo text,
  mtto_equipo_nombre text,
  subsistema_nombre text,
  reparacion_min integer,
  equipo_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id,
    p_turno_id,
    e.clase,
    e.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    tt.codigo,
    t.codigo,
    e.tipo_nombre,
    e.tiempo_guia_min,
    e.nota,
    e.justificacion_desvio,
    to_char(e.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(e.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    coalesce(pp.pendiente, false),
    pp.solucion,
    la_termina_mantenimiento(e.id),
    pp.responsable,
    pp.subsistema_codigo,
    pp.lote,
    pp.sabor,
    ut.nombre,
    -- El tramo de un turno cerrado trae fin, pero la parada puede seguir abierta.
    (pp.id is not null and pp.fin is null),
    -- e.inicio viene recortado al turno; este es el comienzo verdadero.
    to_char(coalesce(pp.inicio, e.inicio) at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    pp.mtto_equipo_codigo,
    pp.mtto_equipo_nombre,
    pp.subsistema_nombre,
    pp.reparacion_min,
    pe.nombre
  from paradas_efectivas_turno(p_turno_id) e
  join lineas l on l.id = e.linea_id
  join turnos tu on tu.id = p_turno_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas pp on pp.id = e.id
  left join paradas_tipos t on t.id = e.tipo_id
  left join paradas_equipos pe on pe.id = t.equipo_id
  left join usuarios u on u.id = e.creado_por
  left join usuarios ut on ut.id = pp.terminada_por
  where p_turno_id is not null
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or e.clase = p_clase)

  union all

  select
    p.id,
    p.turno_id,
    p.clase,
    p.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    coalesce(tt.codigo, turno_tipo_por_hora(p.inicio at time zone 'America/Caracas')),
    t.codigo,
    p.tipo_nombre,
    p.tiempo_guia_min,
    p.nota,
    p.justificacion_desvio,
    to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    p.pendiente,
    p.solucion,
    la_termina_mantenimiento(p.id),
    p.responsable,
    p.subsistema_codigo,
    p.lote,
    p.sabor,
    ut.nombre,
    (p.fin is null),
    to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    p.mtto_equipo_codigo,
    p.mtto_equipo_nombre,
    p.subsistema_nombre,
    p.reparacion_min,
    pe.nombre
  from paradas p
  join lineas l on l.id = p.linea_id
  join areas ar on ar.id = l.area_id
  left join turnos tu on tu.id = p.turno_id
  left join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join paradas_equipos pe on pe.id = t.equipo_id
  left join usuarios u on u.id = p.creado_por
  left join usuarios ut on ut.id = p.terminada_por
  where p_turno_id is null
    and (p.inicio at time zone 'America/Caracas')::date between p_desde and p_hasta
    and ((p_area is null and ar.codigo <> 'PRUEBAS') or ar.codigo = p_area)
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or p.clase = p_clase)

  order by 12 desc;
$$;
grant execute on function listar_paradas(date, date, text, text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Solicitudes: responsable también en la Inspección, elegido de la lista
-- ------------------------------------------------------------
-- Personal activo de Mantenimiento (rol o área), para elegir el responsable.
create or replace function listar_personal_mantenimiento(p_usuario text)
returns table (usuario text, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select u.usuario, coalesce(nullif(btrim(u.nombre), ''), u.usuario)
  from usuarios u
  where usuario_activo_sif(p_usuario)
    and u.activo
    and es_de_mantenimiento(u.usuario)
  order by 2;
$$;
grant execute on function listar_personal_mantenimiento(text) to anon, authenticated;

-- Inspección: queda Inspección con su responsable (en revisión). Intervención
-- pendiente: pasa a En reparación, como antes. En los dos queda la hora.
create or replace function asignar_responsable_sif(p_usuario text, p_sif_id uuid, p_responsable text, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_antes text;
  v_estado text;
  v_responsable text := nullif(trim(coalesce(p_responsable, '')), '');
begin
  if not tiene_permiso(p_usuario, 'SIF_GESTIONAR') then
    raise exception 'No tienes permiso para gestionar solicitudes de intervención.';
  end if;
  if v_responsable is null then
    raise exception 'Elige quién es el responsable.';
  end if;

  select estado into v_antes from solicitudes_intervencion where id = p_sif_id for update;
  if v_antes is null or v_antes not in ('INSPECCION', 'PENDIENTE') then
    raise exception 'La solicitud ya no espera responsable. Recarga la pantalla.';
  end if;
  if v_antes = 'INSPECCION' and exists (select 1 from solicitudes_intervencion where id = p_sif_id and responsable is not null) then
    raise exception 'La inspección ya tiene responsable. Recarga la pantalla.';
  end if;
  v_estado := case when v_antes = 'PENDIENTE' then 'EN_REPARACION' else 'INSPECCION' end;

  update solicitudes_intervencion
  set estado = v_estado, responsable = v_responsable, inicio_reparacion = now(),
      asignada_por = (select id from usuarios where usuario = lower(p_usuario))
  where id = p_sif_id
  returning codigo into v_codigo;

  perform registrar_auditoria(p_usuario, 'EDITAR', 'sif', p_sif_id::text, p_pagina,
    v_codigo || case when v_antes = 'PENDIENTE' then ': reparación iniciada, responsable ' else ': inspección en revisión, responsable ' end
      || v_responsable,
    jsonb_build_object('estado', v_antes, 'responsable', null),
    jsonb_build_object('estado', v_estado, 'responsable', v_responsable));
end;
$$;
grant execute on function asignar_responsable_sif(text, uuid, text, text) to anon, authenticated;

-- escalar_sif(): copia de 20261111690000. Una Inspección que ya tenía
-- responsable pasa a En reparación con él; una revisada vuelve a esperar
-- responsable (la revisión ya terminó).
create or replace function escalar_sif(p_sif_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update solicitudes_intervencion
  set estado = case when estado = 'INSPECCION' and responsable is not null then 'EN_REPARACION' else 'PENDIENTE' end,
      responsable = case when estado = 'INSPECCION' then responsable end,
      inicio_reparacion = case when estado = 'INSPECCION' and responsable is not null then inicio_reparacion end,
      escalada_en = now()
  where id = p_sif_id and estado in ('INSPECCION', 'REVISADA');
  if found then
    perform encolar_correo_sif(p_sif_id, p_motivo);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5. Primer ingreso: cédula opcional (copia de 20261102090000)
-- ------------------------------------------------------------
create or replace function completar_primer_ingreso(
  p_usuario text,
  p_password_actual text,
  p_password_nueva text,
  p_nombre text,
  p_cedula text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre_antes text;
  v_cedula_antes text;
  v_cedula text;
begin
  select id, nombre, cedula into v_id, v_nombre_antes, v_cedula_antes
  from usuarios
  where usuario = lower(p_usuario)
    and password_hash = extensions.crypt(p_password_actual, password_hash)
    and activo = true;

  if v_id is null then
    raise exception 'La contraseña actual no es correcta.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre y apellido.';
  end if;

  -- La cédula es opcional (dueña, 2026-10-28); si viene, con su formato.
  v_cedula := nullif(btrim(coalesce(p_cedula, '')), '');
  if v_cedula is not null and v_cedula !~ '^\d{1,2}\.\d{3}\.\d{3}$' then
    raise exception 'La cédula debe tener el formato XX.XXX.XXX o X.XXX.XXX.';
  end if;

  if p_password_nueva !~ '^\d{4}$' then
    raise exception 'La contraseña nueva debe ser de 4 dígitos.';
  end if;

  if p_password_nueva = '1234' then
    raise exception 'La contraseña nueva no puede ser 1234.';
  end if;

  update usuarios
  set nombre = trim(p_nombre),
      cedula = v_cedula,
      password_hash = extensions.crypt(p_password_nueva, extensions.gen_salt('bf')),
      debe_completar_perfil = false
  where id = v_id;

  perform registrar_auditoria(
    p_usuario, 'PRIMER_INGRESO', 'personal', v_id::text, 'Primer ingreso',
    format('%s completó su primer ingreso (datos y clave nueva)', trim(p_nombre)),
    jsonb_build_object('nombre', v_nombre_antes, 'cedula', v_cedula_antes),
    jsonb_build_object('nombre', trim(p_nombre), 'cedula', v_cedula)
  );
end;
$$;

grant execute on function completar_primer_ingreso(text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Rol ↔ área: Mantenimiento como Calidad y Servicios Industriales
--    (mismo criterio que rolPermitidoEnArea en src/lib/catalogos.ts).
--    Copia de 20261111290000 + las dos reglas de Mantenimiento. El trigger
--    solo mira altas y cambios de rol o área: quien ya esté mal puesto no se
--    toca hasta que lo editen (abajo se avisa quiénes son).
-- ------------------------------------------------------------
create or replace function fn_rol_area_calidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select codigo into v_rol from roles where id = new.rol_id;
  select codigo into v_area from areas where id = new.area_id;

  if v_area = 'CALIDAD' and v_rol not in ('CALIDAD', 'SUPERVISOR_CALIDAD') then
    raise exception 'En el área Calidad solo puede haber Analista de Calidad o Supervisor de Calidad.';
  end if;
  if v_rol in ('CALIDAD', 'SUPERVISOR_CALIDAD') and coalesce(v_area, '') not in ('CALIDAD', 'PRUEBAS') then
    raise exception 'El Analista y el Supervisor de Calidad van en el área Calidad (o en Pruebas para probar).';
  end if;
  if v_area = 'SERVICIOS_INDUSTRIALES' and v_rol <> 'SERVICIOS_INDUSTRIALES' then
    raise exception 'En el área Servicios Industriales solo va el rol Servicios Industriales.';
  end if;
  if v_rol = 'SERVICIOS_INDUSTRIALES' and coalesce(v_area, '') not in ('SERVICIOS_INDUSTRIALES', 'PRUEBAS') then
    raise exception 'El rol Servicios Industriales va en su área (o en Pruebas para probar).';
  end if;
  if v_area = 'MANTENIMIENTO' and v_rol not in ('MANTENIMIENTO', 'VISTA') then
    raise exception 'En el área Mantenimiento solo va el rol Mantenimiento (o Solo Vista).';
  end if;
  if v_rol = 'MANTENIMIENTO' and coalesce(v_area, '') not in ('MANTENIMIENTO', 'PRUEBAS') then
    raise exception 'El rol Mantenimiento va en su área (o en Pruebas para probar).';
  end if;
  if v_area = 'OTROS' and v_rol <> 'VISTA' then
    raise exception 'En el área Otros solo va Solo Vista.';
  end if;
  return new;
end;
$$;

-- Quiénes quedan fuera de la regla nueva (para corregirlos en Personal).
do $$
declare
  r record;
begin
  for r in
    select u.usuario, coalesce(u.nombre, u.usuario) as nombre, ro.codigo as rol, a.codigo as area
    from usuario_roles ur
    join usuarios u on u.id = ur.usuario_id and u.activo
    join roles ro on ro.id = ur.rol_id
    left join areas a on a.id = ur.area_id
    where (a.codigo = 'MANTENIMIENTO' and ro.codigo not in ('MANTENIMIENTO', 'VISTA'))
       or (ro.codigo = 'MANTENIMIENTO' and coalesce(a.codigo, '') not in ('MANTENIMIENTO', 'PRUEBAS'))
  loop
    raise notice 'Revisar en Personal: % (%) tiene rol % en el área %', r.nombre, r.usuario, r.rol, coalesce(r.area, 'sin área');
  end loop;
end;
$$;
