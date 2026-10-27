-- ============================================================
-- PARADAS: Responsable, Terminar parada y reporte congelado
-- ============================================================
-- Dueña, 2026-10-26 (rework final). Producción inicia; Mantenimiento
-- finaliza las suyas en la app, con los códigos de su Sheet. El Sheet queda
-- apagado.
--
--   * paradas.responsable (OPERACIONAL | MANTENIMIENTO): lo elige quien abre
--     la parada. Reemplaza la regla «origen distinto de MANUAL». Las ya
--     guardadas se convierten con la regla de hoy: del Sheet o registrada
--     por alguien de Mantenimiento → MANTENIMIENTO; el resto → OPERACIONAL
--     (lo que corrige 20261112150000: la marca de origen sola no basta).
--   * Reporte congelado: lote, sabor, subsistema_codigo, solucion,
--     terminada_por, terminada_en (creado_por ya dice quién la abrió).
--   * pausar_linea(): pide el Responsable; Equipo y Falla obligatorios (ya no
--     acepta «Falla sin especificar»); copia lote y sabor de la corrida.
--   * terminar_parada(): reemplaza a finalizar_falla y clasificar_falla.
--     Código (equipo y falla + subsistema), qué se hizo y la hora de fin. Si
--     la parada ya cruzó un turno cerrado, el comienzo queda fijo y se pide
--     el fin (el tramo del turno cerrado no cambia).
--   * abrir_parada_mantenimiento(): Mantenimiento abre la suya desde la
--     tarjeta de la línea; pausa la corrida solo si la línea está corriendo.
--   * Interruptor «Mantenimiento termina las fallas» por área
--     (areas.mantenimiento_finaliza), como el de Calidad. Encendido: solo
--     Mantenimiento termina las de Mantenimiento y el supervisor no les da
--     Continuar. Apagado (Aséptico por ahora): el supervisor también puede.
--   * Sheet apagado: se quitan sincronizar_paradas_mantenimiento y su puente.
--   * listar_paradas() y paradas_que_detienen_lineas(): + los campos nuevos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas
-- ------------------------------------------------------------
alter table paradas add column if not exists responsable text
  check (responsable in ('OPERACIONAL', 'MANTENIMIENTO'));
alter table paradas add column if not exists subsistema_codigo text;
alter table paradas add column if not exists lote text;
alter table paradas add column if not exists sabor text;
alter table paradas add column if not exists solucion text;
alter table paradas add column if not exists terminada_por uuid references usuarios(id);
alter table paradas add column if not exists terminada_en timestamptz;
-- De un borrador anterior de esta migración (no se usan).
alter table paradas drop column if exists clasificada_por;
alter table paradas drop column if exists clasificada_en;

comment on column paradas.responsable is
  'Quién termina la parada: OPERACIONAL (el supervisor) o MANTENIMIENTO (20261112590000).';
comment on column paradas.subsistema_codigo is 'Código del subsistema (Sheet de Mantenimiento) al terminarla.';
comment on column paradas.lote is 'Lote de la corrida al parar (reporte congelado).';
comment on column paradas.sabor is 'Sabor de la corrida al parar (reporte congelado).';
comment on column paradas.solucion is 'Qué se hizo para resolver la parada.';
comment on column paradas.terminada_por is 'Quién la terminó con Terminar parada.';

alter table areas add column if not exists mantenimiento_finaliza boolean not null default false;
update areas set mantenimiento_finaliza = true where codigo = 'PRUEBAS';
comment on column areas.mantenimiento_finaliza is
  'Encendido: las paradas de Mantenimiento solo las termina Mantenimiento (20261112590000).';

-- ------------------------------------------------------------
-- 2. Responsable de las ya guardadas y de las que entran sin él
-- ------------------------------------------------------------
-- Igual que en 20261112150000: tiene el rol o el área Mantenimiento.
create or replace function es_de_mantenimiento(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from usuarios u
    join usuario_roles ur on ur.usuario_id = u.id
    left join roles r on r.id = ur.rol_id
    left join areas a on a.id = ur.area_id
    where u.usuario = lower(p_usuario)
      and (r.codigo = 'MANTENIMIENTO' or a.codigo = 'MANTENIMIENTO')
  );
$$;
revoke execute on function es_de_mantenimiento(text) from public, anon, authenticated;

-- La regla de hoy: del Sheet o registrada por alguien de Mantenimiento.
create or replace function responsable_por_defecto(p_origen text, p_creado_por uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_origen = 'SHEET'
      or coalesce((select es_de_mantenimiento(u.usuario) from usuarios u where u.id = p_creado_por), false)
      then 'MANTENIMIENTO'
    else 'OPERACIONAL'
  end;
$$;
revoke execute on function responsable_por_defecto(text, uuid) from public, anon, authenticated;

do $$
declare
  v_mtto integer;
  v_oper integer;
begin
  update paradas set responsable = responsable_por_defecto(origen, creado_por) where responsable is null;
  select count(*) filter (where responsable = 'MANTENIMIENTO'), count(*) filter (where responsable = 'OPERACIONAL')
    into v_mtto, v_oper from paradas;
  if v_mtto + v_oper > 0 then
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'paradas', 'responsable', 'Migración 20261112590000',
      format('Responsable de las paradas ya guardadas: %s Operacionales, %s de Mantenimiento', v_oper, v_mtto),
      null,
      jsonb_build_object('operacionales', v_oper, 'mantenimiento', v_mtto)
    );
  end if;
end;
$$;

-- Registrar Paradas, la página de Mantenimiento y el CIP no lo pasan: va la regla de hoy.
create or replace function paradas_responsable_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable is null then
    new.responsable := responsable_por_defecto(new.origen, new.creado_por);
  end if;
  return new;
end;
$$;

drop trigger if exists paradas_responsable_por_defecto on paradas;
create trigger paradas_responsable_por_defecto
before insert on paradas
for each row execute function paradas_responsable_por_defecto();

alter table paradas alter column responsable set not null;

-- ------------------------------------------------------------
-- 3. Interruptor por área
-- ------------------------------------------------------------
-- Parada de Mantenimiento abierta, en un área donde la termina Mantenimiento.
create or replace function la_termina_mantenimiento(p_parada_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select p.fin is null
       and not p.pendiente
       and p.responsable = 'MANTENIMIENTO'
       and a.mantenimiento_finaliza
    from paradas p
    join lineas l on l.id = p.linea_id
    join areas a on a.id = l.area_id
    where p.id = p_parada_id
  ), false);
$$;
revoke execute on function la_termina_mantenimiento(uuid) from public, anon, authenticated;

-- Para el front (Ajustes de planta y Mantenimiento). Sin área: Aséptico.
create or replace function mantenimiento_finaliza_area(p_area_codigo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select mantenimiento_finaliza from areas where codigo = coalesce(p_area_codigo, 'ASEPTICO')), false);
$$;
grant execute on function mantenimiento_finaliza_area(text) to anon, authenticated;

create or replace function guardar_mantenimiento_finaliza(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes boolean;
begin
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  select id, mantenimiento_finaliza into v_area_id, v_antes from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Esa área no existe.';
  end if;
  update areas set mantenimiento_finaliza = p_activo where id = v_area_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'mantenimiento_finaliza', v_area_id::text, 'Edición de Datos',
    case when p_activo then 'Prendió' else 'Apagó' end || ' "Mantenimiento termina las fallas" en ' || p_area_codigo,
    jsonb_build_object('mantenimiento_finaliza', v_antes), jsonb_build_object('mantenimiento_finaliza', p_activo)
  );
end;
$$;
grant execute on function guardar_mantenimiento_finaliza(text, text, boolean) to anon, authenticated;

-- Ahora lo dice el Responsable. Continuar, Detener línea y CIP dejan abiertas
-- las de Mantenimiento (la línea sigue) para que las termine quien corresponde.
create or replace function parada_de_mantenimiento(p_parada_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.responsable = 'MANTENIMIENTO' from paradas p where p.id = p_parada_id), false);
$$;
revoke execute on function parada_de_mantenimiento(uuid) from public, anon, authenticated;

-- Hora en que cerró el último turno cerrado que ya contó un tramo de la
-- parada (null si no cruzó ninguno). Mismo corte que paradas_efectivas_turno():
-- un turno cerrado cuenta hasta su fecha_fin + hora_fin.
create or replace function parada_cierre_turno_cerrado(p_parada_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select max((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas')
  from paradas p
  join lineas l on l.id = p.linea_id
  join turnos tu on tu.area_id = l.area_id
                and tu.estado = 'CERRADO'
                and tu.fecha_fin is not null and tu.hora_fin is not null
  where p.id = p_parada_id
    and (tu.id = p.turno_id
         or (p.turno_id is null and ((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas') > p.inicio));
$$;
grant execute on function parada_cierre_turno_cerrado(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. pausar_linea(): con Responsable; copia de 20261111590000.
-- ------------------------------------------------------------
drop function if exists pausar_linea(text, uuid, uuid, text, text, text);

create or replace function pausar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text,
  p_tipo_codigo text,
  p_responsable text,
  p_inicio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_linea_nombre text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_parada_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  perform area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null
  for update;
  if not found then
    return turno_json(p_turno_id);  -- ya estaba en pausa o no está activa: no hace nada
  end if;
  select nombre into v_linea_nombre from lineas where id = v_c.linea_id;

  if coalesce(p_responsable, '') not in ('OPERACIONAL', 'MANTENIMIENTO') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_c.linea_id, (select area_id from lineas where id = v_c.linea_id));
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_inicio < v_c.activada_en then
    raise exception 'La parada no puede empezar antes de que arrancara la corrida (%).',
      to_char(v_c.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI');
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor)
  values (null, v_c.linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_nombre, v_guia, left(v_motivo, 140),
          v_inicio, null, false, v_usuario_id, p_responsable,
          coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)),
          (select s.nombre from sabores s where s.id = v_c.sabor_id))
  returning id into v_parada_id;

  update turno_lineas
  set pausada_en = v_inicio,
      pausa_motivo = v_motivo,
      actualizada_por = v_usuario_id
  where id = v_c.id;

  insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
  values (p_turno_id, v_c.linea_id, 'LISTA', v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_parada_id::text, 'Líneas (Parada)',
    format('Parada %s «%s» en %s desde las %s: %s',
           case when p_responsable = 'MANTENIMIENTO' then 'de Mantenimiento' else 'Operacional' end,
           v_nombre, v_linea_nombre, to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'), v_motivo),
    null,
    jsonb_build_object('linea_id', v_c.linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_motivo,
                       'responsable', p_responsable, 'turno_linea_id', v_c.id)
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function pausar_linea(text, uuid, uuid, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. terminar_parada(): reemplaza a finalizar_falla y clasificar_falla.
-- ------------------------------------------------------------
drop function if exists finalizar_falla(text, uuid, text, text, text);
drop function if exists clasificar_falla(text, uuid, text, text, text);

-- Código (equipo y falla + subsistema), qué se hizo y la hora de fin (sin
-- ella, ahora). Al cerrarse, la línea sigue sola (paradas_mueven_lineas →
-- reanudar_lineas_de_parada).
create or replace function terminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_fin text default null,
  p_inicio text default null,
  p_pagina text default 'Reportes de paradas'
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
  v_cierre timestamptz;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
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

  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el código de la parada del catálogo.';
  end if;
  if v_sub is null then
    raise exception 'Escribe el código del subsistema.';
  end if;
  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la parada.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));

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
    if v_ini is distinct from v_p.inicio and exists (
      select 1
      from lineas l
      join turnos tu on tu.area_id = l.area_id
      where l.id = v_p.linea_id
        and tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
        and ((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas') > v_ini
    ) then
      raise exception 'El comienzo no puede caer en un turno ya cerrado.';
    end if;
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
      solucion = left(v_solucion, 300),
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
                       'minutos', v_min, 'solucion', v_solucion)
  );
end;
$$;
grant execute on function terminar_parada(text, uuid, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. abrir_parada_mantenimiento(): Mantenimiento abre la suya. Si la línea
--    está corriendo, pausa la corrida; si no (libre, CIP, esperando PT, o ya
--    en pausa), solo queda anotada.
-- ------------------------------------------------------------
create or replace function abrir_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_nota text,
  p_inicio text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_c turno_lineas;
  v_corre boolean := false;
  v_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;

  if v_nota is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_linea_id, v_area_id);
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;

  -- La corrida de la línea en el turno abierto del área.
  select tl.* into v_c
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id and t.estado = 'ABIERTO' and t.area_id = v_area_id
  where tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1
  for update of tl;
  -- Corriendo: activa, sin pausa, sin lote terminado, fuera de CIP. Una
  -- parada de antes de que arrancara la corrida no la detiene (como
  -- aplicar_paradas_a_lineas).
  v_corre := v_c.id is not null
    and v_c.pausada_en is null
    and v_c.lote_terminado_en is null
    and v_inicio >= v_c.activada_en
    and coalesce((select condicion from lineas_estado where turno_id = v_c.turno_id and linea_id = v_linea_id), '') <> 'CIP';

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor)
  values (null, v_linea_id, v_tipo.id, v_tipo.clase,
          case when es_de_mantenimiento(p_usuario) then 'MANTENIMIENTO' else 'MANUAL' end,
          v_nombre, v_guia, left(v_nota, 140), v_inicio, null, false, v_usuario_id, 'MANTENIMIENTO',
          case when v_c.id is not null
               then coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)) end,
          case when v_c.id is not null then (select s.nombre from sabores s where s.id = v_c.sabor_id) end)
  returning id into v_id;

  if v_corre then
    -- El trigger pudo haberla puesto en Parada ya (inicio de hace 15 min o más).
    update turno_lineas
    set pausada_en = v_inicio, pausa_motivo = left(v_nota, 140), actualizada_por = v_usuario_id
    where id = v_c.id and pausada_en is null;

    insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
    values (v_c.turno_id, v_linea_id, 'LISTA', v_id, v_usuario_id)
    on conflict (turno_id, linea_id) do update
      set parada_id = excluded.parada_id,
          actualizada_por = excluded.actualizada_por;
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, 'Líneas (Mantenimiento)',
    format('Parada de Mantenimiento «%s» en %s desde las %s%s: %s', v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'),
           case when v_corre then ' (pausó la corrida)' else '' end, v_nota),
    null,
    jsonb_build_object('linea_id', v_linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_nota,
                       'responsable', 'MANTENIMIENTO', 'pauso_corrida', v_corre)
  );
  return v_id;
end;
$$;
grant execute on function abrir_parada_mantenimiento(text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. continuar_linea(): copia de 20261111590000 que no deja continuar una
--    parada que termina Mantenimiento.
-- ------------------------------------------------------------
create or replace function continuar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_justificacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_le lineas_estado;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa for update;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en Registrar Paradas antes de continuar.';
    end if;
    if v_le.parada_id is not null and la_termina_mantenimiento(v_le.parada_id) then
      raise exception 'Esta parada la termina Mantenimiento: la línea sigue sola cuando la terminen.';
    end if;

    perform soltar_parada_de_linea(p_usuario, p_turno_id, v_c.linea_id, 'Líneas (Continuar)', p_justificacion, true);
    -- Las demás paradas abiertas de la línea (de Mantenimiento) ya no la vuelven a poner en Parada.
    update paradas
    set linea_siguio_en = now()
    where linea_id = v_c.linea_id and fin is null and not pendiente and linea_siguio_en is null;
  end if;

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_c.id is not null and v_c.pausada_en is not null then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'turno_lineas', v_c.id::text, 'Líneas',
      format('Continuó la %s', (select nombre from lineas where id = v_c.linea_id)),
      jsonb_build_object('pausada_en', v_c.pausada_en),
      jsonb_build_object('pausada_en', null)
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;
grant execute on function continuar_linea(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. paradas_que_detienen_lineas(): igual que 20261111590000 +
--    la_termina_mantenimiento y responsable.
-- ------------------------------------------------------------
drop function if exists paradas_que_detienen_lineas(uuid);
create function paradas_que_detienen_lineas(p_turno_id uuid)
returns table (
  linea_codigo text,
  parada_id uuid,
  pendiente boolean,
  tipo_nombre text,
  clase text,
  tiempo_guia_min numeric,
  nota text,
  inicio text,
  fin text,
  de_mantenimiento boolean,
  la_termina_mantenimiento boolean,
  responsable text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.codigo, p.id, p.pendiente, p.tipo_nombre, p.clase, p.tiempo_guia_min, p.nota,
         to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         p.responsable = 'MANTENIMIENTO',
         la_termina_mantenimiento(p.id),
         p.responsable
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join paradas p on p.id = le.parada_id
  where le.turno_id = p_turno_id;
$$;
grant execute on function paradas_que_detienen_lineas(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Sheet de Mantenimiento apagado: sin sincronización ni puente.
-- ------------------------------------------------------------
drop trigger if exists paradas_puente_sheet on paradas;
drop function if exists paradas_puente_sheet();
drop function if exists sincronizar_paradas_mantenimiento(text, jsonb);
drop function if exists sincronizar_paradas_mantenimiento_base(text, jsonb);

-- ------------------------------------------------------------
-- 10. listar_paradas(): igual que 20261090 + solucion, la_termina_mantenimiento
--     y los campos del reporte al final.
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
  abierta boolean
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
    (pp.id is not null and pp.fin is null)
  from paradas_efectivas_turno(p_turno_id) e
  join lineas l on l.id = e.linea_id
  join turnos tu on tu.id = p_turno_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas pp on pp.id = e.id
  left join paradas_tipos t on t.id = e.tipo_id
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
    (p.fin is null)
  from paradas p
  join lineas l on l.id = p.linea_id
  join areas ar on ar.id = l.area_id
  left join turnos tu on tu.id = p.turno_id
  left join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
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
-- 11. Quién y cuándo terminó la parada, sea cual sea la salida que la cierre
--     (Continuar, Detener línea, CIP, Cerrar de Mantenimiento, Completar).
--     El reporte congelado no puede mostrar «terminada por» en blanco.
-- ------------------------------------------------------------

-- soltar_parada_de_linea(): copia de 20261111590000 + terminada_por / terminada_en.
create or replace function soltar_parada_de_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_id uuid,
  p_pagina text,
  p_justificacion text default null,
  p_exigir_justificacion boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_le lineas_estado;
  v_p paradas;
  v_min integer;
  v_just text := nullif(btrim(coalesce(p_justificacion, '')), '');
  v_pasada boolean;
  v_usuario_id uuid := (select id from usuarios where usuario = lower(p_usuario));
begin
  select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = p_linea_id for update;
  if v_le.parada_id is null then
    return;
  end if;
  select * into v_p from paradas where id = v_le.parada_id for update;
  if v_p.pendiente then
    return;
  end if;

  -- Primero se suelta: así cerrar la parada no hace seguir la línea sola (trigger).
  update lineas_estado set parada_id = null where id = v_le.id;
  if v_p.fin is not null then
    return;
  end if;

  if parada_de_mantenimiento(v_p.id) then
    update paradas set linea_siguio_en = now() where id = v_p.id;
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'paradas', v_p.id::text, p_pagina,
      format('La %s siguió; la parada «%s» de Mantenimiento sigue abierta',
             (select nombre from lineas where id = p_linea_id), v_p.tipo_nombre),
      jsonb_build_object('linea_siguio_en', null),
      jsonb_build_object('linea_siguio_en', now())
    );
    return;
  end if;

  v_min := round(extract(epoch from (now() - v_p.inicio)) / 60);
  v_pasada := v_p.clase = 'PROGRAMADA' and v_p.tiempo_guia_min is not null and v_min > v_p.tiempo_guia_min;
  if p_exigir_justificacion and v_pasada and v_just is null then
    raise exception 'La parada duró % min y su tiempo guía es % min. Escribe la justificación.', v_min, round(v_p.tiempo_guia_min);
  end if;

  update paradas
  set fin = now(),
      justificacion_desvio = case when v_pasada then coalesce(v_just, justificacion_desvio) else null end,
      terminada_por = v_usuario_id,
      terminada_en = now()
  where id = v_p.id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', v_p.id::text, p_pagina,
    format('Terminó la parada «%s» de la %s (%s min)', v_p.tipo_nombre, (select nombre from lineas where id = p_linea_id), v_min),
    jsonb_build_object('fin', null),
    jsonb_build_object('fin', now(), 'minutos', v_min, 'justificacion', v_just)
  );
end;
$$;
revoke execute on function soltar_parada_de_linea(text, uuid, uuid, text, text, boolean) from public, anon, authenticated;

-- cerrar_parada_mantenimiento(): copia de 20261111590000 + terminada_por / terminada_en.
create or replace function cerrar_parada_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_fin text default null,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
  v_fin timestamptz;
  v_usuario_id uuid := (select id from usuarios where usuario = lower(p_usuario));
begin
  select * into v_p from paradas
  where id = p_parada_id and origen in ('MANTENIMIENTO', 'MANUAL') and not pendiente;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.fin is not null then
    raise exception 'La parada ya estaba cerrada.';
  end if;

  if coalesce(trim(p_fin), '') = '' then
    v_fin := now();
  else
    begin
      v_fin := (p_fin::timestamp) at time zone 'America/Caracas';
    exception when others then
      raise exception 'La hora de fin no es válida.';
    end;
  end if;
  if v_fin < v_p.inicio then
    raise exception 'El fin no puede ser anterior al inicio.';
  end if;
  if v_fin > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;

  -- Si tiene detenida una línea, la línea sigue sola (trigger paradas_mueven_lineas).
  update paradas
  set fin = v_fin, terminada_por = v_usuario_id, terminada_en = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Cerró la parada «%s» (%s min)', v_p.tipo_nombre,
           round(extract(epoch from (v_fin - v_p.inicio)) / 60)),
    jsonb_build_object('fin', null),
    jsonb_build_object('fin', v_fin)
  );
end;
$$;

-- completar_parada(): copia de 20261093090000 + terminada_por / terminada_en.
create or replace function completar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_minutos integer default null,
  p_inicio text default null,
  p_fin text default null,
  p_tipo_codigo text default null,
  p_justificacion text default null,
  p_pagina text default 'Registrar Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid := (select id from usuarios where usuario = lower(p_usuario));
  v_p paradas;
  v_tipo_actual text;
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
  v_just text := nullif(trim(coalesce(p_justificacion, '')), '');
begin
  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if not v_p.pendiente then
    raise exception 'Esa parada ya está completa.';
  end if;

  select codigo into v_tipo_actual from paradas_tipos where id = v_p.tipo_id;

  if v_tipo_actual = 'FALLA_SIN_ESPECIFICAR' then
    if coalesce(p_tipo_codigo, '') = '' then
      raise exception 'Elige el código y el equipo de la falla.';
    end if;
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.id is not null and (v_tipo.equipo_id is null or v_tipo.codigo = 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige una falla de equipo del catálogo.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  elsif v_tipo_actual = 'POR_CLASIFICAR' then
    if coalesce(p_tipo_codigo, '') = '' then
      raise exception 'Elige el tipo de la parada.';
    end if;
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige un tipo de parada del catálogo.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  else
    select * into v_tipo from paradas_tipos where id = v_p.tipo_id;
    v_nombre := v_p.tipo_nombre;
  end if;
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_ini := hora_planta_a_timestamptz(p_inicio, 'inicio');
  v_fin := hora_planta_a_timestamptz(p_fin, 'fin');
  if v_ini is not null or v_fin is not null then
    if v_ini is null or v_fin is null then
      raise exception 'Pon la hora de inicio y la de fin, o solo los minutos.';
    end if;
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  else
    if p_minutos is null or p_minutos <= 0 then
      raise exception 'Pon cuántos minutos duró la parada.';
    end if;
    if p_minutos > 30 * 24 * 60 then
      raise exception 'La parada no puede durar más de 30 días.';
    end if;
    v_ini := v_p.inicio;
    v_fin := v_ini + make_interval(mins => p_minutos);
    if v_fin > now() then
      v_fin := now();
      v_ini := v_fin - make_interval(mins => p_minutos);
    end if;
  end if;

  v_min := round(extract(epoch from (v_fin - v_ini)) / 60);
  if v_guia is not null and v_min > v_guia and v_just is null then
    raise exception 'La parada duró % min y su tiempo guía es % min. Escribe la justificación.', v_min, round(v_guia);
  end if;

  update paradas
  set tipo_id = v_tipo.id,
      clase = coalesce(v_tipo.clase, v_p.clase),  -- tiempo ocioso de texto libre: sin tipo, conserva su clase
      tipo_nombre = v_nombre,
      tiempo_guia_min = v_guia,
      inicio = v_ini,
      fin = v_fin,
      justificacion_desvio = case when v_guia is not null and v_min > v_guia then v_just else null end,
      pendiente = false,
      terminada_por = v_usuario_id,
      terminada_en = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Completó la parada «%s» (%s min)', v_nombre, v_min),
    jsonb_build_object('pendiente', true, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('pendiente', false, 'tipo', v_nombre, 'minutos', v_min, 'justificacion', v_just)
  );
end;
$$;

-- Red de seguridad para lo que cierra una parada sin pasar por una función de
-- arriba (p. ej. la LNPE que se corta sola al arrancar la línea): al menos
-- queda cuándo. Quién queda vacío porque no lo cerró una persona.
create or replace function paradas_terminada_en()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.terminada_en is null and not new.pendiente
     and ((old.fin is null and new.fin is not null) or old.pendiente) then
    new.terminada_en := now();
  end if;
  return new;
end;
$$;

drop trigger if exists paradas_terminada_en on paradas;
create trigger paradas_terminada_en
before update on paradas
for each row execute function paradas_terminada_en();

-- Las que se anotan ya cerradas (Registrar Paradas con minutos, CIP): las cerró
-- quien las anotó.
create or replace function paradas_responsable_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsable is null then
    new.responsable := responsable_por_defecto(new.origen, new.creado_por);
  end if;
  if new.fin is not null and not new.pendiente and new.fin <= now() + interval '1 minute'
     and new.terminada_en is null then
    new.terminada_en := now();
    new.terminada_por := coalesce(new.terminada_por, new.creado_por);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 12. listar_paradas_sif(): + responsable. Copia de 20261109390000.
--     El SIF rotula cada falla «Mantenimiento» o «Producción» por el
--     Responsable que se eligió al reportarla, no por el origen.
-- ------------------------------------------------------------
drop function if exists listar_paradas_sif(text, uuid);

create function listar_paradas_sif(p_usuario text, p_sif_id uuid)
returns table (
  parada_id uuid,
  inicio timestamptz,
  fin timestamptz,
  origen text,
  equipo text,
  subsistema text,
  registro text,
  responsable text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;

  return query
  select p.id, p.inicio, p.fin, p.origen,
         -- Del Sheet: lo que escribió Mantenimiento. De la app: el equipo del tipo y
         -- el tipo mismo (desde 20261064 la parada no guarda equipo propio: el tipo es la falla del equipo).
         case when p.origen = 'SHEET' then nullif(p.mtto_equipo, '') else te.nombre end,
         case when p.origen = 'SHEET' then nullif(p.mtto_subsistema, '') else t.nombre end,
         case when p.origen = 'SHEET' then 'Sheet de Mantenimiento' else coalesce(u.nombre, u.usuario) end,
         p.responsable
  from paradas p
  left join paradas_tipos t on t.id = p.tipo_id
  left join paradas_equipos te on te.id = t.equipo_id
  left join usuarios u on u.id = p.creado_por
  where p.sif_id = p_sif_id
  order by p.inicio;
end;
$$;
grant execute on function listar_paradas_sif(text, uuid) to anon, authenticated;
