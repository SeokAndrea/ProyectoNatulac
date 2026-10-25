-- ============================================================
-- SIF: PRIMERO INSPECCIÓN (3.ª FALLA), DESPUÉS INTERVENCIÓN (4.ª)
-- ============================================================
-- Dueña, 2026-10-25. Sobre 20261109390000 (Solicitudes de Intervención):
--
--   * A la 3.ª falla del mismo código en la línea en la jornada ya no nace
--     una Intervención: nace una Solicitud de INSPECCIÓN (amarilla, solo
--     aviso). Mantenimiento la puede marcar REVISADA (con una nota opcional).
--   * Con la 4.ª falla la MISMA solicitud sube a Intervención (PENDIENTE,
--     mismo código, las 4 fallas en su historial) y sigue como siempre:
--     responsable → EN_REPARACION → CERRADA. Sube igual si ya la habían
--     marcado revisada en esa jornada y la falla volvió.
--   * Una Inspección sin revisar no vence: sigue sumando fallas aunque pase
--     la jornada, y la que llega a 4 la sube.
--   * Cerrada una Intervención, una sola falla nueva en la jornada del
--     cierre genera otra Intervención directa (como antes).
--   * Cada Inspección nueva y cada subida a Intervención dejan un correo en
--     correos_pendientes; lo manda el servicio "correo" (correo/servidor.mjs)
--     a los destinatarios de su configuración. Las de Pruebas van con
--     "[Pruebas]" en el asunto.
-- Las que ya existen quedan como están (son Intervenciones).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estados y columnas nuevas
-- ------------------------------------------------------------
alter table solicitudes_intervencion drop constraint if exists solicitudes_intervencion_estado_check;
alter table solicitudes_intervencion add constraint solicitudes_intervencion_estado_check
  check (estado in ('INSPECCION', 'REVISADA', 'PENDIENTE', 'EN_REPARACION', 'CERRADA'));

alter table solicitudes_intervencion
  add column if not exists escalada_en timestamptz,
  add column if not exists revisada_en timestamptz,
  add column if not exists revisada_por uuid references usuarios (id),
  add column if not exists revision text;

-- Una sola abierta por línea y código: REVISADA ya no cuenta como abierta.
drop index if exists solicitudes_intervencion_una_abierta_uidx;
create unique index solicitudes_intervencion_una_abierta_uidx
  on solicitudes_intervencion (linea_id, tipo_id) where estado not in ('CERRADA', 'REVISADA');

-- ------------------------------------------------------------
-- 2. Cola de correos (la vacía el servicio "correo")
-- ------------------------------------------------------------
create table if not exists correos_pendientes (
  id uuid primary key default gen_random_uuid(),
  asunto text not null,
  cuerpo text not null,
  -- Ruta dentro de la app (el servicio le antepone APP_URL).
  enlace text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  intentos integer not null default 0,
  ultimo_error text
);
create index if not exists correos_pendientes_sin_enviar_idx on correos_pendientes (creado_en) where enviado_en is null;
alter table correos_pendientes enable row level security;

create or replace function encolar_correo_sif(p_sif_id uuid, p_motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into correos_pendientes (asunto, cuerpo, enlace)
  select
    case when a.codigo = 'PRUEBAS' then '[Pruebas] ' else '' end
      || case when s.estado = 'INSPECCION' then 'Solicitud de Inspección ' else 'Solicitud de Intervención ' end
      || s.codigo || ' · ' || l.nombre || ' · ' || t.nombre,
    concat_ws(E'\n',
      p_motivo,
      '',
      'Línea: ' || l.nombre || ' (' || a.nombre || ')',
      'Falla: ' || t.nombre || ' (' || t.codigo || ')',
      'Equipo: ' || coalesce(e.nombre, '—'),
      'Generada: ' || to_char(s.generada_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI')),
    '/solicitudes-intervencion?sif=' || s.id
  from solicitudes_intervencion s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  where s.id = p_sif_id;
$$;

-- ------------------------------------------------------------
-- 3. Reglas
-- ------------------------------------------------------------
drop function if exists crear_sif(uuid, uuid, timestamptz);
create or replace function crear_sif(p_linea_id uuid, p_tipo_id uuid, p_inicio_jornada timestamptz, p_estado text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := (p_inicio_jornada at time zone 'America/Caracas')::date;
  v_numero integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sif_numero_' || v_fecha::text));
  select coalesce(max(numero), 0) + 1 into v_numero from solicitudes_intervencion where fecha_jornada = v_fecha;
  -- escalada_en queda null: solo la pone escalar_sif (así se sabe que pasó por Inspección).
  insert into solicitudes_intervencion (codigo, fecha_jornada, numero, linea_id, tipo_id, estado)
  values ('SIF' || to_char(v_fecha, 'YYYYMMDD') || '_' || v_numero, v_fecha, v_numero, p_linea_id, p_tipo_id, p_estado)
  returning id into v_id;
  return v_id;
end;
$$;

/** Inspección (abierta o revisada) → Intervención pendiente, con su correo. */
create or replace function escalar_sif(p_sif_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update solicitudes_intervencion
  set estado = 'PENDIENTE', escalada_en = now()
  where id = p_sif_id and estado in ('INSPECCION', 'REVISADA');
  if found then
    perform encolar_correo_sif(p_sif_id, p_motivo);
  end if;
end;
$$;

-- Antes de guardar cada parada: la suma a la solicitud abierta, la sube de nivel o genera una nueva.
create or replace function fn_paradas_sif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
  v_abierta uuid;
  v_estado text;
  v_revisada uuid;
  v_previas integer;
  v_sif uuid;
begin
  if new.sif_id is not null or new.tipo_id is null or not tipo_cuenta_para_sif(new.tipo_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('sif_' || new.linea_id::text || '_' || new.tipo_id::text));

  -- 1. Abierta: se suma a su historial. Una Inspección sube con la 4.ª falla.
  select id, estado into v_abierta, v_estado
  from solicitudes_intervencion
  where linea_id = new.linea_id and tipo_id = new.tipo_id and estado not in ('CERRADA', 'REVISADA');
  if v_abierta is not null then
    new.sif_id := v_abierta;
    if v_estado = 'INSPECCION'
       and (select count(*) from paradas p where p.sif_id = v_abierta and p.id is distinct from new.id) + 1 >= 4 then
      perform escalar_sif(v_abierta, 'La falla llegó a la 4.ª: la inspección pasa a intervención.');
    end if;
    return new;
  end if;

  v_desde := inicio_jornada_planta(new.inicio);
  v_hasta := v_desde + interval '1 day';

  -- 2. Inspección de esta jornada (o revisada en ella) ya revisada y la falla volvió: la misma
  --    sube a Intervención. Sin mirar si la falla empezó antes de la revisión: el Sheet de
  --    Mantenimiento carga tarde, y lo que cuenta es que es la 4.ª del día.
  select id into v_revisada
  from solicitudes_intervencion
  where linea_id = new.linea_id and tipo_id = new.tipo_id and estado = 'REVISADA'
    and (fecha_jornada = (v_desde at time zone 'America/Caracas')::date
         or (revisada_en >= v_desde and revisada_en < v_hasta))
  order by revisada_en desc
  limit 1;
  if v_revisada is not null then
    new.sif_id := v_revisada;
    perform escalar_sif(v_revisada, 'La falla volvió después de la inspección: pasa a intervención.');
    return new;
  end if;

  -- 3. Intervención cerrada en esta jornada y la falla volvió: una sola alcanza.
  if exists (
    select 1 from solicitudes_intervencion
    where linea_id = new.linea_id and tipo_id = new.tipo_id and estado = 'CERRADA'
      and cierre >= v_desde and cierre < v_hasta and cierre <= new.inicio
  ) then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_desde, 'PENDIENTE');
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, 'La falla volvió después de cerrar la intervención anterior.');
    return new;
  end if;

  -- 4. Tercera del día sin solicitud: nace la Inspección y se le suman las anteriores.
  select count(*) into v_previas
  from paradas p
  where p.linea_id = new.linea_id and p.tipo_id = new.tipo_id and p.sif_id is null
    and p.inicio >= v_desde and p.inicio < v_hasta
    and p.id is distinct from new.id;
  if v_previas + 1 >= 3 then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_desde, 'INSPECCION');
    update paradas p
    set sif_id = v_sif
    where p.linea_id = new.linea_id and p.tipo_id = new.tipo_id and p.sif_id is null
      and p.inicio >= v_desde and p.inicio < v_hasta
      and p.id is distinct from new.id;
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, 'La misma falla se repitió 3 veces en la jornada: hay que inspeccionar.');
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Lectura: las columnas nuevas (cambia el tipo de salida → drop)
-- ------------------------------------------------------------
drop function if exists listar_sif(text, integer);
create or replace function listar_sif(p_usuario text, p_cerradas integer default 100)
returns table (
  sif_id uuid,
  codigo text,
  fecha_jornada date,
  estado text,
  generada_en timestamptz,
  escalada_en timestamptz,
  revisada_en timestamptz,
  revisada_por text,
  revision text,
  responsable text,
  inicio_reparacion timestamptz,
  trabajo_realizado text,
  entregada_a text,
  cierre timestamptz,
  linea_codigo text,
  linea_nombre text,
  area_codigo text,
  area_nombre text,
  tipo_codigo text,
  tipo_nombre text,
  equipo_nombre text,
  fallas integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
begin
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;
  -- Todo calificado: las columnas de salida (estado, cierre, area_codigo…) se llaman igual que las de las tablas.
  select r.area_codigo into v_area from rol_y_area_de(p_usuario) r;

  return query
  with visibles as (
    select si.*
    from solicitudes_intervencion si
    join lineas li on li.id = si.linea_id
    join areas ar on ar.id = li.area_id
    where (ar.codigo <> 'PRUEBAS' or v_area = 'PRUEBAS')
  ),
  elegidas as (
    select v.* from visibles v where v.estado not in ('CERRADA', 'REVISADA')
    union all
    (select v.* from visibles v where v.estado in ('CERRADA', 'REVISADA')
     order by coalesce(v.cierre, v.revisada_en) desc limit p_cerradas)
  )
  select s.id, s.codigo, s.fecha_jornada, s.estado, s.generada_en, s.escalada_en,
         s.revisada_en, coalesce(ur.nombre, ur.usuario), s.revision,
         s.responsable, s.inicio_reparacion, s.trabajo_realizado, s.entregada_a, s.cierre,
         l.codigo, l.nombre, a.codigo, a.nombre, t.codigo, t.nombre, e.nombre,
         (select count(*)::integer from paradas p where p.sif_id = s.id)
  from elegidas s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  left join usuarios ur on ur.id = s.revisada_por
  order by case s.estado when 'PENDIENTE' then 0 when 'INSPECCION' then 1 when 'EN_REPARACION' then 2 else 3 end,
           coalesce(s.cierre, s.revisada_en, s.escalada_en, s.generada_en) desc;
end;
$$;
grant execute on function listar_sif(text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Escritura: marcar revisada una Inspección (SIF_GESTIONAR)
-- ------------------------------------------------------------
create or replace function marcar_revisada_sif(p_usuario text, p_sif_id uuid, p_revision text default null, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_revision text := nullif(trim(coalesce(p_revision, '')), '');
begin
  if not tiene_permiso(p_usuario, 'SIF_GESTIONAR') then
    raise exception 'No tienes permiso para gestionar solicitudes de intervención.';
  end if;

  update solicitudes_intervencion
  set estado = 'REVISADA', revisada_en = now(), revision = v_revision,
      revisada_por = (select id from usuarios where usuario = lower(p_usuario))
  where id = p_sif_id and estado = 'INSPECCION'
  returning codigo into v_codigo;
  if v_codigo is null then
    raise exception 'La solicitud ya no está en inspección. Recarga la pantalla.';
  end if;

  perform registrar_auditoria(p_usuario, 'EDITAR', 'sif', p_sif_id::text, p_pagina,
    v_codigo || ': inspección revisada' || coalesce(' (' || v_revision || ')', ''),
    jsonb_build_object('estado', 'INSPECCION'),
    jsonb_build_object('estado', 'REVISADA', 'revision', v_revision));
end;
$$;
grant execute on function marcar_revisada_sif(text, uuid, text, text) to anon, authenticated;
