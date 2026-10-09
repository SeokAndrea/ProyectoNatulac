-- ============================================================
-- SOLICITUDES DE INTERVENCIÓN DE FALLA (SIF)
-- ============================================================
-- Dueño, 2026-10-09. Cuando el mismo código de parada (tipo) se repite 3
-- veces en la misma línea en la jornada (7:00 → 7:00, hora de planta), se
-- genera sola una SIF para Mantenimiento. Vale igual para las paradas que
-- carga Producción en la app y para las que vienen del Sheet.
--
--   * Cuentan las fallas que registra Mantenimiento: NO_PROGRAMADA que no
--     sean Externas, Operacionales ni Ocioso, sin los comodines
--     FALLA_SIN_ESPECIFICAR y POR_CLASIFICAR. Una parada sin tipo (del Sheet
--     sin equivalencia, o un +1 sin completar) cuenta cuando se le asigna.
--   * Con la SIF de esa línea y código abierta, la parada nueva se suma a su
--     historial.
--   * Cerrada, una sola falla nueva del mismo código y línea en la misma
--     jornada del cierre genera otra SIF.
--   * Código: SIF + AAAAMMDD de la jornada + _ + número del día.
--   * PENDIENTE → (responsable, escrito a mano) EN_REPARACION → (trabajo
--     realizado y supervisor que recibe) CERRADA. Las horas las pone el
--     servidor. Cerrada no se edita.
--   * Gestiona quien tenga SIF_GESTIONAR (rol Mantenimiento); el resto de
--     los usuarios activos las ve en solo lectura.
-- Las paradas ya cargadas antes de esta migración no generan SIF por sí solas,
-- pero las de la jornada en curso cuentan para llegar a la tercera.
-- ============================================================

insert into permisos (codigo, nombre) values ('SIF_GESTIONAR', 'Gestionar solicitudes de intervención de falla')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'SIF_GESTIONAR' from roles r where r.codigo = 'MANTENIMIENTO'
on conflict do nothing;

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
create table solicitudes_intervencion (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  fecha_jornada date not null,
  numero integer not null,
  linea_id uuid not null references lineas (id),
  tipo_id uuid not null references paradas_tipos (id),
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'EN_REPARACION', 'CERRADA')),
  generada_en timestamptz not null default now(),
  responsable text,
  inicio_reparacion timestamptz,
  asignada_por uuid references usuarios (id),
  trabajo_realizado text,
  entregada_a text,
  cierre timestamptz,
  cerrada_por uuid references usuarios (id),
  unique (fecha_jornada, numero)
);
-- Una sola abierta por línea y código.
create unique index solicitudes_intervencion_una_abierta_uidx
  on solicitudes_intervencion (linea_id, tipo_id) where estado <> 'CERRADA';
alter table solicitudes_intervencion enable row level security;

alter table paradas add column if not exists sif_id uuid references solicitudes_intervencion (id) on delete set null;
create index if not exists paradas_sif_idx on paradas (sif_id) where sif_id is not null;

-- ------------------------------------------------------------
-- 2. Reglas
-- ------------------------------------------------------------
/** Inicio de la jornada (7:00 hora de planta) que contiene ese momento. */
create or replace function inicio_jornada_planta(p_momento timestamptz)
returns timestamptz
language sql
stable
as $$
  select ((((p_momento at time zone 'America/Caracas') - interval '7 hours')::date)::timestamp + interval '7 hours')
         at time zone 'America/Caracas';
$$;

create or replace function tipo_cuenta_para_sif(p_tipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select t.clase = 'NO_PROGRAMADA'
       and t.familia not in ('PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'OCIOSO')
       and t.codigo not in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR')
    from paradas_tipos t
    where t.id = p_tipo_id
  ), false);
$$;

create or replace function crear_sif(p_linea_id uuid, p_tipo_id uuid, p_inicio_jornada timestamptz)
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
  insert into solicitudes_intervencion (codigo, fecha_jornada, numero, linea_id, tipo_id)
  values ('SIF' || to_char(v_fecha, 'YYYYMMDD') || '_' || v_numero, v_fecha, v_numero, p_linea_id, p_tipo_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Antes de guardar cada parada: la suma a la SIF abierta, o genera una nueva.
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
  v_previas integer;
  v_sif uuid;
begin
  if new.sif_id is not null or new.tipo_id is null or not tipo_cuenta_para_sif(new.tipo_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('sif_' || new.linea_id::text || '_' || new.tipo_id::text));

  -- 1. Abierta: se suma a su historial.
  select id into v_abierta
  from solicitudes_intervencion
  where linea_id = new.linea_id and tipo_id = new.tipo_id and estado <> 'CERRADA';
  if v_abierta is not null then
    new.sif_id := v_abierta;
    return new;
  end if;

  v_desde := inicio_jornada_planta(new.inicio);
  v_hasta := v_desde + interval '1 day';

  -- 2. Se cerró en esta jornada y la falla volvió después: una sola alcanza.
  if exists (
    select 1 from solicitudes_intervencion
    where linea_id = new.linea_id and tipo_id = new.tipo_id and estado = 'CERRADA'
      and cierre >= v_desde and cierre < v_hasta and cierre <= new.inicio
  ) then
    new.sif_id := crear_sif(new.linea_id, new.tipo_id, v_desde);
    return new;
  end if;

  -- 3. Tercera del día sin SIF: se genera y se le suman las anteriores.
  select count(*) into v_previas
  from paradas p
  where p.linea_id = new.linea_id and p.tipo_id = new.tipo_id and p.sif_id is null
    and p.inicio >= v_desde and p.inicio < v_hasta
    and p.id is distinct from new.id;
  if v_previas + 1 >= 3 then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_desde);
    update paradas p
    set sif_id = v_sif
    where p.linea_id = new.linea_id and p.tipo_id = new.tipo_id and p.sif_id is null
      and p.inicio >= v_desde and p.inicio < v_hasta
      and p.id is distinct from new.id;
    new.sif_id := v_sif;
  end if;
  return new;
end;
$$;

-- Actualizar sif_id (paso 3) no vuelve a disparar el trigger: solo mira tipo, línea e inicio.
create trigger trg_paradas_sif
before insert or update of tipo_id, linea_id, inicio on paradas
for each row execute function fn_paradas_sif();

-- ------------------------------------------------------------
-- 3. Lecturas (cualquier usuario activo; Pruebas solo para su área)
-- ------------------------------------------------------------
create or replace function usuario_activo_sif(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from usuarios where usuario = lower(p_usuario) and activo);
$$;

create or replace function listar_sif(p_usuario text, p_cerradas integer default 100)
returns table (
  sif_id uuid,
  codigo text,
  fecha_jornada date,
  estado text,
  generada_en timestamptz,
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
    select v.* from visibles v where v.estado <> 'CERRADA'
    union all
    (select v.* from visibles v where v.estado = 'CERRADA' order by v.cierre desc limit p_cerradas)
  )
  select s.id, s.codigo, s.fecha_jornada, s.estado, s.generada_en, s.responsable, s.inicio_reparacion,
         s.trabajo_realizado, s.entregada_a, s.cierre,
         l.codigo, l.nombre, a.codigo, a.nombre, t.codigo, t.nombre, e.nombre,
         (select count(*)::integer from paradas p where p.sif_id = s.id)
  from elegidas s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  order by case s.estado when 'PENDIENTE' then 0 when 'EN_REPARACION' then 1 else 2 end,
           coalesce(s.cierre, s.generada_en) desc;
end;
$$;
grant execute on function listar_sif(text, integer) to anon, authenticated;

create or replace function listar_paradas_sif(p_usuario text, p_sif_id uuid)
returns table (
  parada_id uuid,
  inicio timestamptz,
  fin timestamptz,
  origen text,
  equipo text,
  subsistema text,
  registro text
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
         -- Del Sheet: lo que escribió Mantenimiento. De la app: el catálogo.
         case when p.origen = 'SHEET' then nullif(p.mtto_equipo, '') else coalesce(eq.nombre, te.nombre) end,
         case when p.origen = 'SHEET' then nullif(p.mtto_subsistema, '') else ss.nombre end,
         case when p.origen = 'SHEET' then 'Sheet de Mantenimiento' else coalesce(u.nombre, u.usuario) end
  from paradas p
  left join paradas_equipos eq on eq.id = p.equipo_id
  left join paradas_subsistemas ss on ss.id = p.subsistema_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join paradas_equipos te on te.id = t.equipo_id
  left join usuarios u on u.id = p.creado_por
  where p.sif_id = p_sif_id
  order by p.inicio;
end;
$$;
grant execute on function listar_paradas_sif(text, uuid) to anon, authenticated;

-- Supervisores de los turnos abiertos del área de la línea: a quién se le entrega.
create or replace function listar_supervisores_entrega_sif(p_usuario text, p_sif_id uuid)
returns table (nombre text, turno_codigo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;

  return query
  select coalesce(u.nombre, u.usuario), t.codigo
  from solicitudes_intervencion s
  join lineas l on l.id = s.linea_id
  join turnos t on t.area_id = l.area_id and t.estado = 'ABIERTO'
  join usuarios u on u.id = t.supervisor_id
  where s.id = p_sif_id
  order by t.fecha desc, t.hora_inicio desc;
end;
$$;
grant execute on function listar_supervisores_entrega_sif(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Escrituras (SIF_GESTIONAR)
-- ------------------------------------------------------------
create or replace function asignar_responsable_sif(p_usuario text, p_sif_id uuid, p_responsable text, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_responsable text := nullif(trim(coalesce(p_responsable, '')), '');
begin
  if not tiene_permiso(p_usuario, 'SIF_GESTIONAR') then
    raise exception 'No tienes permiso para gestionar solicitudes de intervención.';
  end if;
  if v_responsable is null then
    raise exception 'Escribe quién es el responsable de la reparación.';
  end if;

  update solicitudes_intervencion
  set estado = 'EN_REPARACION', responsable = v_responsable, inicio_reparacion = now(),
      asignada_por = (select id from usuarios where usuario = lower(p_usuario))
  where id = p_sif_id and estado = 'PENDIENTE'
  returning codigo into v_codigo;
  if v_codigo is null then
    raise exception 'La solicitud ya no está pendiente. Recarga la pantalla.';
  end if;

  perform registrar_auditoria(p_usuario, 'EDITAR', 'sif', p_sif_id::text, p_pagina,
    v_codigo || ': reparación iniciada, responsable ' || v_responsable,
    jsonb_build_object('estado', 'PENDIENTE'),
    jsonb_build_object('estado', 'EN_REPARACION', 'responsable', v_responsable));
end;
$$;
grant execute on function asignar_responsable_sif(text, uuid, text, text) to anon, authenticated;

create or replace function cerrar_sif(p_usuario text, p_sif_id uuid, p_trabajo text, p_entregada_a text, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_trabajo text := nullif(trim(coalesce(p_trabajo, '')), '');
  v_entregada text := nullif(trim(coalesce(p_entregada_a, '')), '');
begin
  if not tiene_permiso(p_usuario, 'SIF_GESTIONAR') then
    raise exception 'No tienes permiso para gestionar solicitudes de intervención.';
  end if;
  if v_trabajo is null then
    raise exception 'Escribe el trabajo realizado.';
  end if;
  if v_entregada is null then
    raise exception 'Elige a qué supervisor se le entrega.';
  end if;

  update solicitudes_intervencion
  set estado = 'CERRADA', trabajo_realizado = v_trabajo, entregada_a = v_entregada, cierre = now(),
      cerrada_por = (select id from usuarios where usuario = lower(p_usuario))
  where id = p_sif_id and estado = 'EN_REPARACION'
  returning codigo into v_codigo;
  if v_codigo is null then
    raise exception 'La solicitud no está en reparación. Recarga la pantalla.';
  end if;

  perform registrar_auditoria(p_usuario, 'EDITAR', 'sif', p_sif_id::text, p_pagina,
    v_codigo || ': cerrada, entregada a ' || v_entregada,
    jsonb_build_object('estado', 'EN_REPARACION'),
    jsonb_build_object('estado', 'CERRADA', 'trabajo_realizado', v_trabajo, 'entregada_a', v_entregada));
end;
$$;
grant execute on function cerrar_sif(text, uuid, text, text, text) to anon, authenticated;
