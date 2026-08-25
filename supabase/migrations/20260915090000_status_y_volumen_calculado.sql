-- ============================================================
-- Volumen del lote calculado solo (tambores × sabores.volumen), no
-- cargado a mano.
-- ============================================================
-- iniciar_preparacion() pedía un volumen_l manual además de los
-- tambores — pero el volumen de un lote sale solo de la fórmula ya
-- usada en otras partes del proyecto: litros = tambores × volumen
-- del sabor (sabores.volumen, litros por tambor). Sacar el campo
-- manual evita que alguien cargue un número que no coincide con sus
-- propios tambores/sabor.
-- ============================================================

drop function if exists iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, integer, numeric, numeric, numeric);

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
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, nullif(p_lote, ''), v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id);

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
