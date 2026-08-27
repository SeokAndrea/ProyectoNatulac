-- ============================================================
-- ENVASAR: guardar el resto de un tanque en tobos, para usarlo en otro turno
-- ============================================================
-- Distinto de Transferir (que mueve litros a OTRO TANQUE ahora mismo,
-- dentro del mismo turno): Envasar saca el resto del tanque a
-- contenedores aparte (tobos) que quedan disponibles para cualquier
-- turno futuro de la misma área — no se pierden, pero tampoco ocupan
-- un tanque mientras tanto. El tanque queda Sucio, igual que
-- Transferir.
--
-- Se reintroduce más adelante desde Iniciar Preparación (mismo
-- criterio que ya suma el resto de un tanque en Standby, ver
-- 20260952090000_preparar_sobre_standby_suma_resto.sql) — al elegir el
-- sabor, aparecen las reservas disponibles de esa área+sabor para
-- sumarlas o no a los tambores nuevos.
-- ============================================================

create table reservas_tobos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  sabor_id uuid not null references sabores (id),
  litros numeric(10, 2) not null check (litros > 0),
  lote_origen text,
  turno_id_origen uuid references turnos (id),
  usuario_id uuid not null references usuarios (id),
  creado_en timestamptz not null default now(),
  consumido_en timestamptz,
  turno_id_consumo uuid references turnos (id),
  usado_en_lote_id uuid references preparaciones (id)
);

alter table reservas_tobos enable row level security;

create or replace function envasar_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para envasar.';
  end if;
  if coalesce(v_tanque.volumen_l, 0) <= 0 then
    raise exception 'No queda nada en este tanque para envasar.';
  end if;

  insert into reservas_tobos (area_id, sabor_id, litros, lote_origen, turno_id_origen, usuario_id)
  values (v_area_id, v_tanque.sabor_id, v_tanque.volumen_l, v_tanque.lote, p_turno_id, v_usuario_id);

  update turno_lineas
  set lote_terminado_en = now()
  where lote_id = v_tanque.lote_id and activa;

  update preparaciones set cerrado_en = now() where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Desvasado (guardado)' || coalesce(' · Lote ' || v_tanque.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function envasar_tanque(text, uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_reservas_tobos(): disponibles (sin consumir) de un área —
-- opcionalmente filtradas por sabor, para el selector de Iniciar
-- Preparación.
-- ------------------------------------------------------------
create or replace function listar_reservas_tobos(p_usuario text, p_area_codigo text, p_sabor_id uuid default null)
returns table (
  reserva_id uuid,
  sabor_id uuid,
  sabor_nombre text,
  litros numeric,
  lote_origen text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select r.id, r.sabor_id, s.nombre || ' (' || f.nombre || ')', r.litros, r.lote_origen, r.creado_en
  from reservas_tobos r
  join sabores s on s.id = r.sabor_id
  join familias_producto f on f.id = s.familia_id
  join areas a on a.id = r.area_id
  where a.codigo = p_area_codigo
    and r.consumido_en is null
    and (p_sabor_id is null or r.sabor_id = p_sabor_id)
  order by r.creado_en;
end;
$$;

grant execute on function listar_reservas_tobos(text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- iniciar_preparacion(): puede sumar una reserva de tobos, además del
-- resto de Standby.
-- ------------------------------------------------------------
drop function if exists iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric);

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

  if v_tanque_actual.condicion = 'LISTO' and v_tanque_actual.lote_id is not null then
    update preparaciones set cerrado_en = now() where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  elsif v_tanque_actual.condicion = 'STANDBY' then
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);
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

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null, lote = null, lote_id = null,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;
