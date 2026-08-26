-- ============================================================
-- CORREGIR TANQUE (cambiar_condicion_tanque): UNA CORRECCIÓN DE
-- VOLUMEN NO ES CONSUMO — TAMBIÉN DEBE MOVER volumen_inicial_l
-- ============================================================
-- Cuando Corregir mantiene el mismo lote (v_mismo_lote = true, mismo
-- sabor+lote de texto) y el supervisor tipea un volumen_l distinto,
-- eso es una RELECTURA/CORRECCIÓN física del tanque (ej. "en realidad
-- quedan 7000 L, no 5118"), no una nueva carga y tampoco un consumo
-- normal. Antes solo se pisaba volumen_l — volumen_inicial_l (el punto
-- de partida fijo, usado para calcular cuánto salió del lote, ver
-- mermaSemielaboradoTurno en src/lib/panelProduccion.ts) se quedaba
-- como si nada hubiera pasado. Resultado real: un lote de Durazno
-- (tanque 3) se corrigió de 5118 L a 7000 L sin tocar su
-- volumen_inicial_l de 5958 — quedó con MÁS volumen actual que
-- inicial, dando un "consumido" negativo y un Rendimiento imposible
-- (>100%).
--
-- Fix: cuando se corrige el mismo lote, el delta (nuevo - viejo) se
-- suma también a volumen_inicial_l. Así "cuánto se consumió hasta
-- ahora" (inicial - actual) queda exactamente igual a como estaba
-- antes de la corrección — la corrección solo mueve el punto de
-- partida hacia adelante, no inventa ni borra consumo ya registrado.
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
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Corrección puntual del dato real ya afectado: el lote de Durazno
-- (tanque 3, turno A20260826_T1G2) tenía volumen_l=5118 (5958 - 840 de
-- Producto Terminado ya registrado) cuando se corrigió a mano a 7000 —
-- delta real +1882, que ahora se refleja también en volumen_inicial_l
-- (5958 + 1882 = 7840). Con esto, "consumido" = 7840 - 7000 = 840,
-- exactamente lo que ya se había registrado en Producto Terminado — ni
-- se inventa ni se borra litros.
-- ------------------------------------------------------------
update preparaciones
set volumen_inicial_l = 7840.00
where id = '10a36720-5169-42e3-8407-49f83f6e3665' and volumen_l = 7000.00 and volumen_inicial_l = 5958.00;
