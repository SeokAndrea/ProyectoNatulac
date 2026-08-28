-- ============================================================
-- PRODUCCIÓN DIARIA: lo HECHO en la jornada, sumando los 3 turnos
-- ============================================================
-- El Panel de Producción mostraba Cajas / Litros y el "hecho" del
-- carrusel de Programación tomándolos solo del turno cargado en vivo.
-- Al abrir un turno nuevo (turno más reciente = "en vivo"), ese turno
-- todavía no produjo nada y el banner caía a 0, aunque los turnos
-- anteriores de la MISMA jornada sí habían producido.
--
-- Esta función devuelve el acumulado del día (todos los turnos con esa
-- turnos.fecha en el área), agrupado por sabor + presentación, en el
-- mismo formato y con el mismo criterio de nombre (sabor_display) que
-- programacion_dia_de() — así el carrusel puede cruzar plan vs. hecho
-- por la misma clave.
-- ============================================================

create or replace function produccion_dia_de(p_area_codigo text, p_fecha date)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sabor_nombre', x.sabor_nombre,
        'presentacion_volumen_ml', x.volumen_ml,
        'cajas', x.cajas,
        'litros', x.litros
      )
      order by x.cajas desc, x.sabor_nombre, x.volumen_ml
    ),
    '[]'::jsonb
  )
  from (
    select
      sabor_display(s.nombre, f.nombre) as sabor_nombre,
      pr.volumen_ml,
      sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint as cajas,
      sum(pt.litros_producidos)::numeric as litros
    from producto_terminado pt
    join turnos t on t.id = pt.turno_id
    join areas a on a.id = t.area_id
    join presentaciones pr on pr.id = pt.presentacion_id
    left join sabores s on s.id = pt.sabor_id
    left join familias_producto f on f.id = s.familia_id
    where a.codigo = p_area_codigo and t.fecha = p_fecha
    group by sabor_display(s.nombre, f.nombre), pr.volumen_ml
  ) x;
$$;

grant execute on function produccion_dia_de(text, date) to anon, authenticated;
