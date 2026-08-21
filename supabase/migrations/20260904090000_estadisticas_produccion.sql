-- ============================================================
-- ESTADÍSTICAS DE PRODUCCIÓN (Dashboard de Planta / Mis Estadísticas)
-- ============================================================
-- Primera versión del dashboard descrito en
-- resumen-diseno-dashboard-natulac.md, construida sobre lo que YA
-- existe (turnos, contadores, producto_terminado) — sin el modelo de
-- "corridas" ni catálogo de paradas, todavía sin construir.
--
-- Incluye turnos ABIERTOS y CERRADOS: las estadísticas se van sumando
-- a medida que el supervisor carga contadores durante el turno, no
-- recién al finalizar. Un turno abierto no tiene hora_fin todavía
-- (el frontend usa la hora actual como aproximación, ver
-- src/lib/estadisticas.ts) y probablemente no tenga Producto
-- Terminado cargado — por eso "estado" viaja en el resultado, para
-- que el frontend sepa cuál es cuál.
--
-- Devuelve UNA FILA POR (turno, línea) que estuvo activa en ese
-- turno, con los contadores sumados y el producto terminado de esa
-- combinación — el cálculo de merma teórica/real y horas de
-- producción se hace en el frontend (src/lib/estadisticas.ts), para
-- poder recortar por fecha/línea/supervisor sin tener que duplicar
-- la función SQL por cada corte.
--
-- Sin restricción de rol a propósito (ver la sección "Roles y
-- acceso" del documento de diseño: los filtros quedan abiertos para
-- todos, lo que cambia por rol es el valor inicial en la interfaz,
-- no el acceso al dato).
-- ============================================================

create or replace function estadisticas_produccion(p_fecha_desde date default null, p_fecha_hasta date default null)
returns table (
  turno_id uuid,
  turno_codigo text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  estado text,
  turno_tipo_codigo text,
  grupo_codigo text,
  area_codigo text,
  supervisor_usuario text,
  supervisor_nombre text,
  linea_codigo text,
  envases_llenadora bigint,
  envases_buenos bigint,
  envases_desechados bigint,
  paletas integer,
  cajas_sueltas integer,
  cajas_x_paleta integer,
  envases_x_caja integer,
  litros_producidos numeric,
  sabor_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.id,
    t.codigo,
    t.fecha,
    t.hora_inicio,
    t.hora_fin,
    t.estado,
    tt.codigo,
    g.codigo,
    a.codigo,
    u.usuario,
    u.nombre,
    tl.linea_codigo,
    coalesce(ct.envases_llenadora, 0),
    coalesce(ct.envases_buenos, 0),
    coalesce(ct.envases_desechados, 0),
    coalesce(pt.paletas, 0),
    coalesce(pt.cajas_sueltas, 0),
    coalesce(pr.cajas_x_paleta, 0),
    coalesce(pr.envases_x_caja, 0),
    coalesce(pt.litros_producidos, 0),
    s.nombre
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join (
    select tli.turno_id, l.id as linea_id, l.codigo as linea_codigo
    from turno_lineas tli
    join lineas l on l.id = tli.linea_id
  ) tl on tl.turno_id = t.id
  left join lateral (
    select
      sum(c.envases_llenadora) as envases_llenadora,
      sum(c.envases_buenos) as envases_buenos,
      sum(c.envases_desechados) as envases_desechados
    from contadores c
    where c.turno_id = t.id and c.linea_id = tl.linea_id
  ) ct on true
  left join producto_terminado pt on pt.turno_id = t.id and pt.linea_id = tl.linea_id
  left join presentaciones pr on pr.id = pt.presentacion_id
  left join sabores s on s.id = pt.sabor_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
  order by t.fecha desc, t.hora_inicio desc, tl.linea_codigo;
end;
$$;

grant execute on function estadisticas_produccion(date, date) to anon, authenticated;
