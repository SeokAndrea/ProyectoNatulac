-- ============================================================
-- 2.1 (tanque) — medir_tanque angosta + retira reactivar_lote / descartar_resto_tanque
-- ============================================================
-- plan-rework-3-modulos-y-merma.md §2.1. Enfoque "lo más seguro y
-- reversible" (dueño, 2026-09-08): aditivo + drop-only, sin tocar
-- `cambiar_condicion_tanque` todavía (todavía hace el toggle de CIP y el
-- confirmar INICIO/FIN; narrowear eso es un paso posterior).
--
-- 1. medir_tanque(usuario, turno_id, numero_tanque, volumen_real) — NUEVA,
--    angosta. Es la "relectura física" que hoy vive escondida en la rama
--    `v_mismo_lote` de `cambiar_condicion_tanque`: corrige `volumen_l` a
--    lo medido y deja constancia del delta en `preparaciones_ajuste`
--    (teórico vs real). NO toca `volumen_inicial_l` (el punto de partida
--    para la merma no se mueve — ver 20260989). No cambia
--    condición/sabor/lote.
--
-- 2. reactivar_lote(text, uuid, smallint) — se retira. Bug confirmado en
--    operación real (§2.1). En el modelo de dos estados de costura 2 no
--    hay "deshacer" un cierre: se previene con el 2º confirm de Detener
--    línea. Sin llamadores SQL; el único frontend es turno.tsx (muerto).
--
-- 3. descartar_resto_tanque(text, uuid, smallint, text) — se retira. En la
--    operación real nunca se descarta nada: todo resto se transfiere o se
--    guarda en pipa (Desvasar). Ambas ya existen.
--
-- Reversible re-aplicando 20260987 (reactivar_lote) y la migración que
-- creó descartar_resto_tanque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. medir_tanque()
-- ------------------------------------------------------------
create function medir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen_viejo numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).';
  end if;
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen medido no es válido.';
  end if;

  select volumen_l into v_volumen_viejo
  from preparaciones where id = v_tanque.lote_id and cerrado_en is null;

  -- Relectura física: solo `volumen_l`. NO se toca `volumen_inicial_l`.
  update preparaciones set volumen_l = p_volumen_real
  where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set volumen_l = p_volumen_real, activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_volumen_viejo is not null and p_volumen_real is distinct from v_volumen_viejo then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      v_tanque.lote_id,
      p_turno_id,
      v_volumen_viejo,
      p_volumen_real,
      coalesce(p_volumen_real, 0) - coalesce(v_volumen_viejo, 0),
      v_usuario_id
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function medir_tanque(text, uuid, smallint, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 2 y 3. Se retiran.
-- ------------------------------------------------------------
drop function if exists reactivar_lote(text, uuid, smallint);
drop function if exists descartar_resto_tanque(text, uuid, smallint, text);
