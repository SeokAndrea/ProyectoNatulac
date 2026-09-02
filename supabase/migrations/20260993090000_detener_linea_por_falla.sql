-- ============================================================
-- LÍNEAS: "Detener por falla" en un solo paso atómico
-- ============================================================
-- plan-rework-tanques-lineas-recepcion.md §12. Hoy, cuando una línea
-- sufre una falla que corta la corrida (no una pausa breve), hacen
-- falta DOS acciones separadas:
--   1. terminar_linea() — termina la corrida conservando el tanque
--      (mantiene_tanque = true).
--   2. cambiar_condicion_linea('DETENIDA', motivo) — recién se puede
--      llamar DESPUÉS del paso 1 (mientras hay corrida activa, la
--      rechaza con "detén o termina el sabor antes de cambiar su
--      estado").
--
-- Si el supervisor hace el paso 1 y nunca llega al 2 (se le olvida, se
-- corta la conexión, lo que sea), el motivo de la falla se pierde —
-- exactamente la misma clase de problema que mermaSemielaboradoTurno
-- tenía con las correcciones de volumen. Esta función junta las dos
-- en una sola transacción: o se hacen las dos, o no se hace ninguna.
-- ============================================================

create or replace function detener_linea_por_falla(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select linea_id into v_linea_id
  from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_linea_id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  -- Igual que terminar_linea(): termina la corrida conservando el
  -- tanque (el lote sigue vivo, no se descarta nada).
  update turno_lineas
  set activa = false, pausada_en = null, mantiene_tanque = true
  where id = p_turno_linea_id and turno_id = p_turno_id;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  -- Y en la MISMA transacción, deja la línea en Detenida con el
  -- motivo — nunca queda "terminada sin explicación".
  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, 'DETENIDA', now(), nullif(btrim(p_motivo), ''), v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'DETENIDA',
        activada_en = excluded.activada_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function detener_linea_por_falla(text, uuid, uuid, text) to anon, authenticated;
