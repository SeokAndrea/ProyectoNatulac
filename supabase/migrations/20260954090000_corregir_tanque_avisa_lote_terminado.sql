-- ============================================================
-- CORREGIR TANQUE (cambiar_condicion_tanque): AVISAR "TERMINÓ EL LOTE"
-- CUANDO SE ABANDONA EL LOTE VIEJO A MANO
-- ============================================================
-- iniciar_preparacion() sí le pone lote_terminado_en a las corridas
-- activas del lote que abandona (rama LISTO), y
-- cerrar_corrida_si_esperando()/registrar_producto_terminado() también
-- lo hacen cuando el volumen llega a 0 solo. Pero cambiar_condicion_tanque()
-- (el botón "Corregir") nunca lo tocaba: si el supervisor marca el
-- tanque en Standby a mano (ej. "quedaron 2600 L", condicion=STANDBY
-- con un lote/sabor nuevo o distinto), el lote viejo queda abandonado
-- pero la corrida que lo estaba tomando nunca se entera — nunca le
-- aparece el aviso "Se terminó el lote, ¿continúa con el siguiente o
-- Terminó Sabor?" (ver EstadoPlantaTabs.tsx, gated en loteTerminado).
-- En la práctica la línea igual se cerraba porque "Terminó Sabor"
-- sigue siendo un botón normal, solo que sin pasar por esa elección.
--
-- Mismo criterio que las otras funciones: si el lote nuevo NO es el
-- mismo que el viejo (v_mismo_lote = false) y el tanque SÍ tenía un
-- lote viejo (v_actual.lote_id), cualquier corrida activa que lo
-- estuviera tomando se marca lote_terminado_en = now().
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
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion in ('SUCIO', 'CIP', 'LIMPIO') and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LIMPIO' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  if v_mismo_lote then
    v_lote_id := v_actual.lote_id;
  elsif p_condicion in ('LISTO', 'STANDBY') then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), p_volumen_l, p_volumen_l, 0, v_usuario_id, now())
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
      cip_iniciado_en = v_cip_iniciado_en,
      cip_finalizado_en = v_cip_finalizado_en,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_mismo_lote and v_lote_id is not null then
    update preparaciones
    set volumen_l = p_volumen_l
    where id = v_lote_id and cerrado_en is null;
  elsif v_actual.lote_id is not null then
    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_actual.lote_id and activa;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;
