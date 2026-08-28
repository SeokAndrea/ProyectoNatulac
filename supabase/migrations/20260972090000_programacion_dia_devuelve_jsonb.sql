-- ============================================================
-- FIX: "column reference sabor_id is ambiguous" en Programación
-- ============================================================
-- programacion_dia_de() y guardar_programacion_dia() (20260970) usaban
-- "returns table (sabor_id uuid, sabor_nombre text, cajas_plan integer)".
-- Esas columnas OUT quedan como variables dentro de la función y chocan
-- con las columnas reales de programacion_dia en el ON CONFLICT / el
-- SELECT — Postgres lanza "column reference \"sabor_id\" is ambiguous"
-- al llamarlas.
--
-- Solución: devolver jsonb (array de objetos), igual que turno_json y
-- el resto del esquema. El frontend ya lee un array de
-- { sabor_id, sabor_nombre, cajas_plan }, así que no cambia nada del
-- lado del cliente. Como cambia el tipo de retorno hay que DROP + CREATE
-- (create or replace no permite cambiar el return type).
-- ============================================================

drop function if exists programacion_dia_de(text, date);
drop function if exists guardar_programacion_dia(text, text, date, jsonb);

create function programacion_dia_de(p_area_codigo text, p_fecha date)
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

create function guardar_programacion_dia(
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
