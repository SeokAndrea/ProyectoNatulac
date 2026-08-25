-- ============================================================
-- PRODUCTO TERMINADO ADITIVO
-- ============================================================
-- registrar_producto_terminado() era upsert que REEMPLAZA paletas y
-- cajas_sueltas por lo último tipeado (decisión original: "es un
-- conteo final, no una serie de eventos como Contadores" — ver
-- supabase/migrations/20260831090000_producto_terminado.sql). En la
-- práctica el supervisor carga producto terminado varias veces
-- durante la misma corrida (a medida que van saliendo paletas), y
-- espera que cada carga se SUME a lo ya registrado — igual que ya
-- funciona el Contador (registrar_contador). Si escribe "1 paleta"
-- (140 cajas), tiene que sumarse a lo que ya había, no reemplazarlo.
--
-- sabor_id/presentacion_id/cajas_x_paleta/litros_x_caja siguen
-- reemplazándose (son atributos de la corrida, no cantidades que se
-- acumulan).
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
  v_sabor_nombre text;
  v_registro producto_terminado%rowtype;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select nombre into v_sabor_nombre from sabores where id = p_sabor_id;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = producto_terminado.paletas + excluded.paletas,
        cajas_sueltas = producto_terminado.cajas_sueltas + excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        updated_at = now()
  returning * into v_registro;

  return jsonb_build_object(
    'id', v_registro.id,
    'linea_codigo', p_linea_codigo,
    'turno_linea_id', v_registro.turno_linea_id,
    'sabor_id', v_registro.sabor_id,
    'sabor_nombre', v_sabor_nombre,
    'presentacion_volumen_ml', p_volumen_ml,
    'paletas', v_registro.paletas,
    'cajas_sueltas', v_registro.cajas_sueltas,
    'litros_producidos', v_registro.litros_producidos,
    'creado_en', v_registro.updated_at
  );
end;
$$;
