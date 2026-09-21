-- ============================================================
-- FIX: un lote heredado que se agota dejaba el tanque "LISTO con
-- volumen" en el turno de quien lo agotó.
-- ============================================================
-- Caso real (Danny Fernandez, 2026-09-18, turno A20260918_T1G2): el
-- Lote 0002 (Naranja, Tanque 2) venía de turnos anteriores. La LINEA_1
-- lo agotó, se cargó el Producto Terminado (19968 L contra 19200 L en
-- el lote) y el lote quedó en 0 y cerrado — pero la tarjeta del
-- Tanque 2 siguió mostrando LISTO · Lote 0002 · 19200 L.
--
-- CAUSA. `revisar_cierre_de_lote` (20261018) cierra el lote y limpia el
-- tanque, pero solo la fila de `recepcion_tanques` del turno que CREÓ el
-- lote (`where turno_id = v_turno_id`). Cada turno tiene su propia copia
-- de la fila del tanque (la que hace iniciar_turno al arrancar). Si el
-- lote se creó en un turno anterior, la copia del turno abierto no se
-- toca: sigue LISTO, apuntando a un lote ya cerrado, y
-- `volumen_vivo_tanque` (20261031), al ver el lote cerrado, cae al
-- `recepcion_tanques.volumen_l` congelado (19200).
--
-- No depende de la línea parada: pasa con cualquier lote heredado que se
-- agote, se pare o no la línea.
--
-- ARREGLO.
--   1. revisar_cierre_de_lote limpia el tanque en el turno que creó el
--      lote (como antes) Y en todo turno ABIERTO que todavía apunte a ese
--      lote. Los turnos cerrados no se tocan: son historia.
--   2. Limpieza de datos: en turnos ABIERTOS, tanques Liberados que
--      apuntan a un lote ya cerrado y en 0 se dejan como SUCIO, igual que
--      lo haría el cierre.
--
-- `create or replace`, sin cambios de firma. Cuerpo idéntico a 20261018
-- salvo el `where` del update de recepcion_tanques.
-- ============================================================

-- ------------------------------------------------------------
-- 1. revisar_cierre_de_lote()
-- ------------------------------------------------------------
create or replace function revisar_cierre_de_lote(p_lote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
  v_numero_tanque smallint;
  v_volumen numeric;
  v_cerrado_en timestamptz;
  v_sabor_id uuid;
  v_lote_texto text;
begin
  if p_lote_id is null then
    return;
  end if;

  select turno_id, numero_tanque, volumen_l, cerrado_en, sabor_id, lote
  into v_turno_id, v_numero_tanque, v_volumen, v_cerrado_en, v_sabor_id, v_lote_texto
  from preparaciones where id = p_lote_id;

  if v_cerrado_en is not null then
    return;                                  -- ya cerrado
  end if;

  if exists (select 1 from turno_lineas where lote_id = p_lote_id and activa) then
    return;                                  -- todavia hay una corrida usandolo
  end if;

  if coalesce(v_volumen, 0) > 0 then
    -- La linea paro antes de vaciar el lote (falla / fin de turno / cambio
    -- de linea). El lote NO se cierra, queda abierto. El tanque se deja
    -- COMO ESTABA (tipicamente LISTO) para que otra linea lo tome o
    -- Preparacion lo transfiera/desvase/reuse.
    return;
  end if;

  -- Lote agotado y sin corrida activa: se cierra.
  update preparaciones set cerrado_en = now() where id = p_lote_id and cerrado_en is null;

  if v_numero_tanque is not null then
    -- El turno que creó el lote (como antes) Y todo turno abierto que
    -- todavía apunte a él: cada turno tiene su propia copia de la fila
    -- del tanque. Los turnos cerrados quedan como estaban (historia).
    update recepcion_tanques rt
    set condicion = 'SUCIO',
        sabor_id = null,
        volumen_l = null,
        lote = null,
        lote_id = null,
        activada_en = now(),
        ultimo_sabor_id = v_sabor_id,
        ultimo_lote = 'Restos del lote ' || coalesce(v_lote_texto, '?')
    where rt.lote_id = p_lote_id
      and (
        rt.turno_id = v_turno_id
        or rt.turno_id in (select t.id from turnos t where t.estado = 'ABIERTO')
      );
  end if;

  -- Otras corridas que apuntaban a este lote: marcarlo terminado.
  update turno_lineas set lote_terminado_en = now()
  where lote_id = p_lote_id and lote_terminado_en is null;
end;
$$;

grant execute on function revisar_cierre_de_lote(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Limpieza de datos: tanques de turnos ABIERTOS que quedaron
--    apuntando a un lote ya cerrado y en 0.
-- ------------------------------------------------------------
update recepcion_tanques rt
set condicion = 'SUCIO',
    sabor_id = null,
    volumen_l = null,
    lote = null,
    lote_id = null,
    activada_en = now(),
    ultimo_sabor_id = coalesce(prep.sabor_id, rt.ultimo_sabor_id),
    ultimo_lote = 'Restos del lote ' || coalesce(prep.lote, '?')
from preparaciones prep, turnos t
where prep.id = rt.lote_id
  and t.id = rt.turno_id
  and t.estado = 'ABIERTO'
  and rt.condicion in ('LISTO', 'STANDBY')
  and prep.cerrado_en is not null
  and coalesce(prep.volumen_l, 0) = 0;
