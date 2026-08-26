-- ============================================================
-- CERRAR EL LOTE EN CUANTO SE AGOTA, SIN ESPERAR "TERMINÓ SABOR"
-- ============================================================
-- registrar_producto_terminado() ya restaba litros del tanque desde
-- 20260927090000_volumen_por_producto_terminado.sql, pero la decisión
-- de poner el tanque Sucio/Standby y avisarle a las líneas ("Terminó
-- el Lote") solo pasaba por cerrar_corrida_si_esperando() — y esa
-- función se corta de entrada si la corrida sigue activa (ver
-- 20260928090000_cerrar_corrida_desde_contador_o_producto.sql). En la
-- práctica: si una línea sigue activa y su Producto Terminado deja el
-- tanque en 0, no pasaba NADA — la corrida seguía "activa" sacando de
-- un tanque que ya no tiene nada.
--
-- El volumen en 0 es una señal física, no depende de que alguien haya
-- tocado "Terminó Sabor" todavía: si el tanque se vació, ninguna línea
-- puede seguir sacando de él. Se agrega ese cierre acá, directo en
-- registrar_producto_terminado(), sin importar si la corrida sigue
-- activa — le pone Sucio al tanque y "Terminó el Lote" a TODAS las
-- líneas que lo estaban tomando (incluida la que lo vació, esté activa
-- o no), para que aparezca la misma elección de siempre (Terminó Sabor
-- / Continuar al Siguiente Lote) en Preparación y Producción.
--
-- El caso de volumen > 0 (Standby, resto que no es exactamente 0)
-- sigue reservado para cuando la corrida YA paró (cerrar_corrida_si_esperando)
-- — ahí sí puede haber más dato por cargar, no se fuerza nada.
--
-- continuar_siguiente_lote() YA avisa con un error claro
-- ("Todavía no hay ningún tanque Listo con el Lote %") cuando no hay
-- tanque liberado con el lote siguiente — no hace falta tocarla.
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
  v_lote_sabor_id uuid;
  v_lote_lote text;
  v_tanque_condicion text;
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

    select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_nuevo_volumen, v_lote_sabor_id, v_lote_lote
    from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      select condicion into v_tanque_condicion
      from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

      if v_tanque_condicion = 'LISTO' and coalesce(v_nuevo_volumen, 0) <= 0 then
        update recepcion_tanques
        set condicion = 'SUCIO',
            sabor_id = null,
            volumen_l = null,
            lote = null,
            lote_id = null,
            activada_en = now(),
            ultimo_sabor_id = v_lote_sabor_id,
            ultimo_lote = 'Restos del lote ' || coalesce(v_lote_lote, '?')
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

        update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

        update turno_lineas
        set lote_terminado_en = now()
        where lote_id = v_lote_id and activa;
      else
        update recepcion_tanques
        set volumen_l = v_nuevo_volumen
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      end if;
    end if;
  end if;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
