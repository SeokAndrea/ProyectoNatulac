-- ============================================================
-- GUARDRAIL #1: preparar sobre un tanque con producto
-- ============================================================
-- plan-rework-tanques-lineas-recepcion.md §6 (diseño acordado con el
-- dueño). Hoy iniciar_preparacion() trata distinto a los dos tanques
-- con producto: sobre STANDBY conserva el resto (lo suma al nuevo
-- lote), sobre LISTO lo descarta en silencio — es el asunto #1, el
-- generador más frecuente de merma negativa (12 casos en 25 días,
-- 2 el mismo 2026-09-02).
--
-- El feedback real del dueño: "trabajar encima" del resto NO es un
-- error, es la operación normal que quieren — el problema es que hoy
-- depende de un detalle invisible (¿el tanque estaba en Listo o en
-- Standby?). Ahora el resto SIEMPRE se suma al lote nuevo por
-- default, sin importar en cuál de los dos estados estaba el tanque.
--
-- De paso, esto arregla el §12 del plan original (doble conteo del
-- resto de Standby): antes, al absorber el resto, el lote viejo
-- quedaba con su volumen_inicial_l intacto y sin cerrar — esos
-- litros quedaban contados en el lote viejo (como "no consumido") Y
-- en el nuevo (ya absorbidos) a la vez. Ahora se descuenta del lote
-- viejo lo que entrega, igual que ya hace transferir_tanque (Fase D).
--
-- Para cuando el supervisor NO quiere sumar el resto (transferirlo,
-- envasarlo aparte, o descartarlo con motivo), esas 3 alternativas ya
-- existen o se agregan acá:
--   - Transferir a otro tanque: ya existe (transferir_tanque).
--   - Desvase: ya existe (envasar_tanque) — falta prender
--     DESVASE_HABILITADO en el frontend cuando esto se construya.
--   - Descartar con motivo: NUEVO — descartar_resto_tanque() de abajo.
-- Cualquiera de las 3 deja el tanque sin resto ANTES de que el
-- supervisor llame iniciar_preparacion(), así que no hace falta que
-- iniciar_preparacion() sepa nada de ellas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. preparaciones gana "observacion" (motivo de un descarte), mismo
--    patrón que lineas_estado.observacion (20260969).
-- ------------------------------------------------------------
alter table preparaciones add column if not exists observacion text
  check (observacion is null or char_length(observacion) <= 140);

-- ------------------------------------------------------------
-- 2. iniciar_preparacion(): unifica LISTO y STANDBY — el resto
--    SIEMPRE se suma, y el lote que lo entrega se descuenta y se
--    cierra (antes: STANDBY nunca lo cerraba, LISTO no lo sumaba).
-- ------------------------------------------------------------
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_reserva_id uuid default null
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
  v_reserva reservas_tobos%rowtype;
  v_nuevo_lote_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque_actual.condicion in ('LISTO', 'STANDBY') and v_tanque_actual.lote_id is not null then
    -- El resto SIEMPRE se suma al lote nuevo (guardrail #1, opción
    -- "Sí" — ya es el comportamiento normal, no hace falta elegir nada).
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);

    -- El lote que entrega el resto se descuenta (esos litros ya están
    -- contados en el lote nuevo, no pueden seguir contados acá) y se
    -- cierra — mismo patrón que transferir_tanque (Fase D, 20260990).
    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_tanque_actual.volumen_l, 0), 0),
        cerrado_en = now()
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_reserva_id is not null then
    select * into v_reserva from reservas_tobos where id = p_reserva_id and consumido_en is null;
    if v_reserva.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_reserva.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_reserva.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_reserva_id is not null then
    update reservas_tobos
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_reserva_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = normalizar_lote(p_lote), lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. descartar_resto_tanque(): guardrail #1, opción "Descartar con
--    motivo". Cierra el lote actual del tanque SIN sumarlo a nada —
--    los litros que quedaban pasan a ser merma real de ese lote,
--    a propósito, con el motivo anotado.
-- ------------------------------------------------------------
create or replace function descartar_resto_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_motivo text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para descartar.';
  end if;

  v_motivo := nullif(btrim(p_motivo), '');

  update preparaciones
  set observacion = v_motivo, cerrado_en = now()
  where id = v_tanque.lote_id and cerrado_en is null;

  update turno_lineas
  set lote_terminado_en = now()
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Descartado' || coalesce(' · Lote ' || v_tanque.lote, '') || coalesce(' · ' || v_motivo, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function descartar_resto_tanque(text, uuid, smallint, text) to anon, authenticated;
