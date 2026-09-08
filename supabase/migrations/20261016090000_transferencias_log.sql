-- ============================================================
-- TRANSFERENCIAS: registro con motivo (enum)
-- ============================================================
-- Fase 2 del rework, sección 2.4. Hoy `transferir_tanque` mueve líquido
-- entre tanques sin dejar dicho POR QUÉ. Se agrega una tabla de registro
-- `transferencias` (append-only) y `transferir_tanque` escribe una fila
-- por cada transferencia exitosa, con un `motivo` de una lista fija:
--
--   CONSOLIDAR_RESTOS  -- juntar restos para liberar un tanque
--   ENRUTAR_MANIFOLD   -- mover líquido para no parar la línea (el
--                          enrutamiento por manifold del Contexto)
--
-- Decisión (2026-09-08): la tabla registra SOLO transferencias
-- tanque→tanque. El desvase a pipa ya queda registrado en su propia
-- tabla `desvases` (área, sabor, litros, lote_origen) — no se duplica
-- acá, y por eso el enum no lleva un valor DESVASE_PIPA.
--
-- No se le pone trigger de auditoría: la tabla ES el registro, sus filas
-- solo se insertan (nunca update/delete) y siempre desde
-- `transferir_tanque`, que ya audita los cambios de tanque/lote que
-- provoca.
--
-- Aditiva. `transferir_tanque` se DROP+CREATE porque suma un parámetro.
-- ============================================================

create type motivo_transferencia as enum ('CONSOLIDAR_RESTOS', 'ENRUTAR_MANIFOLD');

create table transferencias (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  tanque_origen smallint not null,
  tanque_destino smallint not null,
  litros numeric(10, 2) not null check (litros >= 0),
  modo text check (modo in ('LIQUIDO', 'LOTE')),   -- null si el destino estaba Limpio (los dos modos dan igual)
  motivo motivo_transferencia not null,
  usuario_id uuid not null references usuarios (id),
  creado_en timestamptz not null default now()
);

alter table transferencias enable row level security;

create index transferencias_turno_idx on transferencias (turno_id);

-- ------------------------------------------------------------
-- transferir_tanque(): idéntica a
-- 20261014090000_transferir_cierra_lote_origen_parejo.sql + p_motivo y
-- el insert en `transferencias`.
-- ------------------------------------------------------------
drop function if exists transferir_tanque(text, uuid, smallint, smallint, text);

create function transferir_tanque(
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
begin
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

  v_litros_movidos := coalesce(v_origen.volumen_l, 0);
  v_destino_era_limpio := v_destino.condicion = 'LIMPIO';

  select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

  if v_destino.condicion = 'LIMPIO' then
    -- Nada que absorber en el destino: los dos modos dan lo mismo — el
    -- origen se muda tal cual, con su propia identidad.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen.volumen_l, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se mudo al lote nuevo del destino).
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_origen.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_origen.volumen_l, 0)
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se absorbio en el lote destino).
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_destino.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_destino.volumen_l, 0),
        numero_tanque = p_numero_tanque_destino
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
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id
    where lote_id = v_destino.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_destino.volumen_l, 0), 0)
    where id = v_destino.lote_id;

    -- Se cierra el lote VIEJO del destino: el que sobrevive es el del
    -- origen, que se muda al tanque destino y queda abierto.
    update preparaciones set cerrado_en = now() where id = v_destino.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Lote ' || coalesce(v_origen.lote, '') || ' trasladado al Tanque ' || p_numero_tanque_destino;
  end if;

  -- El tanque origen siempre queda sin lote propio al final — o se
  -- cerró (LIQUIDO/LIMPIO) o se mudó físicamente al destino (LOTE).
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

  insert into transferencias (turno_id, tanque_origen, tanque_destino, litros, modo, motivo, usuario_id)
  values (
    p_turno_id,
    p_numero_tanque_origen,
    p_numero_tanque_destino,
    v_litros_movidos,
    case when v_destino_era_limpio then null else p_modo end,
    p_motivo::motivo_transferencia,
    v_usuario_id
  );

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint, text, text) to anon, authenticated;
