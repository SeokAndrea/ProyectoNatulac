-- ============================================================
-- RESUMEN DEL DÍA: la Pera Jucosa no se suma con la Pera clásica
-- ============================================================
-- Dueña, 2026-10-08: 20261098190000 dejó solo el nombre del sabor, y un
-- mismo nombre en dos familias se sumaba en una fila ("Pera" clásica +
-- "Pera" Jucosa). Son productos distintos.
--
-- Ahora: los Clásicos siguen con su nombre ("Pera"). Un sabor de otra
-- familia cuyo nombre se repite en otra familia lleva la familia al lado
-- ("Pera Jucosa", "Naranja Jucosa"). Los demás, igual que antes ("Pera
-- 35%", "Té de Durazno"). validacion_dia guarda el nombre que devuelve
-- esta función, así que las validaciones ya hechas de "Pera" siguen siendo
-- de la clásica.
-- ============================================================

-- Última versión: 20261099190000_validacion_dia.sql
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
  if not puede_validar_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  with pt_sabor as (
    select
      pt.*,
      case
        when s.id is null then null
        when fp.nombre in ('Clasicos', 'Clásicos') then s.nombre
        when exists (
          select 1 from sabores s2 where s2.nombre = s.nombre and s2.familia_id <> s.familia_id
        ) then s.nombre || ' ' || fp.nombre
        else s.nombre
      end as nombre_resumen
    from producto_terminado pt
    left join sabores s on s.id = pt.sabor_id
    left join familias_producto fp on fp.id = s.familia_id
  )
  select
    pt.nombre_resumen,
    pr.volumen_ml,
    l.codigo,
    l.nombre,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from pt_sabor pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by pt.nombre_resumen, pr.volumen_ml, l.codigo, l.nombre
  order by l.codigo, pr.volumen_ml, 1;
end;
$$;
grant execute on function resumen_produccion_dia(text, text, date) to anon, authenticated;
