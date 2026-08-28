-- ============================================================
-- PROGRAMACIÓN DIARIA: el plan es por SABOR + PRESENTACIÓN
-- ============================================================
-- Las cajas dependen de la presentación (4000 cajas de 1000 ml ≠ 4000
-- de 250 ml), así que cada renglón del plan pasa a ser
-- sabor + presentación + cajas. La clave única incluye la presentación.
-- ============================================================

alter table programacion_dia add column presentacion_id uuid references presentaciones (id);

-- Datos previos (sin presentación) no sirven con el nuevo modelo — se
-- limpian; la programación es de hoy y se vuelve a cargar en segundos.
delete from programacion_dia where presentacion_id is null;

alter table programacion_dia alter column presentacion_id set not null;

alter table programacion_dia drop constraint if exists programacion_dia_area_id_fecha_sabor_id_key;
alter table programacion_dia add constraint programacion_dia_area_fecha_sabor_pres_key
  unique (area_id, fecha, sabor_id, presentacion_id);

-- ------------------------------------------------------------
-- Lectura: agrega presentacion_volumen_ml a cada renglón.
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
        'presentacion_id', pd.presentacion_id,
        'presentacion_volumen_ml', p.volumen_ml,
        'cajas_plan', pd.cajas_plan
      )
      order by pd.cajas_plan desc, s.nombre, p.volumen_ml
    ),
    '[]'::jsonb
  )
  from programacion_dia pd
  join areas a on a.id = pd.area_id
  join sabores s on s.id = pd.sabor_id
  left join familias_producto f on f.id = s.familia_id
  join presentaciones p on p.id = pd.presentacion_id
  where a.codigo = p_area_codigo and pd.fecha = p_fecha;
$$;

grant execute on function programacion_dia_de(text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Guardar: reemplaza el set del día. Clave = sabor + presentación.
-- p_items: [{ "sabor_id": uuid, "presentacion_id": uuid, "cajas_plan": int }, ...]
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
