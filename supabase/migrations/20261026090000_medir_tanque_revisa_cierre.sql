-- ============================================================
-- medir_tanque(): al medir, revisar si el lote quedó en cero
-- ============================================================
-- Complemento del rework de Producción (regresión del Turno 3 de
-- Javier, ver 20261025). Costura 2 dejó que Producción NO tocara el
-- tanque al cargar PT — el tanque se queda mostrando "LISTO · N L"
-- congelado y el supervisor lo re-corre. La medición despues de cargar
-- PT (nueva en el frontend, ProductoTerminado.tsx) pone el volumen
-- real; falta que, si lo real es ~0, el lote se cierre y el tanque
-- pase a SUCIO — igual que hace registrar_producto_terminado.
--
-- Cambio: medir_tanque() llama a revisar_cierre_de_lote(lote_id) al
-- final. revisar_cierre_de_lote (20261018) ya es idempotente y con sus
-- guardas: si el lote todavía tiene volumen, o una corrida activa lo
-- usa, no hace nada. Sirve también para el "Medir tanque" que ya
-- existe en Preparación.
--
-- Aditivo, sin cambio de firma (`create or replace`). Cuerpo idéntico
-- a 20261021 salvo la última llamada.
-- ============================================================

create or replace function medir_tanque(
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

  -- Si lo medido dejó el lote en ~0 y ninguna corrida activa lo usa,
  -- se cierra el lote y el tanque pasa a SUCIO (mismo cierre que usa
  -- Producción). Idempotente y con guardas propias.
  perform revisar_cierre_de_lote(v_tanque.lote_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function medir_tanque(text, uuid, smallint, numeric) to anon, authenticated;
