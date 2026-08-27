-- ============================================================
-- "TERMINÓ LÍNEA" (distinto de "TERMINÓ LOTE"): parar la línea sin cerrar el tanque
-- ============================================================
-- Hasta ahora, la única forma de que una línea dejara de tomar de un
-- lote era terminar_sabor_linea() ("Terminó Lote") — y esa función
-- SIEMPRE fuerza el cierre del tanque (a Sucio o Standby) al terminar,
-- vía cerrar_corrida_si_esperando(), sin importar si de verdad se
-- acabó el producto. Parar una línea NO siempre significa que el lote
-- se acabó (fin de turno, cambio de línea, arreglo mecánico, etc.) —
-- el tanque puede seguir Listo con producto de sobra para que la MISMA
-- u OTRA línea lo siga tomando de una.
--
-- Se agrega turno_lineas.mantiene_tanque: cuando está en true,
-- cerrar_corrida_si_esperando() marca finalizada_en igual (la corrida
-- sí se cierra) pero NO toca el tanque/lote para nada — ni lo pasa a
-- Sucio/Standby, ni le pone lote_terminado_en a otras líneas que lo
-- estén usando. terminar_sabor_linea() ("Terminó Lote") sigue igual
-- que antes (mantiene_tanque queda en false por default). La nueva
-- terminar_linea() ("Terminó Línea") pone el flag en true antes de
-- cerrar.
-- ============================================================

alter table turno_lineas add column mantiene_tanque boolean not null default false;

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
  v_mantiene_tanque boolean;
  v_numero_tanque smallint;
  v_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
begin
  select tl.activa, tl.finalizada_en, tl.lote_id, tl.mantiene_tanque
  into v_corrida_activa, v_finalizada_en, v_lote_id, v_mantiene_tanque
  from turno_lineas tl where tl.id = p_turno_linea_id;

  -- Solo corridas "esperando cierre" (ya no activas, todavía sin
  -- finalizar) — una corrida activa o ya finalizada no hace nada acá.
  if v_corrida_activa is not false or v_finalizada_en is not null then
    return;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  if v_mantiene_tanque then
    return;
  end if;

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

grant execute on function cerrar_corrida_si_esperando(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- terminar_linea() ("Terminó Línea"): para la línea, deja el tanque
-- tal cual (Listo/Standby, sin tocar volumen ni sabor) — a diferencia
-- de terminar_sabor_linea() ("Terminó Lote"), que sí lo cierra.
-- ------------------------------------------------------------
create or replace function terminar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set activa = false, pausada_en = null, mantiene_tanque = true
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_linea(text, uuid, uuid) to anon, authenticated;
