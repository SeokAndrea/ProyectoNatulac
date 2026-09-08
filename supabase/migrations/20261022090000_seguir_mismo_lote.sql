-- ============================================================
-- SEGUIR CON EL MISMO LOTE: deshace un "terminó el lote" prematuro
-- ============================================================
-- plan-rework-3-modulos-y-merma.md — costura 2.
--
-- El caso real (turno de Dany, 2026-09-08): una corrida quedó con
-- lote_terminado_en puesto pero el lote TODAVÍA tiene producto y el
-- tanque sigue LISTO. La marca de "terminó" fue de más — la puso el
-- viejo registrar_producto_terminado / registrar_contador (antes de
-- costura 2) al ver el volumen en ~0, o un iniciar_preparacion sobre el
-- tanque. Con esa marca, la tarjeta de Líneas solo ofrece:
--   * "Continuar al siguiente lote" -> falla si no hay tanque Listo con
--     el lote+1 del mismo sabor.
--   * "Detener línea" -> pide motivo y marca la línea Detenida por
--     falla; no aplica cuando el lote no terminó de verdad.
-- Faltaba un camino para decir "el lote NO terminó, la corrida sigue".
--
-- seguir_mismo_lote() hace UNA sola cosa: turno_lineas.lote_terminado_en
-- = null en esa corrida. NO toca el tanque, NI volumen_l, NI
-- volumen_inicial_l, NI preparaciones. Es reversible: si el lote se
-- vacía de nuevo, revisar_cierre_de_lote vuelve a marcar lo que
-- corresponda al cargar el Producto Terminado.
--
-- La auditoría la registra sola el trigger auditar_turno_lineas
-- (20260985090000), como con terminar_linea / pausar_linea.
-- ============================================================

create or replace function seguir_mismo_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid;
  v_activa boolean;
  v_lote_terminado_en timestamptz;
  v_cerrado_en timestamptz;
  v_volumen numeric;
begin
  select tl.lote_id, tl.activa, tl.lote_terminado_en
  into v_lote_id, v_activa, v_lote_terminado_en
  from turno_lineas tl
  where tl.id = p_turno_linea_id and tl.turno_id = p_turno_id;

  if not found then
    raise exception 'Esa corrida no existe en este turno.';
  end if;

  if v_activa is not true then
    raise exception 'Esa corrida ya no está activa — no se puede seguir con el mismo lote. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  -- Ya está corriendo normal (sin marca de "terminó"): nada que deshacer.
  if v_lote_terminado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- El lote tiene que seguir abierto y con volumen: si ya se cerró (un
  -- PT viejo lo vació y limpió el tanque) no hay nada que "seguir".
  select cerrado_en, volumen_l
  into v_cerrado_en, v_volumen
  from preparaciones
  where id = v_lote_id;

  if v_cerrado_en is not null then
    raise exception 'El Lote de esa corrida ya está cerrado — no se puede seguir. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  if coalesce(v_volumen, 0) <= 0 then
    raise exception 'El Lote de esa corrida no tiene volumen registrado. Revísalo en Preparación (Medir tanque) antes de seguir.';
  end if;

  -- Único efecto: deshace la marca de "terminó el lote".
  update turno_lineas
  set lote_terminado_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id
    and activa and lote_terminado_en is not null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function seguir_mismo_lote(text, uuid, uuid) to anon, authenticated;
