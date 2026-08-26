-- ============================================================
-- PRODUCTO TERMINADO: EDITAR EL TOTAL, NO SUMAR
-- ============================================================
-- 20260923090000_producto_terminado_aditivo.sql había hecho que cada
-- carga SUME paletas/cajas_sueltas a lo ya cargado. En la práctica
-- esto confundía: el botón decía "Actualizar" pero si alguien quería
-- CORREGIR un número mal cargado (ej. tipeó 50 en vez de 5), escribir
-- "5" para corregirlo terminaba sumando 5 al 50 que ya estaba, en vez
-- de dejarlo en 5. Vuelve a ser edición directa del total: los campos
-- (ver src/pages/apps/ProductoTerminado.tsx) vienen prellenados con lo
-- ya cargado y guardar REEMPLAZA ese número.
--
-- El descuento de litros del tanque (registrar_producto_terminado, ver
-- 20260927090000_volumen_por_producto_terminado.sql) no necesita
-- cambiar: ya restaba el DELTA entre el total anterior y el nuevo —
-- si el total nuevo es más chico que el anterior (una corrección hacia
-- abajo), el delta da negativo y el volumen del tanque se ACREDITA de
-- vuelta, que es el comportamiento correcto también para una
-- corrección.
-- ============================================================

create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_registro producto_terminado%rowtype;
  v_litros_previos numeric;
  v_litros_delta numeric;
  v_lote_id uuid;
  v_numero_tanque smallint;
  v_nuevo_volumen numeric;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos into v_litros_previos from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_litros_previos := coalesce(v_litros_previos, 0);

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null then
    if v_litros_delta <> 0 then
      update preparaciones
      set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
      where id = v_lote_id and cerrado_en is null;
    end if;

    select numero_tanque, volumen_l into v_numero_tanque, v_nuevo_volumen from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      update recepcion_tanques
      set volumen_l = v_nuevo_volumen
      where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
    end if;
  end if;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
