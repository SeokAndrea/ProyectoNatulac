-- ============================================================
-- TRANSFERIR TAMBIÉN A UN TANQUE LIMPIO (mover el lote entero, no sumar)
-- ============================================================
-- transferir_tanque() solo permitía un destino que YA tenía el mismo
-- sabor cargado (Listo/Standby) — sumar dos lotes en uno. Falta el
-- caso de mover el lote ENTERO a un tanque recién limpio cuando no hay
-- otro tanque con ese sabor disponible, pero el origen necesita
-- liberarse (para lavar, por ejemplo). Ahí no hay nada que sumar —
-- el destino no tenía lote, así que se crea uno nuevo con el mismo
-- sabor/lote/volumen que tenía el origen (es el mismo lote, solo que
-- ahora vive en otro tanque físico).
-- ============================================================

create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint
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
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elegí dos tanques distintos.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no tiene un lote activo para transferir.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o tener el mismo sabor ya cargado (Listo o Standby).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  if v_destino.condicion = 'LIMPIO' then
    -- Mover el lote entero: el destino no tenía nada, se crea su lote
    -- con el mismo sabor/lote/volumen que traía el origen — es el
    -- mismo lote, solo que ahora vive en otro tanque físico.
    select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = v_origen.volumen_l,
        lote = v_origen.lote,
        lote_id = v_nuevo_lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_nuevo_lote_id
    where lote_id = v_origen.lote_id and activa;
  else
    -- Sumar: el destino ya tenía el mismo sabor cargado — es líquido
    -- nuevo de verdad entrando al tanque, no una corrección de
    -- medición (distinto del caso de
    -- 20260956090000_corregir_tanque_ajusta_inicial_con_delta.sql).
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
  end if;

  update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint) to anon, authenticated;
