-- ============================================================
-- RESUMEN DEL DÍA + VALIDAR, en una sola página
-- ============================================================
-- (dueño, 2026-10-01) Validar se une al Resumen del Día y ahora valida
-- solo las CAJAS producidas (paletas + cajas sueltas). Lo primero que se
-- ve son los números del supervisor; si una corrida se corrige, el
-- resumen y el mensaje toman la corrección.
--
-- resumen_produccion_dia() pasa a devolver una fila por corrida (turno +
-- línea) con Producto Terminado en la jornada (turnos.fecha: 7:00 a
-- 7:00), con lo del supervisor y su validación (validacion_produccion,
-- 20261005). La confirmación / corrección siguen siendo
-- confirmar_produccion() y editar_produccion_validada() (20261078).
--
-- Entra quien tenga el permiso VALIDAR (Analista, Jefe de Producción),
-- el Super Administrador o el dueño. Solo el nombre del sabor.
-- ============================================================

drop function if exists resumen_produccion_dia(text, text, date);

create function resumen_produccion_dia(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  turno_linea_id uuid,
  turno_codigo text,
  turno_tipo_codigo text,
  turno_cerrado boolean,
  linea_codigo text,
  linea_nombre text,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  lote text,
  cajas_x_paleta integer,
  paletas integer,
  cajas_sueltas integer,
  estado_validacion text,
  paletas_validadas integer,
  cajas_sueltas_validadas integer,
  nota text,
  validado_por_nombre text,
  validado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    tiene_permiso(p_usuario, 'VALIDAR')
    or coalesce(es_superadmin(p_usuario), false)
    or coalesce(es_dueno(p_usuario), false)
  ) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select
    tl.id,
    t.codigo,
    tt.codigo,
    t.estado = 'CERRADO',
    l.codigo,
    l.nombre,
    s.nombre,
    pr.volumen_ml,
    tl.lote,
    pt.cajas_x_paleta,
    pt.paletas,
    pt.cajas_sueltas,
    vp.estado,
    vp.paletas,
    vp.cajas_sueltas,
    vp.nota,
    vu.nombre,
    vp.validado_en
  from producto_terminado pt
  join turno_lineas tl on tl.id = pt.turno_linea_id
  join turnos t on t.id = pt.turno_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  left join sabores s on s.id = pt.sabor_id
  left join validacion_produccion vp on vp.turno_linea_id = tl.id
  left join usuarios vu on vu.id = vp.validado_por
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  order by tt.codigo, l.codigo, tl.activada_en;
end;
$$;

grant execute on function resumen_produccion_dia(text, text, date) to anon, authenticated;
