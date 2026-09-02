-- ============================================================
-- TRANSFERIR: elegir explícitamente qué identidad de lote sobrevive
-- ============================================================
-- plan-rework-tanques-lineas-recepcion.md — diseño acordado con el
-- dueño el 2026-09-02. Hoy transferir_tanque() decide en silencio,
-- mirando la condición del tanque destino: si está Limpio, crea un
-- lote nuevo con la identidad del origen; si ya tiene algo, SUMA el
-- origen al lote que ya tenía el destino (el destino siempre gana).
-- Eso no alcanza para un caso real: un manifold que hace pasar el
-- lote 4 (tanque 3) por el tanque 1, que ya tenía parte del lote 3 —
-- ahí se necesita que el lote 4 sea el que GANE, no el 3.
--
-- Ahora el supervisor elige el modo:
--   LIQUIDO (default, igual que el comportamiento de siempre): el
--     lote del tanque DESTINO conserva su identidad y absorbe el
--     volumen del origen. El origen se cierra.
--   LOTE: el lote del tanque ORIGEN conserva su identidad y absorbe
--     el volumen que ya tenía el destino. El lote anterior del
--     destino se cierra. Ningún litro se pierde en ninguno de los
--     dos casos — solo cambia cuál identidad sobrevive.
--
-- Validaciones (confirmadas con el dueño):
--   - Origen y destino deben estar LIBERADOS (Listo o Con Restos —
--     nunca "En Preparación no liberado"). Mismo criterio que
--     activar_linea() y continuar_siguiente_lote().
--   - Origen y destino deben ser el MISMO sabor (se mantiene el
--     candado — el dueño lo confirmó después de reconsiderarlo).
-- ============================================================

create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint,
  p_modo text default 'LIQUIDO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
  v_ultimo_lote_texto text;
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;
  if p_modo not in ('LIQUIDO', 'LOTE') then
    raise exception 'Modo de transferencia inválido: % (debe ser LIQUIDO o LOTE)', p_modo;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no está Liberado con un lote activo.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o Liberado (Listo o Con Restos).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

  if v_destino.condicion = 'LIMPIO' then
    -- Nada que absorber en el destino: los dos modos dan lo mismo — el
    -- origen se muda tal cual, con su propia identidad.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen.volumen_l, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_origen.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_origen.volumen_l, 0)
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_destino.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_destino.volumen_l, 0),
        numero_tanque = p_numero_tanque_destino
    where id = v_origen.lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = (select volumen_l from preparaciones where id = v_origen.lote_id),
        lote = v_origen.lote,
        lote_id = v_origen.lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id
    where lote_id = v_destino.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_destino.volumen_l, 0), 0)
    where id = v_destino.lote_id;

    update preparaciones set cerrado_en = now() where id = v_destino.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Lote ' || coalesce(v_origen.lote, '') || ' trasladado al Tanque ' || p_numero_tanque_destino;
  end if;

  if v_destino.condicion <> 'LIMPIO' then
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;
  end if;

  -- El tanque origen siempre queda sin lote propio al final — o se
  -- cerró (LIQUIDO/LIMPIO) o se mudó físicamente al destino (LOTE).
  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = v_ultimo_lote_texto,
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint, text) to anon, authenticated;
