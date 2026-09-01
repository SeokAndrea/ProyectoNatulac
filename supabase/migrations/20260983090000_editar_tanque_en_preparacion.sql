-- ============================================================
-- CORREGIR TANQUE: "En Preparación (no liberado)" con datos
-- ============================================================
-- Editar un tanque directo a EN_PREPARACION dejaba el estado sin
-- sabor/lote y sin crear ninguna fila en preparaciones. La tarjeta,
-- que muestra el "lote abierto" del tanque (preparación sin liberar y
-- sin cerrar), agarraba entonces cualquier preparación colgada del
-- área — arrastrada de turnos viejos que nunca se cerraron — y
-- mostraba datos que no eran de este turno (el clásico "Naranja
-- random" en el área de Pruebas).
--
-- Ahora cambiar_condicion_tanque:
--   - Con EN_PREPARACION + sabor + lote (+ p_tambores): cierra
--     cualquier preparación abierta de ese tanque en el área (mata el
--     lote colgado) y crea una preparación NUEVA sin liberar
--     (liberado_en = null), igual que Iniciar Preparación. El volumen
--     sale de tambores × volumen del sabor.
--   - Con EN_PREPARACION sin datos (o SUCIO/CIP/LIMPIO): cierra las
--     preparaciones abiertas de ese tanque que vienen de OTROS turnos,
--     para que no se cuele un lote viejo.
-- ============================================================

drop function if exists cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text);

create function cambiar_condicion_tanque(
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
    update preparaciones
    set volumen_inicial_l = coalesce(volumen_inicial_l, 0) + (p_volumen_l - coalesce(volumen_l, 0)),
        volumen_l = p_volumen_l
    where id = v_lote_id and cerrado_en is null;
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
