-- ============================================================
-- ESTADISTICAS_PRODUCCION: suma volumen_ml de la presentación
-- ============================================================
-- Para poder calcular la merma de SEMIELABORADO (litros consumidos de
-- tanque vs. litros producidos) también del turno pasado en el Panel
-- de Producción (hoy esa comparación solo existe para el turno en
-- curso, ver mermaSemielaboradoTurno en src/lib/panelProduccion.ts),
-- hace falta el volumen_ml de la presentación de cada corrida — con
-- eso se puede derivar litros_consumidos = envases_llenadora ×
-- volumen_ml / 1000, igual que ya hace registrar_producto_terminado()
-- en el backend.
-- ============================================================

drop function if exists estadisticas_produccion(date, date, text);

create or replace function estadisticas_produccion(p_fecha_desde date default null, p_fecha_hasta date default null, p_area_codigo text default null)
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
  turno_linea_id uuid,
  envases_llenadora bigint,
  paletas integer,
  cajas_sueltas integer,
  cajas_x_paleta integer,
  envases_x_caja integer,
  volumen_ml integer,
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
    l.codigo,
    tl.id,
    coalesce(ct.envases_llenadora, 0),
    coalesce(pt.paletas, 0),
    coalesce(pt.cajas_sueltas, 0),
    coalesce(pr.cajas_x_paleta, 0),
    coalesce(pr.envases_x_caja, 0),
    pr.volumen_ml,
    coalesce(pt.litros_producidos, 0),
    s.nombre || ' (' || fs.nombre || ')'
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join turno_lineas tl on tl.turno_id = t.id
  join lineas l on l.id = tl.linea_id
  left join lateral (
    select sum(c.envases_llenadora) as envases_llenadora
    from contadores c
    where c.turno_linea_id = tl.id
  ) ct on true
  left join producto_terminado pt on pt.turno_linea_id = tl.id
  left join presentaciones pr on pr.id = pt.presentacion_id
  left join sabores s on s.id = pt.sabor_id
  left join familias_producto fs on fs.id = s.familia_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc, l.codigo, tl.activada_en;
end;
$$;

grant execute on function estadisticas_produccion(date, date, text) to anon, authenticated;
