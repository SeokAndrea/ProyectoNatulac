-- ============================================================
-- CORREGIR TANQUE (cambiar_condicion_tanque): CERRAR EL LOTE VIEJO AL ABANDONARLO
-- ============================================================
-- iniciar_preparacion() sí cierra (cerrado_en) el lote que reemplaza
-- (rama LISTO). cambiar_condicion_tanque() (Corregir), en cambio,
-- nunca lo hacía: al cambiar el tanque a un lote/sabor distinto, la
-- fila vieja de preparaciones quedaba con cerrado_en = null PARA
-- SIEMPRE. El problema real: turno_json() arrastra a CUALQUIER turno
-- nuevo (misma área) toda preparación "todavía abierta"
-- (20260955090000_preparaciones_no_cruzan_area.sql, a propósito, para
-- que el estado del tanque se herede entre turnos) — un lote viejo que
-- nunca se cerró queda colándose PARA SIEMPRE en el registro de
-- auditoría de cada turno futuro, aunque ya nadie lo esté usando.
-- Justo lo que reportó el usuario: turno de hoy mostrando
-- preparaciones de hace 2 días.
--
-- Fix: al abandonar el lote viejo (mismo caso donde ya se avisa
-- lote_terminado_en a las líneas, 20260956090000), también se cierra.
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

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Limpieza puntual: 7 lotes viejos que quedaron abandonados sin cerrar
-- por este mismo bug (área ASEPTICO, tanques 1/2/3) — ya reemplazados
-- por lotes más nuevos en sus tanques, solo les faltaba cerrado_en
-- para dejar de colarse en cada turno nuevo. Los 3 lotes que SÍ siguen
-- siendo el activo real de su tanque (0008 tanque 1, 0004 tanque 2,
-- 0007 tanque 3) no se tocan.
-- ------------------------------------------------------------
update preparaciones
set cerrado_en = now()
where cerrado_en is null
  and id in (
    '8e75c16c-4258-42ba-beba-d61cc6915fd6',
    '10a36720-5169-42e3-8407-49f83f6e3665',
    '945b9d4f-7dca-4e11-b1de-6b79f52d80f9',
    'dc345f23-0242-4339-98cd-8fa5524148db',
    '67fd09d8-3b17-49b4-9b30-f01cdca23d83',
    'a783dfee-26d0-4d53-b795-9974f05dece4',
    'd6d83655-89dc-427c-b30a-5c0f17690130'
  );
