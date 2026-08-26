-- ============================================================
-- ACTIVAR LÍNEA: HEREDAR EL LOTE DIRECTO DEL TANQUE, NO ADIVINARLO
-- ============================================================
-- activar_linea() nunca usó recepcion_tanques.lote_id — en vez de eso
-- hacía su propia búsqueda independiente en preparaciones (el lote más
-- reciente con liberado_en not null y cerrado_en null para ese
-- numero_tanque, ver 20260910090000_recepcion_y_liberacion.sql). Esa
-- redundancia es la raíz de los dos bugs de esta tanda
-- (20260936/20260937/20260939): dos caminos distintos podían quedar
-- desincronizados entre sí sin que nada lo notara.
--
-- La idea correcta, más simple: una corrida hereda el lote que el
-- TANQUE tiene en este momento — ni más ni menos que
-- recepcion_tanques.lote_id, que ya es la fuente de verdad de "qué
-- lote tiene este tanque ahora" (liberar_lote lo setea desde
-- 20260914090000_litros_consumidos_lote.sql, y Corregir ya lo
-- mantiene consistente desde 20260936/20260939). Nada de volver a
-- buscar por su cuenta.
-- ============================================================

create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_numero_tanque smallint,
  p_confirmar_inicio boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id,
    case when p_confirmar_inicio then now() else null end,
    case when p_confirmar_inicio then v_usuario_id else null end
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint, boolean) to anon, authenticated;
