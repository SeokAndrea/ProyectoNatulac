-- ============================================================
-- CORREGIR PRODUCTO TERMINADO DESDE AUDITORÍA (turnos reales, no solo los de Crear Turno)
-- ============================================================
-- Caso real: a Fernando le faltó cargar 1 paleta de un lote y el turno
-- ya está cerrado. Antes solo se podía ajustar un turno cargado por
-- "Crear Turno" (editar_fila_turno_manual, protegido con lote='ACTA').
-- Esto es para turnos REALES: Super Administrador o Administrador de
-- Área (de esa misma área) corrige paletas/cajas sueltas directo desde
-- el detalle de Auditoría.
--
-- No se reimplementa la lógica de litros/tanque — se llama a
-- registrar_producto_terminado() con los mismos datos que ya tenía la
-- fila (línea, sabor, presentación, retenido) y solo paletas/cajas
-- sueltas nuevos, así el delta de litros se calcula exactamente igual
-- que si el supervisor lo hubiera corregido él mismo en su turno. Si
-- el lote ya está cerrado (cerrado_en no nulo, caso normal en un turno
-- viejo), esa función ya se abstiene de tocar el volumen del tanque —
-- no hay riesgo de descuadrar un tanque que ya ni existe en la
-- pantalla en vivo.
-- ============================================================

create or replace function corregir_producto_terminado_auditoria(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer,
  p_cajas_sueltas integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_turno_id uuid;
  v_turno_area_codigo text;
  v_linea_codigo text;
  v_sabor_id uuid;
  v_volumen_ml integer;
  v_producto_retenido boolean;
  v_cajas_retenidas integer;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is null or v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tenés permiso para editar esto.';
  end if;

  select pt.turno_id, l.codigo, pt.sabor_id, p.volumen_ml, pt.producto_retenido, pt.cajas_retenidas
  into v_turno_id, v_linea_codigo, v_sabor_id, v_volumen_ml, v_producto_retenido, v_cajas_retenidas
  from producto_terminado pt
  join lineas l on l.id = pt.linea_id
  join presentaciones p on p.id = pt.presentacion_id
  where pt.turno_linea_id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'No se encontró Producto Terminado para esa corrida.';
  end if;

  select a.codigo into v_turno_area_codigo from turnos t join areas a on a.id = t.area_id where t.id = v_turno_id;
  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tenés permiso para editar esto.';
  end if;

  return registrar_producto_terminado(
    v_turno_id, p_turno_linea_id, v_linea_codigo, v_sabor_id, v_volumen_ml,
    p_paletas, p_cajas_sueltas, p_usuario, v_producto_retenido, v_cajas_retenidas
  );
end;
$$;

grant execute on function corregir_producto_terminado_auditoria(text, uuid, integer, integer) to anon, authenticated;
