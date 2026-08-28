-- ============================================================
-- PROGRAMACIÓN DIARIA (versión mínima): sabor + cajas planificadas
-- ============================================================
-- Qué se planificó producir en la jornada (la empresa corre 7am→7am;
-- la fecha de jornada la resuelve el frontend). Por ahora es solo
-- sabor + cajas — sin turnos, sin conexión con nada más. La edita solo
-- el SUPERADMINISTRADOR; el resto de los usuarios la ve de solo
-- lectura. El Panel de Producción usa este plan para el carrusel
-- "Programación diaria" (hecho / plan por sabor).
-- ============================================================

create table programacion_dia (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  fecha date not null,
  sabor_id uuid not null references sabores (id),
  cajas_plan integer not null default 0 check (cajas_plan >= 0),
  actualizada_por uuid references usuarios (id),
  actualizada_en timestamptz not null default now(),
  unique (area_id, fecha, sabor_id)
);

alter table programacion_dia enable row level security;

-- ------------------------------------------------------------
-- Lectura: el plan del día de un área. Devuelve jsonb (array de
-- objetos) — mismo criterio que turno_json y el resto del esquema; así
-- se evita el choque de nombres entre las columnas OUT de un
-- "returns table" y las columnas reales de programacion_dia.
-- ------------------------------------------------------------
create or replace function programacion_dia_de(p_area_codigo text, p_fecha date)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sabor_id', pd.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, f.nombre),
        'cajas_plan', pd.cajas_plan
      )
      order by pd.cajas_plan desc, s.nombre
    ),
    '[]'::jsonb
  )
  from programacion_dia pd
  join areas a on a.id = pd.area_id
  join sabores s on s.id = pd.sabor_id
  left join familias_producto f on f.id = s.familia_id
  where a.codigo = p_area_codigo and pd.fecha = p_fecha;
$$;

grant execute on function programacion_dia_de(text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Guardar: reemplaza el set del día completo (upsert de lo que viene,
-- borra lo que ya no está). Solo SUPERADMINISTRADOR.
-- p_items: [{ "sabor_id": uuid, "cajas_plan": int }, ...]
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

  delete from programacion_dia pd
  where pd.area_id = v_area_id
    and pd.fecha = p_fecha
    and pd.sabor_id not in (
      select (elem ->> 'sabor_id')::uuid
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
    );

  insert into programacion_dia (area_id, fecha, sabor_id, cajas_plan, actualizada_por, actualizada_en)
  select v_area_id, p_fecha, (elem ->> 'sabor_id')::uuid, greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0), v_usuario_id, now()
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  on conflict (area_id, fecha, sabor_id) do update
    set cajas_plan = excluded.cajas_plan,
        actualizada_por = excluded.actualizada_por,
        actualizada_en = excluded.actualizada_en;

  return programacion_dia_de(p_area_codigo, p_fecha);
end;
$$;

grant execute on function guardar_programacion_dia(text, text, date, jsonb) to anon, authenticated;
