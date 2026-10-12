-- ENSAYO (se puede borrar): aplica la migración 20261109490000 (lotes para Vacío) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede aplicar la migración.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Necesita un turno abierto (usa sus tanques 1 y 2, una línea activa y un sabor con litros por tambor).

begin;

-- ===================== MIGRACIÓN 20261109490000_lotes_para_vacio.sql =====================
-- ============================================================
-- LOTES PARA VACÍO en tanques de Aséptico
-- ============================================================
-- Dueña, 2026-10-12. Vacío no usa la app: el supervisor de Aséptico
-- registra lo que Vacío guarda o se lleva de sus tanques. Nada de eso
-- cuenta en la merma de semielaborado ni en el rendimiento de Aséptico.
-- Ver plan-sheet-vacio-produccion.md, sección 2.
--
--   1. PREPARAR PARA VACÍO: iniciar_preparacion(p_para_vacio = true). Con
--      tambores, como siempre. No se libera: queda Listo al prepararlo.
--   2. RECIBIR DE VACÍO: recibir_de_vacio(). El néctar llega por tubería a
--      un tanque Limpio o Con Restos 0 L; sabor, lote y litros a mano.
--   3. PASAR A ASÉPTICO: pasar_lote_a_aseptico(). Aséptico usa lo de
--      Vacío: se cierra el lote de Vacío y nace un lote de Aséptico con el
--      volumen medido en ese momento (su punto de partida de merma).
--   4. SALIDA A VACÍO: entregar_a_vacio(). Vacío se lleva litros de un
--      tanque, por partes. Sirve para un lote de Vacío y para una parte de
--      un lote de Aséptico (como un desvase: no es merma). Si se lleva
--      todo, el tanque queda Con Restos 0 L (SUCIO), como siempre.
--
-- Reglas:
--   * preparaciones.para_vacio marca el lote. El tanque lo lee del lote.
--   * Ninguna corrida toma un lote de Vacío (trigger en turno_lineas).
--   * Transferir no mezcla un lote de Vacío con uno de Aséptico. A un
--     tanque Limpio, el lote nuevo hereda la marca.
--   * salidas_vacio registra cada salida (append-only).
--
-- Cambios de firma: iniciar_preparacion suma p_para_vacio (DROP + CREATE).
-- transferir_tanque y turno_json: create or replace, cuerpo de su última
-- versión con lo de Vacío marcado "VACÍO (20261109490000)".
-- ============================================================

-- ------------------------------------------------------------
-- 0. Datos
-- ------------------------------------------------------------
alter table preparaciones add column if not exists para_vacio boolean not null default false;

create table if not exists salidas_vacio (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  numero_tanque smallint not null,
  lote_id uuid references preparaciones (id) on delete set null,
  sabor_id uuid references sabores (id),
  lote text,
  litros numeric(10, 2) not null check (litros > 0),
  -- true = el lote era de Vacío; false = Vacío se llevó parte de un lote de Aséptico.
  de_lote_vacio boolean not null,
  usuario_id uuid not null references usuarios (id),
  creado_en timestamptz not null default now()
);

alter table salidas_vacio enable row level security;
create index if not exists salidas_vacio_turno_idx on salidas_vacio (turno_id);
create index if not exists salidas_vacio_lote_idx on salidas_vacio (lote_id);

-- ------------------------------------------------------------
-- 1. Ninguna corrida toma un lote de Vacío
-- ------------------------------------------------------------
create or replace function turno_lineas_sin_lote_vacio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lote_id is not null and exists (select 1 from preparaciones where id = new.lote_id and para_vacio) then
    raise exception 'El Lote % es para Vacío: ninguna línea lo puede tomar. Si Aséptico lo va a usar, primero "Pasar a Aséptico" en Preparación.',
      coalesce(new.lote, '?');
  end if;
  return new;
end;
$$;

drop trigger if exists turno_lineas_sin_lote_vacio on turno_lineas;
create trigger turno_lineas_sin_lote_vacio before insert or update of lote_id on turno_lineas
  for each row execute function turno_lineas_sin_lote_vacio();

-- ------------------------------------------------------------
-- 2. iniciar_preparacion() + p_para_vacio
-- ------------------------------------------------------------
-- Última versión: 20261108190000_tambores_de_medio_en_medio.sql
drop function if exists iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, numeric, numeric, numeric, uuid);

create function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores numeric,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_desvase_id uuid default null,
  p_para_vacio boolean default false
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
  v_desvase desvases%rowtype;
  v_nuevo_lote_id uuid;
  v_area_id uuid;
  v_lote_norm text;
  v_resto numeric;
  v_para_vacio boolean := coalesce(p_para_vacio, false);
begin
  -- Tambores de medio en medio (20261108190000).
  if p_tambores is not null and (p_tambores < 0 or p_tambores * 2 <> trunc(p_tambores * 2)) then
    raise exception 'Los tambores van de medio en medio (0,5 · 1 · 1,5 …).';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_lote_norm := normalizar_lote(p_lote);

  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || coalesce(p_sabor_id::text, '') || '|' || v_lote_norm, 0)
  );

  if exists (
    select 1
    from preparaciones prep
    join turnos t on t.id = prep.turno_id
    where prep.cerrado_en is null
      and prep.id is distinct from v_tanque_actual.lote_id
      and prep.sabor_id = p_sabor_id
      and normalizar_lote(prep.lote) = v_lote_norm
      and t.area_id = v_area_id
  ) then
    raise exception 'Ya hay un lote % de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.', v_lote_norm;
  end if;

  if v_tanque_actual.condicion in ('LISTO', 'STANDBY') and v_tanque_actual.lote_id is not null then
    v_resto := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque_actual.volumen_l, 0);
    v_volumen_l := v_volumen_l + v_resto;

    update preparaciones
    set cerrado_en = now(),
        actualizada_por = v_usuario_id
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now(),
        actualizada_por = v_usuario_id
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_desvase_id is not null then
    select * into v_desvase from desvases where id = p_desvase_id and consumido_en is null;
    if v_desvase.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_desvase.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_desvase.litros;
  end if;

  -- VACÍO (20261109490000): el lote de Vacío no se libera — nace Listo.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico,
    usuario_id, actualizada_por, para_vacio, liberado_en)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico,
    v_usuario_id, v_usuario_id, v_para_vacio, case when v_para_vacio then now() end)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  if v_para_vacio then
    update recepcion_tanques set condicion = 'LISTO', sabor_id = p_sabor_id, volumen_l = v_volumen_l,
      lote = v_lote_norm, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
      lote = v_lote_norm, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, numeric, numeric, numeric, uuid, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. recibir_de_vacio(): el néctar de Vacío llega por tubería
-- ------------------------------------------------------------
create or replace function recibir_de_vacio(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_litros numeric
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
  v_lote_norm text;
  v_nuevo_lote_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  if p_sabor_id is null then
    raise exception 'Elige el sabor.';
  end if;
  if coalesce(trim(p_lote), '') = '' then
    raise exception 'Escribe el lote.';
  end if;
  if p_litros is null or p_litros <= 0 then
    raise exception 'Los litros que llegaron tienen que ser más de 0.';
  end if;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion not in ('LIMPIO', 'SUCIO') then
    raise exception 'El Tanque % tiene que estar Limpio o Con Restos 0 L para recibir de Vacío.', p_numero_tanque;
  end if;

  v_lote_norm := normalizar_lote(p_lote);

  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || p_sabor_id::text || '|' || v_lote_norm, 0)
  );

  if exists (
    select 1
    from preparaciones prep
    join turnos t on t.id = prep.turno_id
    where prep.cerrado_en is null
      and prep.sabor_id = p_sabor_id
      and normalizar_lote(prep.lote) = v_lote_norm
      and t.area_id = v_area_id
  ) then
    raise exception 'Ya hay un lote % de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.', v_lote_norm;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores,
    usuario_id, actualizada_por, para_vacio, liberado_en)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, p_litros, p_litros, 0,
    v_usuario_id, v_usuario_id, true, now())
  returning id into v_nuevo_lote_id;

  update recepcion_tanques
  set condicion = 'LISTO', sabor_id = p_sabor_id, volumen_l = p_litros,
      lote = v_lote_norm, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function recibir_de_vacio(text, uuid, smallint, uuid, text, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. entregar_a_vacio(): Vacío se lleva litros del tanque
-- ------------------------------------------------------------
-- p_litros null = se lleva todo. No puede pasar de lo que hay: si el
-- tanque tiene más de lo que dice el sistema, primero Medir tanque.
create or replace function entregar_a_vacio(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_litros numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_prep preparaciones%rowtype;
  v_hay numeric;
  v_litros numeric;
  v_queda numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'El Tanque % no tiene un lote con producto para entregar.', p_numero_tanque;
  end if;

  select * into v_prep from preparaciones where id = v_tanque.lote_id and cerrado_en is null;
  if v_prep.id is null then
    raise exception 'El lote del Tanque % ya está cerrado.', p_numero_tanque;
  end if;

  v_hay := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), 0);
  if v_hay <= 0 then
    raise exception 'No queda nada en el Tanque % para entregar.', p_numero_tanque;
  end if;

  v_litros := coalesce(p_litros, v_hay);
  if v_litros <= 0 then
    raise exception 'Los litros que se lleva Vacío tienen que ser más de 0.';
  end if;
  if v_litros > v_hay then
    raise exception 'El Tanque % tiene % L. Si tiene más, primero Medir tanque.', p_numero_tanque, v_hay;
  end if;

  v_queda := v_hay - v_litros;

  insert into salidas_vacio (turno_id, numero_tanque, lote_id, sabor_id, lote, litros, de_lote_vacio, usuario_id)
  values (p_turno_id, p_numero_tanque, v_prep.id, v_prep.sabor_id, v_prep.lote, v_litros, v_prep.para_vacio, v_usuario_id);

  update preparaciones set volumen_l = v_queda, actualizada_por = v_usuario_id where id = v_prep.id;

  if v_queda > 0 then
    update recepcion_tanques
    set volumen_l = v_queda, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    -- Se llevó todo: el lote se cierra y el tanque queda Con Restos 0 L.
    update turno_lineas
    set lote_terminado_en = now(), actualizada_por = v_usuario_id
    where lote_id = v_prep.id and activa;

    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_prep.id and cerrado_en is null;

    update recepcion_tanques
    set condicion = 'SUCIO',
        sabor_id = null,
        volumen_l = null,
        lote = null,
        lote_id = null,
        activada_en = now(),
        ultimo_sabor_id = v_prep.sabor_id,
        ultimo_lote = 'Entregado a Vacío' || coalesce(' · Lote ' || v_prep.lote, ''),
        actualizada_por = v_usuario_id
    where lote_id = v_prep.id
      and (turno_id = p_turno_id or turno_id in (select t.id from turnos t where t.estado = 'ABIERTO'));

    perform capturar_tanques_encontrados_si_completo(p_turno_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'salidas_vacio', p_turno_id::text || '-' || p_numero_tanque::text, 'Preparación',
    format('Salida a Vacío · Tanque %s · %s L%s%s', p_numero_tanque, v_litros,
           coalesce(' · Lote ' || v_prep.lote, ''),
           case when v_prep.para_vacio then '' else ' (lote de Aséptico)' end),
    jsonb_build_object('volumen_l', v_hay),
    jsonb_build_object('volumen_l', v_queda)
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function entregar_a_vacio(text, uuid, smallint, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. pasar_lote_a_aseptico(): Aséptico usa lo de Vacío
-- ------------------------------------------------------------
-- Se cierra el lote de Vacío y nace uno de Aséptico (mismo sabor y
-- número de lote) con el volumen medido ahora: ese es el 100% del lote
-- para la merma. Lo que pasó mientras era de Vacío no cuenta.
create or replace function pasar_lote_a_aseptico(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'El Tanque % no tiene un lote para pasar a Aséptico.', p_numero_tanque;
  end if;

  select * into v_prep from preparaciones where id = v_tanque.lote_id and cerrado_en is null;
  if v_prep.id is null or not v_prep.para_vacio then
    raise exception 'El lote del Tanque % no es de Vacío.', p_numero_tanque;
  end if;
  if p_volumen_real is null or p_volumen_real <= 0 then
    raise exception 'Mide el tanque: los litros tienen que ser más de 0.';
  end if;

  update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_prep.id;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores,
    usuario_id, actualizada_por, para_vacio, liberado_en)
  values (p_turno_id, p_numero_tanque, v_prep.sabor_id, v_prep.lote, p_volumen_real, p_volumen_real, 0,
    v_usuario_id, v_usuario_id, false, now())
  returning id into v_nuevo_lote_id;

  -- El turno abierto pasa a apuntar al lote nuevo. Ya se revisó el tanque:
  -- nació en este turno, así que no pide confirmar el inicio.
  update recepcion_tanques
  set condicion = 'LISTO', sabor_id = v_prep.sabor_id, volumen_l = p_volumen_real,
      lote = v_prep.lote, lote_id = v_nuevo_lote_id,
      activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', v_nuevo_lote_id::text, 'Preparación',
    format('Pasar a Aséptico · Tanque %s · Lote %s · %s L', p_numero_tanque, coalesce(v_prep.lote, '?'), p_volumen_real),
    jsonb_build_object('para_vacio', true, 'volumen_l', v_prep.volumen_l),
    jsonb_build_object('para_vacio', false, 'volumen_l', p_volumen_real)
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function pasar_lote_a_aseptico(text, uuid, smallint, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. transferir_tanque(): no mezcla Vacío con Aséptico
-- ------------------------------------------------------------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint,
  p_modo text default 'LIQUIDO',
  p_motivo text default 'CONSOLIDAR_RESTOS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
  v_ultimo_lote_texto text;
  v_litros_movidos numeric;
  v_destino_era_limpio boolean;
  v_origen_litros numeric;
  v_destino_litros numeric;
  v_lote_id_pierde uuid;
  v_lote_id_gana uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;
  if p_modo not in ('LIQUIDO', 'LOTE') then
    raise exception 'Modo de transferencia inválido: % (debe ser LIQUIDO o LOTE)', p_modo;
  end if;
  if p_motivo not in ('CONSOLIDAR_RESTOS', 'ENRUTAR_MANIFOLD') then
    raise exception 'Motivo de transferencia inválido: % (debe ser CONSOLIDAR_RESTOS o ENRUTAR_MANIFOLD)', p_motivo;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no está Liberado con un lote activo.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o Liberado (Listo o Con Restos).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

  -- VACÍO (20261109490000): un lote de Vacío y uno de Aséptico no se mezclan.
  if v_destino.condicion in ('LISTO', 'STANDBY')
     and coalesce(v_origen_prep.para_vacio, false)
         <> coalesce((select para_vacio from preparaciones where id = v_destino.lote_id), false) then
    raise exception 'No se mezcla un lote de Vacío con uno de Aséptico. Si Aséptico lo va a usar, primero "Pasar a Aséptico".';
  end if;

  v_origen_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_origen), v_origen.volumen_l, 0);
  v_destino_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_destino), v_destino.volumen_l, 0);

  v_litros_movidos := v_origen_litros;
  v_destino_era_limpio := v_destino.condicion = 'LIMPIO';

  if v_destino.condicion = 'LIMPIO' then
    -- VACÍO (20261109490000): el lote nuevo hereda la marca del origen.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en, para_vacio)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen_litros, v_origen_litros, 0, v_usuario_id, v_usuario_id, now(),
      coalesce(v_origen_prep.para_vacio, false))
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen_litros, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id, actualizada_por = v_usuario_id where lote_id = v_origen.lote_id and activa;

    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');
    v_lote_id_pierde := v_origen.lote_id;
    v_lote_id_gana := v_nuevo_lote_id;

  elsif p_modo = 'LIQUIDO' then
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_origen_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_origen_litros,
        actualizada_por = v_usuario_id
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_origen.lote_id and activa;

    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');
    v_lote_id_pierde := v_origen.lote_id;
    v_lote_id_gana := v_destino.lote_id;

  else
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_destino_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_destino_litros,
        numero_tanque = p_numero_tanque_destino,
        actualizada_por = v_usuario_id
    where id = v_origen.lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = (select volumen_l from preparaciones where id = v_origen.lote_id),
        lote = v_origen.lote,
        lote_id = v_origen.lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_destino.lote_id and activa;

    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_destino.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Lote ' || coalesce(v_origen.lote, '') || ' trasladado al Tanque ' || p_numero_tanque_destino;
    v_lote_id_pierde := v_destino.lote_id;
    v_lote_id_gana := v_origen.lote_id;
  end if;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = v_ultimo_lote_texto,
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  insert into transferencias (turno_id, tanque_origen, tanque_destino, litros, modo, motivo, usuario_id, lote_id_origen, lote_id_destino)
  values (
    p_turno_id,
    p_numero_tanque_origen,
    p_numero_tanque_destino,
    v_litros_movidos,
    case when v_destino_era_limpio then null else p_modo end,
    p_motivo::motivo_transferencia,
    v_usuario_id,
    v_lote_id_pierde,
    v_lote_id_gana
  );

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 7. turno_json(): para_vacio en tanques y preparaciones + salidas_vacio
-- ------------------------------------------------------------
-- Última versión: 20261084090000_turnos_sin_grupo.sql
create or replace function turno_json(p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'estado', t.estado,
    'fecha_fin', t.fecha_fin,
    'hora_fin', t.hora_fin,
    'cierre_automatico', t.cierre_automatico,
    'volumenes_lote_cierre', t.volumenes_lote_cierre,
    'tanques_encontrados', t.tanques_encontrados,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', case when t.grupo_pendiente then 'SIN_GRUPO' else g.codigo end,
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
    'sin_responsable', u.usuario = 'sistema',
    'grupo_pendiente', t.grupo_pendiente,
    'apertura_automatica', t.apertura_automatica,
    'esquema', t.esquema,
    'correcciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', cu.nombre,
        'motivo', c.motivo,
        'creada_en', c.creada_en
      ) order by c.creada_en)
      from turno_correcciones c
      join usuarios cu on cu.id = c.usuario_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario', ru.usuario,
        'nombre', ru.nombre,
        'motivo', tr.motivo,
        'desde', tr.desde,
        'hasta', tr.hasta
      ) order by tr.desde)
      from turno_responsables tr
      join usuarios ru on ru.id = tr.usuario_id
      where tr.turno_id = t.id
    ), '[]'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tl.id,
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sabor_display(sl.nombre, fsl.nombre),
        'lote', tl.lote,
        'lote_id', tl.lote_id,
        'activa', tl.activa,
        'activada_en', tl.activada_en,
        'pausada_en', tl.pausada_en,
        'lote_terminado_en', tl.lote_terminado_en,
        'entregada_en', tl.entregada_en,
        'entrega_automatica', tl.entrega_automatica,
        'finalizada_en', tl.finalizada_en,
        'confirmado_inicio_en', tl.confirmado_inicio_en
      ) order by tl.activada_en)
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      left join familias_producto fsl on fsl.id = sl.familia_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'lineas_estado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l4.codigo,
        'condicion', le.condicion,
        'activada_en', le.activada_en,
        'cip_iniciado_en', le.cip_iniciado_en,
        'cip_finalizado_en', le.cip_finalizado_en,
        'observacion', le.observacion
      ) order by l4.codigo)
      from lineas_estado le
      join lineas l4 on l4.id = le.linea_id
      where le.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, fs.nombre),
        'condicion', rt.condicion,
        'volumen_l', volumen_vivo_tanque(t.id, rt.numero_tanque),
        'volumen_inicial_l', prep_t.volumen_inicial_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', sabor_display(us.nombre, fus.nombre),
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en,
        'cip_iniciado_en', rt.cip_iniciado_en,
        'cip_finalizado_en', rt.cip_finalizado_en,
        -- VACÍO (20261109490000)
        'para_vacio', coalesce(prep_t.para_vacio, false)
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto fs on fs.id = s.familia_id
      left join sabores us on us.id = rt.ultimo_sabor_id
      left join familias_producto fus on fus.id = us.familia_id
      left join preparaciones prep_t on prep_t.id = rt.lote_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'turno_linea_id', c.turno_linea_id,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'justificacion', c.justificacion,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id,
        'linea_codigo', l3.codigo,
        'turno_linea_id', pt.turno_linea_id,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', sabor_display(s2.nombre, fs2.nombre),
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at,
        'registrado_por_nombre', ru.nombre
      ) order by pt.updated_at desc)
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      left join familias_producto fs2 on fs2.id = s2.familia_id
      left join usuarios ru on ru.id = pt.usuario_id
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'turno_id', prep.turno_id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', sabor_display(s3.nombre, fs3.nombre),
        'lote', prep.lote,
        'volumen_l', case
          when t.estado = 'CERRADO' and jsonb_exists(t.volumenes_lote_cierre, prep.id::text)
          then (t.volumenes_lote_cierre ->> prep.id::text)::numeric
          else prep.volumen_l
        end,
        'volumen_inicial_l', prep.volumen_inicial_l,
        'volumen_l_inicio', case
          when prep.turno_id = t.id then prep.volumen_inicial_l
          when t.volumenes_lote_inicio is not null and jsonb_exists(t.volumenes_lote_inicio, prep.id::text)
            then (t.volumenes_lote_inicio ->> prep.id::text)::numeric
          else coalesce((
            select (tc.volumenes_lote_cierre ->> prep.id::text)::numeric
            from turnos tc
            where tc.area_id = t.area_id
              and tc.id <> t.id
              and tc.estado = 'CERRADO'
              and tc.volumenes_lote_cierre is not null
              and jsonb_exists(tc.volumenes_lote_cierre, prep.id::text)
              and (tc.fecha < t.fecha
                   or (tc.fecha = t.fecha and coalesce(tc.hora_fin, tc.hora_inicio) <= t.hora_inicio))
            order by tc.fecha desc, coalesce(tc.hora_fin, tc.hora_inicio) desc, tc.created_at desc
            limit 1
          ), prep.volumen_inicial_l)
        end,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at,
        'liberado_en', prep.liberado_en,
        'cerrado_en', prep.cerrado_en,
        -- VACÍO (20261109490000)
        'para_vacio', prep.para_vacio
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      left join familias_producto fs3 on fs3.id = s3.familia_id
      where prep.turno_id = t.id
         or (
           prep.cerrado_en is null
           and exists (
             select 1 from turnos t_prep
             where t_prep.id = prep.turno_id and t_prep.area_id = t.area_id
           )
         )
         or prep.id in (
           select tl.lote_id from turno_lineas tl
           where tl.turno_id = t.id and tl.lote_id is not null
         )
         -- VACÍO (20261109490000): los lotes de los que salió algo a Vacío en este turno.
         or prep.id in (
           select sv.lote_id from salidas_vacio sv
           where sv.turno_id = t.id and sv.lote_id is not null
         )
    ), '[]'::jsonb),
    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'litros', tr.litros,
        'modo', tr.modo,
        'lote_id_origen', tr.lote_id_origen,
        'lote_id_destino', tr.lote_id_destino,
        'creado_en', tr.creado_en
      ) order by tr.creado_en)
      from transferencias tr
      where tr.turno_id = t.id
    ), '[]'::jsonb),
    'desvases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'litros', d.litros,
        'lote_id_origen', d.lote_id_origen,
        'creado_en', d.creado_en
      ) order by d.creado_en)
      from desvases d
      where d.turno_id_origen = t.id
    ), '[]'::jsonb),
    -- VACÍO (20261109490000)
    'salidas_vacio', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id,
        'numero_tanque', sv.numero_tanque,
        'lote_id', sv.lote_id,
        'lote', sv.lote,
        'sabor_nombre', sabor_display(svs.nombre, svf.nombre),
        'litros', sv.litros,
        'de_lote_vacio', sv.de_lote_vacio,
        'usuario_nombre', svu.nombre,
        'creado_en', sv.creado_en
      ) order by sv.creado_en)
      from salidas_vacio sv
      left join sabores svs on svs.id = sv.sabor_id
      left join familias_producto svf on svf.id = svs.familia_id
      left join usuarios svu on svu.id = sv.usuario_id
      where sv.turno_id = t.id
    ), '[]'::jsonb),
    'novedades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'texto', n.texto,
        'creado_en', n.creado_en,
        'creado_por_nombre', nu.nombre
      ) order by n.creado_en)
      from turno_novedades n
      left join usuarios nu on nu.id = n.usuario_id
      where n.turno_id = t.id
    ), '[]'::jsonb),
    'ajustes_volumen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', av.id,
        'lote_id', av.lote_id,
        'numero_tanque', avp.numero_tanque,
        'lote', avp.lote,
        'sabor_nombre', sabor_display(avs.nombre, avfs.nombre),
        'litros', av.litros,
        'detalle', av.detalle,
        'creado_en', av.creado_en,
        'usuario_nombre', avu.nombre
      ) order by av.creado_en)
      from preparaciones_ajuste_volumen av
      join preparaciones avp on avp.id = av.lote_id
      left join sabores avs on avs.id = avp.sabor_id
      left join familias_producto avfs on avfs.id = avs.familia_id
      left join usuarios avu on avu.id = av.usuario_id
      where av.turno_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join usuarios u on u.id = t.supervisor_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

-- ===================== CHEQUEOS =====================
do $$
declare
  v_turno uuid;
  v_usuario text;
  v_sabor uuid;
  v_vol numeric;
  v_rt recepcion_tanques%rowtype;
  v_prep preparaciones%rowtype;
  v_prep2 preparaciones%rowtype;
  v_json jsonb;
  v_linea text;
  v_pres integer;
  v_falla text;
  v_n integer := 0;
begin
  -- El último turno abierto (cualquier área) y su supervisor.
  select t.id, u.usuario into v_turno, v_usuario
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO'
  order by t.fecha desc, t.hora_inicio desc
  limit 1;
  if v_turno is null then
    raise exception 'ENSAYO NO CORRIÓ: hace falta un turno abierto.';
  end if;

  select id, volumen into v_sabor, v_vol from sabores where activo and volumen > 0 order by nombre limit 1;
  select codigo into v_linea from lineas where activo order by codigo limit 1;
  select volumen_ml into v_pres from presentaciones order by volumen_ml limit 1;

  -- Tanques 1 y 2 de ese turno, Limpios (se deshace al final).
  update recepcion_tanques set condicion = 'LIMPIO', sabor_id = null, volumen_l = null, lote = null, lote_id = null
  where turno_id = v_turno and numero_tanque in (1, 2);

  -- 1. Preparar para Vacío: nace Listo, sin liberar aparte, marcado.
  perform iniciar_preparacion(v_usuario, v_turno, 1::smallint, v_sabor, 'ENSAYO-V1', 2, null, null, null, null, true);
  select * into v_rt from recepcion_tanques where turno_id = v_turno and numero_tanque = 1;
  select * into v_prep from preparaciones where id = v_rt.lote_id;
  if v_rt.condicion <> 'LISTO' or not v_prep.para_vacio or v_prep.liberado_en is null or v_prep.volumen_l <> 2 * v_vol then
    raise exception 'ENSAYO FALLÓ (1): preparar para Vacío no dejó el tanque Listo con un lote de Vacío (%, %).', v_rt.condicion, v_prep.para_vacio;
  end if;
  v_n := v_n + 1;

  -- 2. turno_json lo marca en tanques y preparaciones.
  v_json := turno_json(v_turno);
  if not exists (select 1 from jsonb_array_elements(v_json->'tanques') t where (t->>'numero_tanque')::int = 1 and (t->>'para_vacio')::boolean)
     or not exists (select 1 from jsonb_array_elements(v_json->'preparaciones') p where p->>'id' = v_prep.id::text and (p->>'para_vacio')::boolean) then
    raise exception 'ENSAYO FALLÓ (2): turno_json no trae para_vacio.';
  end if;
  v_n := v_n + 1;

  -- 3. Ninguna línea lo toma.
  v_falla := null;
  begin
    perform activar_linea(v_usuario, v_turno, v_linea, v_pres, 1000, 1000, 1::smallint, true);
  exception when others then
    v_falla := sqlerrm;
  end;
  if v_falla is null or v_falla not like '%para Vacío%' then
    raise exception 'ENSAYO FALLÓ (3): una línea pudo tomar el lote de Vacío (%).', coalesce(v_falla, 'sin error');
  end if;
  v_n := v_n + 1;

  -- 4. Entregar a Vacío por partes, y no más de lo que hay.
  perform entregar_a_vacio(v_usuario, v_turno, 1::smallint, 100);
  select * into v_prep from preparaciones where id = v_prep.id;
  if v_prep.volumen_l <> 2 * v_vol - 100
     or not exists (select 1 from salidas_vacio where lote_id = v_prep.id and litros = 100 and de_lote_vacio) then
    raise exception 'ENSAYO FALLÓ (4): la entrega parcial no bajó el lote o no quedó registrada.';
  end if;
  v_falla := null;
  begin
    perform entregar_a_vacio(v_usuario, v_turno, 1::smallint, 999999);
  exception when others then
    v_falla := sqlerrm;
  end;
  if v_falla is null then
    raise exception 'ENSAYO FALLÓ (4): dejó entregar más de lo que había.';
  end if;
  v_n := v_n + 1;

  -- 5. Transferir a un tanque Limpio: el lote nuevo sigue siendo de Vacío.
  perform transferir_tanque(v_usuario, v_turno, 1::smallint, 2::smallint, 'LIQUIDO', 'CONSOLIDAR_RESTOS');
  select * into v_rt from recepcion_tanques where turno_id = v_turno and numero_tanque = 2;
  select * into v_prep2 from preparaciones where id = v_rt.lote_id;
  if v_rt.condicion <> 'LISTO' or not v_prep2.para_vacio then
    raise exception 'ENSAYO FALLÓ (5): la transferencia a un tanque Limpio perdió la marca de Vacío.';
  end if;
  v_n := v_n + 1;

  -- 6. Pasar a Aséptico: lote nuevo, sin marca, con lo medido como 100%.
  perform pasar_lote_a_aseptico(v_usuario, v_turno, 2::smallint, 500);
  select * into v_rt from recepcion_tanques where turno_id = v_turno and numero_tanque = 2;
  select * into v_prep from preparaciones where id = v_rt.lote_id;
  if v_prep.para_vacio or v_prep.volumen_inicial_l <> 500 or v_prep.id = v_prep2.id
     or (select cerrado_en from preparaciones where id = v_prep2.id) is null then
    raise exception 'ENSAYO FALLÓ (6): pasar a Aséptico no creó el lote nuevo con 500 L.';
  end if;
  v_n := v_n + 1;

  -- 7. Salida a Vacío de un lote de Aséptico, todo: el tanque queda Con Restos 0 L.
  perform entregar_a_vacio(v_usuario, v_turno, 2::smallint, null);
  select * into v_rt from recepcion_tanques where turno_id = v_turno and numero_tanque = 2;
  if v_rt.condicion <> 'SUCIO' or v_rt.ultimo_lote not like 'Entregado a Vacío%'
     or not exists (select 1 from salidas_vacio where lote_id = v_prep.id and litros = 500 and not de_lote_vacio)
     or (select cerrado_en from preparaciones where id = v_prep.id) is null then
    raise exception 'ENSAYO FALLÓ (7): entregar todo no dejó el tanque Con Restos 0 L (%).', v_rt.condicion;
  end if;
  v_n := v_n + 1;

  -- 8. Recibir de Vacío en un tanque Con Restos 0 L.
  perform recibir_de_vacio(v_usuario, v_turno, 1::smallint, v_sabor, 'ENSAYO-V2', 3000);
  select * into v_rt from recepcion_tanques where turno_id = v_turno and numero_tanque = 1;
  select * into v_prep from preparaciones where id = v_rt.lote_id;
  if v_rt.condicion <> 'LISTO' or not v_prep.para_vacio or v_prep.volumen_inicial_l <> 3000 or v_prep.tambores <> 0 then
    raise exception 'ENSAYO FALLÓ (8): recibir de Vacío no dejó el tanque Listo con 3000 L de Vacío.';
  end if;
  v_n := v_n + 1;

  -- 9. turno_json trae las salidas.
  v_json := turno_json(v_turno);
  if jsonb_array_length(v_json->'salidas_vacio') < 2 then
    raise exception 'ENSAYO FALLÓ (9): turno_json no trae las salidas a Vacío.';
  end if;
  v_n := v_n + 1;

  raise exception 'ENSAYO OK: la migración 20261109490000 funciona (% chequeos). No quedó nada aplicado.', v_n;
end;
$$;

rollback;
