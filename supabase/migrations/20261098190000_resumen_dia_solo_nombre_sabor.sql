-- ============================================================
-- RESUMEN DEL DÍA: solo el nombre del sabor
-- ============================================================
-- resumen_produccion_dia() (20261098) usaba sabor_display(), que le suma
-- la familia a algunos sabores ("Manzana (Premium)", "Manzana 35%"). En el
-- resumen y en el mensaje va solo el nombre del sabor (dueño, 2026-10-01).
-- Un mismo nombre en dos familias, en la misma presentación y línea, se
-- suma en una sola fila.
-- ============================================================

create or replace function resumen_produccion_dia(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  sabor_nombre text,
  presentacion_volumen_ml integer,
  linea_codigo text,
  linea_nombre text,
  cajas bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_superadmin(p_usuario), false) or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'Solo el Super Administrador puede ver el resumen del día.';
  end if;

  return query
  select
    s.nombre,
    pr.volumen_ml,
    l.codigo,
    l.nombre,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  left join sabores s on s.id = pt.sabor_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by s.nombre, pr.volumen_ml, l.codigo, l.nombre
  order by l.codigo, pr.volumen_ml, 1;
end;
$$;

grant execute on function resumen_produccion_dia(text, text, date) to anon, authenticated;
