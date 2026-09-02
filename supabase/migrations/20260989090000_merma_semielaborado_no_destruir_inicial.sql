-- ============================================================
-- MERMA DE SEMIELABORADO — FASE A: dejar de destruir volumen_inicial_l
-- ============================================================
-- Diagnóstico (ver plan-debug-merma-semielaborado.md §7, §18, §35–§37,
-- confirmado al litro contra 12 turnos reales de ASEPTICO):
--
--   cambiar_condicion_tanque(), rama v_mismo_lote (una "relectura"
--   física del volumen del tanque desde Status, mismo sabor+lote),
--   hacía:
--
--     volumen_inicial_l = volumen_inicial_l + (p_volumen_l - volumen_l)
--
--   Como volumen_l es un valor DERIVADO (= volumen_inicial_l - PT
--   acumulado, ver registrar_producto_terminado), al sustituir queda:
--
--     volumen_inicial_l_nuevo = PT_acumulado + p_volumen_l
--
--   El volumen_inicial_l original se CANCELA algebraicamente. El
--   "punto de partida" del lote pasa a valer "lo ya envasado + lo que
--   queda", y toda la merma acumulada hasta esa corrección se borra.
--   Cuanto mayor el faltante que reporta el supervisor, mejor se ve la
--   merma — el sistema premia la operación que debería castigar.
--
--   La intención original (20260956: "que inicial - actual no cambie
--   con la corrección") ERA el bug: fuerza consumido == PT y hace
--   invisible cualquier pérdida real.
--
-- ARREGLO (esta migración):
--   La relectura física toca SOLO volumen_l. volumen_inicial_l es
--   inmutable después de crearse el lote. La diferencia teórico-vs-real
--   se registra como una fila en preparaciones_ajuste (misma tabla y
--   semántica que el trigger registrar_ajuste_preparacion de 20260988),
--   para no perder el dato y que el desglose "Ajuste teórico vs. real"
--   lo siga mostrando.
--
-- NO incluye (fases siguientes, ver plan §38):
--   B — congelar también volumen_inicial_l en volumenes_lote_cierre.
--   C — backfill de los lotes ya corrompidos (necesita auditoría).
--   D — transferir_tanque deja de sumar al inicial del destino.
--
-- Reversible: re-aplicar 20260983090000 restaura el comportamiento
-- anterior.
-- ============================================================

create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null,
  p_tambores integer default null
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
  v_area_id uuid;
  v_prep_con_datos boolean;
  v_volumen_prep numeric;
  v_volumen_l_viejo numeric;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

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

  v_prep_con_datos := p_condicion = 'EN_PREPARACION'
    and p_sabor_id is not null
    and coalesce(trim(p_lote), '') <> '';

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

  elsif v_prep_con_datos then
    -- Cierra cualquier preparación abierta de este tanque en el área
    -- (incluye lotes "colgados" arrastrados de turnos viejos).
    update preparaciones pr
    set cerrado_en = now()
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id in (select id from turnos where area_id = v_area_id);

    select coalesce(p_tambores, 0) * volumen into v_volumen_prep from sabores where id = p_sabor_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_prep, v_volumen_prep, coalesce(p_tambores, 0), v_usuario_id)
    returning id into v_lote_id;

  else
    -- EN_PREPARACION sin datos, o SUCIO/CIP/LIMPIO: cierra los lotes
    -- abiertos de este tanque que vienen de OTROS turnos.
    update preparaciones pr
    set cerrado_en = now()
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id <> p_turno_id
      and pr.turno_id in (select id from turnos where area_id = v_area_id);
    v_lote_id := null;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case
               when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote)
               when v_prep_con_datos then normalizar_lote(p_lote)
               else null
             end,
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
    -- RELECTURA FÍSICA DEL TANQUE — NO mueve volumen_inicial_l.
    -- (Antes: volumen_inicial_l += p_volumen_l - volumen_l. Ver
    -- cabecera de esta migración: eso destruía el punto de partida.)
    -- Se toca solo volumen_l y se deja constancia del delta en
    -- preparaciones_ajuste (teórico = lo que el sistema tenía,
    -- real = lo que se midió).
    select volumen_l into v_volumen_l_viejo
    from preparaciones where id = v_lote_id and cerrado_en is null;

    update preparaciones
    set volumen_l = p_volumen_l
    where id = v_lote_id and cerrado_en is null;

    if v_volumen_l_viejo is not null and p_volumen_l is distinct from v_volumen_l_viejo then
      insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
      values (
        v_lote_id,
        p_turno_id,
        v_volumen_l_viejo,
        p_volumen_l,
        coalesce(p_volumen_l, 0) - coalesce(v_volumen_l_viejo, 0),
        v_usuario_id
      );
    end if;

  elsif v_actual.lote_id is not null then
    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_actual.lote_id and activa;

    update preparaciones
    set cerrado_en = now()
    where id = v_actual.lote_id and cerrado_en is null;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text, integer) to anon, authenticated;
