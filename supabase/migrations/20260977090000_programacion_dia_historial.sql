-- ============================================================
-- AUDITORÍA DE LA PROGRAMACIÓN DIARIA
-- ============================================================
-- programacion_dia solo guarda el estado ACTUAL (última edición por /
-- cuándo). Cada guardado pisa el valor anterior y los renglones que se
-- quitan se borran, así que no quedaba forma de saber "qué agregó /
-- cambió / quitó cada quien" en el plan.
--
-- Esta migración agrega una tabla append-only que guarda_programacion_dia()
-- llena con el DIFF (viejo vs. nuevo) en cada guardado, y un RPC para
-- listarla en Auditoría. Solo SUPERADMINISTRADOR (igual que el resto
-- de Auditoría y que la edición de la programación).
-- ============================================================

create table programacion_dia_historial (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  fecha date not null,                                  -- jornada planificada
  sabor_id uuid not null references sabores (id),
  presentacion_id uuid not null references presentaciones (id),
  accion text not null check (accion in ('ALTA', 'CAMBIO', 'BAJA')),
  cajas_antes integer,                                  -- null en ALTA
  cajas_despues integer,                                -- null en BAJA
  usuario_id uuid references usuarios (id),
  creado_en timestamptz not null default now()
);

alter table programacion_dia_historial enable row level security;
create index programacion_dia_historial_creado_en_idx on programacion_dia_historial (creado_en desc);

-- ------------------------------------------------------------
-- Guardar: igual que 20260973, pero registra el diff en el historial
-- ANTES de tocar programacion_dia. Clave del renglón = sabor + presentación.
-- ------------------------------------------------------------
create or replace function guardar_programacion_dia(
  p_usuario text,
  p_area_codigo text,
  p_fecha date,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
  v_usuario_id uuid;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo el Super Administrador puede editar la programación.';
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_area_id is null then
    raise exception 'Área no encontrada.';
  end if;

  -- Historial: una fila por cada renglón que cambió (alta, baja o
  -- distinto número de cajas). Los renglones sin cambios no se registran.
  with nuevos as (
    select
      (elem ->> 'sabor_id')::uuid as sabor_id,
      (elem ->> 'presentacion_id')::uuid as presentacion_id,
      greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0) as cajas
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  ),
  viejos as (
    select sabor_id, presentacion_id, cajas_plan as cajas
    from programacion_dia
    where area_id = v_area_id and fecha = p_fecha
  )
  insert into programacion_dia_historial
    (area_id, fecha, sabor_id, presentacion_id, accion, cajas_antes, cajas_despues, usuario_id)
  select
    v_area_id,
    p_fecha,
    coalesce(n.sabor_id, v.sabor_id),
    coalesce(n.presentacion_id, v.presentacion_id),
    case
      when v.sabor_id is null then 'ALTA'
      when n.sabor_id is null then 'BAJA'
      else 'CAMBIO'
    end,
    v.cajas,
    n.cajas,
    v_usuario_id
  from nuevos n
  full outer join viejos v
    on v.sabor_id = n.sabor_id and v.presentacion_id = n.presentacion_id
  where v.sabor_id is null
     or n.sabor_id is null
     or n.cajas is distinct from v.cajas;

  delete from programacion_dia pd
  where pd.area_id = v_area_id
    and pd.fecha = p_fecha
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
      where (elem ->> 'sabor_id')::uuid = pd.sabor_id
        and (elem ->> 'presentacion_id')::uuid = pd.presentacion_id
    );

  insert into programacion_dia (area_id, fecha, sabor_id, presentacion_id, cajas_plan, actualizada_por, actualizada_en)
  select
    v_area_id,
    p_fecha,
    (elem ->> 'sabor_id')::uuid,
    (elem ->> 'presentacion_id')::uuid,
    greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0),
    v_usuario_id,
    now()
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  on conflict (area_id, fecha, sabor_id, presentacion_id) do update
    set cajas_plan = excluded.cajas_plan,
        actualizada_por = excluded.actualizada_por,
        actualizada_en = excluded.actualizada_en;

  return programacion_dia_de(p_area_codigo, p_fecha);
end;
$$;

grant execute on function guardar_programacion_dia(text, text, date, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Lectura: cambios de programación por fecha de EDICIÓN (creado_en),
-- más nuevo primero. Solo SUPERADMINISTRADOR. El filtro "solo míos" lo
-- hace el frontend con usuario_usuario.
-- ------------------------------------------------------------
create or replace function listar_programacion_historial(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  creado_en timestamptz,
  usuario_nombre text,
  usuario_usuario text,
  area_codigo text,
  fecha_jornada date,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  accion text,
  cajas_antes integer,
  cajas_despues integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select
    h.creado_en,
    u.nombre,
    u.usuario,
    a.codigo,
    h.fecha,
    sabor_display(s.nombre, f.nombre),
    p.volumen_ml::int,
    h.accion,
    h.cajas_antes,
    h.cajas_despues
  from programacion_dia_historial h
  join areas a on a.id = h.area_id
  join sabores s on s.id = h.sabor_id
  left join familias_producto f on f.id = s.familia_id
  join presentaciones p on p.id = h.presentacion_id
  left join usuarios u on u.id = h.usuario_id
  where (p_fecha_desde is null or h.creado_en::date >= p_fecha_desde)
    and (p_fecha_hasta is null or h.creado_en::date <= p_fecha_hasta)
  order by h.creado_en desc;
end;
$$;

grant execute on function listar_programacion_historial(text, date, date) to anon, authenticated;
