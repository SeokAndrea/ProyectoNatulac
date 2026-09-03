-- ============================================================
-- INICIAR PREPARACIÓN: el agua del ajuste inicial suma al volumen
-- ============================================================
-- Igual que ajustar_preparacion() (20260997): el agua que se carga al
-- preparar es jugo/agua que suma litros al lote, 1:1. Hasta ahora
-- p_agua se guardaba en preparaciones.agua pero NO entraba a
-- volumen_l / volumen_inicial_l, que quedaban en tambores × volumen
-- del sabor — cortos, lo que infla la merma de semielaborado y hace
-- que "Σ PT del lote ≤ volumen preparado" dé falsos positivos
-- (ver plan-rework-auditoria.md §7).
--
-- Cambio: v_volumen_l suma coalesce(p_agua, 0). Azúcar y ácido
-- cítrico quedan como están (son kg, no litros).
--
-- Idéntica a 20260996 salvo esa línea.
-- ============================================================

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

  -- El agua del ajuste es jugo que suma al volumen, 1:1 (igual que ajustar_preparacion).
  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

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
