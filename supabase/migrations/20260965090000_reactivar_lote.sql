-- ============================================================
-- REACTIVAR LOTE: deshacer un cierre a Standby que no debía pasar
-- ============================================================
-- Un tanque en STANDBY ya tiene todo el dato bueno (sabor, lote,
-- volumen restante) — lo único "cerrado" es la preparación
-- (cerrado_en) y, si había una corrida activa tomando de ahí,
-- lote_terminado_en en esa línea (le mostraba "¿Terminó Sabor o
-- Continuar?" sin que correspondiera). Reactivar Lote deshace las dos
-- cosas y pone el tanque de vuelta en LISTO — mismo sabor/lote/volumen
-- que ya tenía, sin tener que re-tipearlo a mano con Corregir ni
-- perder el número de lote (que Iniciar Preparación sí generaría uno
-- nuevo).
-- ============================================================

create or replace function reactivar_lote(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion <> 'STANDBY' or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote cerrado para reactivar.';
  end if;

  update preparaciones set cerrado_en = null where id = v_tanque.lote_id;

  update turno_lineas
  set lote_terminado_en = null
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'LISTO', activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function reactivar_lote(text, uuid, smallint) to anon, authenticated;
