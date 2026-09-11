-- ============================================================
-- FIJAR VOLUMEN DEL LOTE (el "100%") — corrección post-liberar
-- ============================================================
-- Hueco de herramienta (caso Deivis, lote 0004): después de liberar,
-- si la preparación quedó mal declarada NO hay forma de corregir el
-- `volumen_inicial_l` (el punto de partida de la merma). "Ajustar"
-- (`ajustar_preparacion`) solo funciona antes de liberar; "Medir
-- tanque" (`medir_tanque`) toca SOLO `volumen_l` → deja el
-- `volumen_inicial_l` inflado y aparece consumo fantasma en la merma.
--
-- `fijar_volumen_lote(lote_id, volumen_real)`: pone `volumen_l` Y
-- `volumen_inicial_l` en el valor real medido — el "100% del lote".
-- Solo es seguro mientras NINGUNA corrida haya tomado del lote (el
-- denominador de la merma todavía no se usó). Después de que corrió
-- una línea, la relectura física es "Medir tanque" (solo `volumen_l`).
--
-- Deja constancia en `preparaciones_ajuste_volumen` + auditoría.
-- Aditiva (RPC nueva). No cambia tablas ni otras funciones.
-- ============================================================

create function fijar_volumen_lote(
  p_usuario text,
  p_lote_id uuid,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
  v_inicial_viejo numeric;
begin
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen tiene que ser un número mayor o igual a 0.';
  end if;
  if p_volumen_real > 30000 then
    raise exception 'El volumen no puede pasar de 30.000 L (capacidad del tanque).';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;
  if exists (select 1 from turno_lineas where lote_id = p_lote_id) then
    raise exception 'Este lote ya tuvo una corrida — el 100%% no se puede fijar a mano. Usá "Medir tanque" para la relectura física.';
  end if;

  v_inicial_viejo := coalesce(v_lote.volumen_inicial_l, 0);

  update preparaciones
  set volumen_l = p_volumen_real,
      volumen_inicial_l = p_volumen_real
  where id = p_lote_id;

  -- Espejo del tanque, si está Liberado con este lote.
  update recepcion_tanques
  set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where turno_id = v_lote.turno_id and lote_id = p_lote_id and condicion in ('LISTO', 'STANDBY');

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, v_lote.turno_id, p_volumen_real - v_inicial_viejo,
          'Fijar volumen real del lote (100%)', v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Fijar volumen del lote · Tanque %s%s · %s L (era %s L)',
           v_lote.numero_tanque, coalesce(' · Lote ' || v_lote.lote, ''),
           p_volumen_real, round(v_inicial_viejo)),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', p_volumen_real, 'volumen_inicial_l', p_volumen_real)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

grant execute on function fijar_volumen_lote(text, uuid, numeric) to anon, authenticated;
