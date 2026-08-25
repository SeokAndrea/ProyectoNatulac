-- ============================================================
-- No permitir sumar más envases a una corrida ya CERRADA
-- ============================================================
-- registrar_contador() descuenta litros del lote cada vez que se
-- llama (ver 20260914090000_litros_consumidos_lote.sql) y cierra la
-- corrida (finalizada_en) la primera vez que se llama sobre una que
-- estaba "esperando cierre". El problema: nada impedía llamarla DE
-- NUEVO sobre esa misma corrida después de cerrada — cada llamada de
-- más volvía a descontar litros del lote, duplicando el descuento
-- para una corrida que ya terminó de verdad. Ahora, si la corrida ya
-- tiene finalizada_en, la función rechaza el registro con un mensaje
-- claro en vez de aceptarlo silenciosamente.
-- ============================================================

create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
  v_lote_id uuid;
  v_volumen_ml integer;
  v_litros_consumidos numeric;
  v_nuevo_volumen numeric;
  v_numero_tanque smallint;
  v_finalizada_en timestamptz;
begin
  select finalizada_en into v_finalizada_en from turno_lineas where id = p_turno_linea_id;
  if v_finalizada_en is not null then
    raise exception 'Esta corrida ya está cerrada — no se pueden agregar más envases.';
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id);

  select tl.lote_id, p.volumen_ml into v_lote_id, v_volumen_ml
  from turno_lineas tl
  left join presentaciones p on p.id = tl.presentacion_id
  where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_volumen_ml is not null then
    v_litros_consumidos := p_envases_llenadora * v_volumen_ml / 1000.0;

    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_consumidos)
    where id = v_lote_id
    returning volumen_l, numero_tanque into v_nuevo_volumen, v_numero_tanque;

    update recepcion_tanques
    set volumen_l = v_nuevo_volumen
    where turno_id = p_turno_id
      and numero_tanque = v_numero_tanque
      and lote_id = v_lote_id;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text) to anon, authenticated;
