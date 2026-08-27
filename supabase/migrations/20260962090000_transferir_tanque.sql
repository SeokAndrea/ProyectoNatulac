-- ============================================================
-- TRANSFERIR: sumar el contenido de un tanque a otro con el mismo sabor
-- ============================================================
-- Cuando un tanque no está a su 100% (le queda un resto real, no
-- Standby) y hay OTRO tanque disponible con el mismo sabor ya cargado
-- (Listo o Standby), permite mandarle esos litros y sumarlos —
-- libera el tanque origen para lavar en vez de dejarlo subutilizado.
--
-- Solo permite transferir a un tanque que YA tiene el mismo sabor
-- (Listo/Standby) — mover un lote entero a un tanque vacío es un caso
-- distinto (eso ya lo cubre Iniciar Preparación/Corregir).
--
-- El volumen que llega se suma a volumen_l Y volumen_inicial_l del
-- destino — es líquido nuevo de verdad entrando al tanque, no una
-- corrección de medición (distinto del caso de
-- 20260956090000_corregir_tanque_ajusta_inicial_con_delta.sql).
--
-- Si había una corrida activa tomando del tanque origen, se redirige
-- sola a tomar del lote destino (el frontend avisa antes de llamar a
-- esto — ver EstadoPlantaTabs.tsx) — dejarla apuntando a un tanque que
-- va a quedar Sucio no tiene sentido.
--
-- El tanque origen queda Sucio (listo para lavar), igual que cuando se
-- vacía solo por Producto Terminado.
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
  if v_destino.condicion not in ('LISTO', 'STANDBY') or v_destino.lote_id is null then
    raise exception 'El tanque destino debe tener el mismo sabor ya cargado (Listo o Standby).';
  end if;
  if v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

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
