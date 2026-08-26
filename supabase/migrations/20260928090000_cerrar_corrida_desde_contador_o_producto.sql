-- ============================================================
-- CERRAR "ESPERANDO CIERRE" DESDE CONTADOR *O* PRODUCTO TERMINADO
-- ============================================================
-- 20260927090000_volumen_por_producto_terminado.sql movió el cierre
-- de una corrida "esperando cierre" (Terminó Sabor sin contador/dato
-- final todavía) a registrar_producto_terminado() — pero eso dejó un
-- agujero: si el supervisor, después de Terminó Sabor, solo carga un
-- Contador final (sin sumar más paletas/cajas, porque ya las había
-- cargado todas antes), esa corrida se queda "esperando cierre" PARA
-- SIEMPRE — nunca se llama a registrar_producto_terminado(), así que
-- nunca se decide Sucio/Standby del tanque ni se cierra el lote.
--
-- Antes de esta migración, registrar_contador() SÍ cerraba la corrida
-- (ver 20260914090000_litros_consumidos_lote.sql) — se saca ese cierre
-- de ahí sin pensarlo bien. La solución: sacar el cierre a una función
-- compartida, cerrar_corrida_si_esperando(), y llamarla desde LAS DOS
-- (registrar_contador Y registrar_producto_terminado) — la que llegue
-- última (cualquiera de las dos) es la que efectivamente cierra la
-- corrida y decide el tanque. Es idempotente: si ya se cerró, la
-- segunda llamada no hace nada.
-- ============================================================

create or replace function cerrar_corrida_si_esperando(p_turno_id uuid, p_turno_linea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corrida_activa boolean;
  v_finalizada_en timestamptz;
  v_lote_id uuid;
  v_numero_tanque smallint;
  v_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
begin
  select tl.activa, tl.finalizada_en, tl.lote_id into v_corrida_activa, v_finalizada_en, v_lote_id
  from turno_lineas tl where tl.id = p_turno_linea_id;

  -- Solo corridas "esperando cierre" (ya no activas, todavía sin
  -- finalizar) — una corrida activa o ya finalizada no hace nada acá.
  if v_corrida_activa is not false or v_finalizada_en is not null then
    return;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  if v_lote_id is null then
    return;
  end if;

  select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_volumen, v_lote_sabor_id, v_lote_lote
  from preparaciones where id = v_lote_id;

  if v_numero_tanque is null or not exists (
    select 1 from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id
  ) then
    return;
  end if;

  if coalesce(v_volumen, 0) <= 0 then
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
  else
    update recepcion_tanques
    set condicion = 'STANDBY',
        activada_en = now()
    where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
  end if;

  update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

  update turno_lineas
  set lote_terminado_en = now()
  where lote_id = v_lote_id and activa;
end;
$$;

-- ------------------------------------------------------------
-- registrar_contador(): vuelve a poder cerrar una corrida "esperando
-- cierre" — ya no toca litros/volumen (eso sigue siendo solo de
-- Producto Terminado), solo el cierre.
-- ------------------------------------------------------------
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id);

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- registrar_producto_terminado(): la parte de "decidir Sucio/Standby
-- y cerrar el lote" pasa a la función compartida — el resto (restar
-- el delta del lote/tanque) sigue igual.
-- ------------------------------------------------------------
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
        paletas = producto_terminado.paletas + excluded.paletas,
        cajas_sueltas = producto_terminado.cajas_sueltas + excluded.cajas_sueltas,
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

grant execute on function cerrar_corrida_si_esperando(uuid, uuid) to anon, authenticated;
grant execute on function registrar_contador(uuid, uuid, text, integer, text, text) to anon, authenticated;
grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
