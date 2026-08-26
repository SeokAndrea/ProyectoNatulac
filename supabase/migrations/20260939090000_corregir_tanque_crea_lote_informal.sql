-- ============================================================
-- "CORREGIR" UN TANQUE A LISTO/STANDBY CREA SU LOTE SI NO EXISTE
-- ============================================================
-- Encontrado probando en el área de Pruebas: activar_linea() NUNCA
-- usa recepcion_tanques.lote_id — busca por su cuenta, en
-- preparaciones, el lote más reciente con liberado_en not null y
-- cerrado_en null para ese numero_tanque (ver
-- 20260910090000_recepcion_y_liberacion.sql). Ese es el único camino
-- real para que una corrida quede con lote_id, y por lo tanto para que
-- registrar_producto_terminado() pueda descontar litros de algún lado.
--
-- "Corregir" (cambiar_condicion_tanque) deja un tanque en LISTO con
-- sabor/volumen/lote con solo tocar recepcion_tanques — si se usa para
-- ARMAR el contenido de un tanque desde cero (sin pasar antes por
-- Iniciar Preparación → Liberar, que sí crea la fila en preparaciones),
-- nunca existe ningún lote real detrás. Consecuencia: activar_linea()
-- no encuentra nada, la corrida nace con lote_id null, y
-- registrar_producto_terminado() nunca resta ni un litro — ni del
-- lote (no existe) ni del tanque — sin importar cuánto producto se
-- cargue después. No es el mismo bug que
-- 20260936090000_corregir_tanque_preserva_lote_id.sql (ahí SÍ había un
-- lote real, solo se perdía la conexión) — acá directamente no hay
-- lote que conectar.
--
-- Fix: cuando Corregir deja el tanque en LISTO/STANDBY con contenido
-- NUEVO (no es el mismo sabor+lote que ya tenía LISTO/STANDBY — ese
-- caso lo sigue manejando 20260936 preservando el lote_id existente),
-- se crea de una vez una fila en preparaciones ya liberada
-- (liberado_en = now()) con esos mismos datos — un lote "informal",
-- sin tambores/ajustes (no se conocen), pero suficiente para que
-- activar_linea() lo encuentre y registrar_producto_terminado() pueda
-- descontarle litros con total normalidad, igual que un lote cargado
-- por el camino formal.
-- ============================================================

create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual recepcion_tanques%rowtype;
  v_ultimo_sabor_id uuid;
  v_ultimo_lote text;
  v_lote_id uuid;
  v_mismo_lote boolean;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion = 'SUCIO' and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  if v_mismo_lote then
    v_lote_id := v_actual.lote_id;
  elsif p_condicion in ('LISTO', 'STANDBY') then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), p_volumen_l, 0, v_usuario_id, now())
    returning id into v_lote_id;
  else
    v_lote_id := null;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote) else null end,
      lote_id = v_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_mismo_lote and v_lote_id is not null then
    update preparaciones
    set volumen_l = p_volumen_l
    where id = v_lote_id and cerrado_en is null;
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;
