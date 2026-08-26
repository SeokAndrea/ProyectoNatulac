-- ============================================================
-- INICIAR PREPARACIÓN SOBRE UN TANQUE EN STANDBY: SUMAR EL RESTO
-- ============================================================
-- iniciar_preparacion() calculaba el volumen del lote nuevo SOLO de
-- los tambores recién cargados (tambores × sabor.volumen) — si el
-- tanque estaba en STANDBY (le quedaba un resto del lote anterior,
-- ej. 2600 L de durazno que el supervisor decidió no botar), ese resto
-- sigue FÍSICAMENTE en el tanque. Preparar encima sin vaciarlo no lo
-- hace desaparecer — el volumen real del lote nuevo es tambores-nuevo
-- + el resto, no solo lo recién cargado. El caso LISTO (reemplazar un
-- lote que todavía no se había cerrado) sigue igual que antes — ese
-- volumen restante YA se descontó línea a línea vía Producto
-- Terminado, no hay que sumarlo de nuevo.
--
-- De paso, el UPDATE final ahora limpia lote_id explícitamente (antes
-- quedaba colgado apuntando al lote viejo mientras el tanque está
-- EN_PREPARACION — liberar_lote() lo vuelve a pisar bien al liberar el
-- lote nuevo, así que no rompía nada, pero es más claro dejarlo en null
-- de una vez).
-- ============================================================

create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  select * into v_tanque_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque_actual.condicion = 'LISTO' and v_tanque_actual.lote_id is not null then
    update preparaciones set cerrado_en = now() where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  elsif v_tanque_actual.condicion = 'STANDBY' then
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id);

  update recepcion_tanques
  set condicion = 'EN_PREPARACION',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric) to anon, authenticated;
