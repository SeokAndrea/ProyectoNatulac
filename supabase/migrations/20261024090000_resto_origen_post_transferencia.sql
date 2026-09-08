-- ============================================================
-- RESTO EN EL TANQUE ORIGEN DESPUÉS DE TRANSFERIR
-- ============================================================
-- plan-rework-3-modulos-y-merma.md §2.4 / §2.5 (residuo).
--
-- transferir_tanque() asume que TODO el volumen del origen se movió y
-- deja el tanque en SUCIO. En la práctica quedan litros pegados al fondo
-- / paredes: ese semielaborado desaparece de los libros (el tanque
-- marca vacío pero tiene líquido, y el lote destino quedó acreditado de
-- más en volumen_inicial_l).
--
-- capturar_resto_origen_transferencia() lo corrige DESPUÉS de la
-- transferencia, sin tocar transferir_tanque:
--   * reabre el lote origen con el resto medido y deja el tanque origen
--     en STANDBY (Con Restos) apuntando a ese lote — visible, se puede
--     Transferir / Desvasar / CIP.
--   * al lote origen le devuelve el crédito (volumen_inicial_l += resto)
--     que transferir_tanque le había quitado por ese líquido.
--   * al lote destino le baja volumen_l y volumen_inicial_l en el mismo
--     resto (llegó de menos), con constancia en preparaciones_ajuste.
--
-- Solo para transferencias de LÍQUIDO o a tanque LIMPIO (modo IS NULL o
-- 'LIQUIDO'). Para modo 'LOTE' el lote se mudó físicamente al destino —
-- ese caso se rechaza acá.
--
-- Idempotente: si el lote origen ya no está cerrado (ya se registró el
-- resto), no hace nada.
--
-- Aditiva. No cambia transferir_tanque ni ninguna tabla.
-- ============================================================

create function capturar_resto_origen_transferencia(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_litros_resto numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_transf transferencias%rowtype;
  v_origen_lote preparaciones%rowtype;
  v_destino_tanque recepcion_tanques%rowtype;
  v_destino_lote_id uuid;
  v_destino_vol_antes numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_litros_resto is null or p_litros_resto < 0 then
    raise exception 'Los litros que quedaron en el tanque no son un número válido.';
  end if;

  -- La transferencia recién hecha desde ese tanque.
  select * into v_transf
  from transferencias
  where turno_id = p_turno_id and tanque_origen = p_numero_tanque_origen
  order by creado_en desc
  limit 1;

  if v_transf.id is null then
    raise exception 'No hay una transferencia reciente desde el Tanque %.', p_numero_tanque_origen;
  end if;
  if v_transf.creado_en < now() - interval '2 hours' then
    raise exception 'La última transferencia desde el Tanque % ya no es reciente — el resto se corrige desde Medir tanque.', p_numero_tanque_origen;
  end if;
  if v_transf.modo = 'LOTE' then
    raise exception 'Esa transferencia movió el lote entero al tanque destino — no aplica capturar un resto en el origen.';
  end if;
  if p_litros_resto >= v_transf.litros then
    raise exception 'El resto (% L) no puede ser mayor o igual a lo que se transfirió (% L).', p_litros_resto, v_transf.litros;
  end if;

  -- Lote que transferir_tanque cerró en el tanque origen (mismo instante).
  select * into v_origen_lote
  from preparaciones
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen and cerrado_en is not null
  order by cerrado_en desc
  limit 1;

  if v_origen_lote.id is null
     or abs(extract(epoch from (v_origen_lote.cerrado_en - v_transf.creado_en))) > 5 then
    raise exception 'No se encontró el lote que cerró esa transferencia en el Tanque %.', p_numero_tanque_origen;
  end if;

  -- Idempotencia: si ya se reabrió, no repetir.
  if v_origen_lote.cerrado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- Nada que capturar.
  if p_litros_resto = 0 then
    return turno_json(p_turno_id);
  end if;

  -- Lote que absorbió la transferencia en el destino.
  select * into v_destino_tanque
  from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;
  v_destino_lote_id := v_destino_tanque.lote_id;

  if v_destino_lote_id is null then
    raise exception 'El Tanque destino % ya no tiene un lote — no se puede ajustar.', v_transf.tanque_destino;
  end if;

  -- ---- Origen: reabrir con el resto, devolver el crédito ----
  update preparaciones
  set cerrado_en = null,
      volumen_l = p_litros_resto,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros_resto
  where id = v_origen_lote.id;

  update recepcion_tanques
  set condicion = 'STANDBY',
      sabor_id = v_origen_lote.sabor_id,
      volumen_l = p_litros_resto,
      lote = v_origen_lote.lote,
      lote_id = v_origen_lote.id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (v_origen_lote.id, p_turno_id, 0, p_litros_resto, p_litros_resto, v_usuario_id);

  -- ---- Destino: llegó de menos ----
  select volumen_l into v_destino_vol_antes from preparaciones where id = v_destino_lote_id;

  update preparaciones
  set volumen_l = greatest(coalesce(volumen_l, 0) - p_litros_resto, 0),
      volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - p_litros_resto, 0)
  where id = v_destino_lote_id;

  update recepcion_tanques
  set volumen_l = (select volumen_l from preparaciones where id = v_destino_lote_id),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (
    v_destino_lote_id,
    p_turno_id,
    coalesce(v_destino_vol_antes, 0),
    greatest(coalesce(v_destino_vol_antes, 0) - p_litros_resto, 0),
    -p_litros_resto,
    v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function capturar_resto_origen_transferencia(text, uuid, smallint, numeric) to anon, authenticated;
