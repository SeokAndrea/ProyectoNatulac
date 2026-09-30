-- ============================================================
-- LÍNEAS: "Parada" suma el +1 en Registrar Paradas
-- ============================================================
-- plan-lineas-pt-paradas.md, sección H (dueño, 2026-09-30). Antes la
-- "Parada Operacional" solo pausaba la corrida y no quedaba nada en
-- Registrar Paradas.
--
--   * Tipo nuevo "Parada por clasificar": el +1 que crea Líneas. El tipo
--     real se elige después, al completarla en Registrar Paradas.
--   * pausar_linea(): la descripción es obligatoria; en la misma
--     transacción suma el +1 y lo liga a la línea (lineas_estado.parada_id).
--   * continuar_linea(): no deja continuar mientras esa parada esté sin
--     completar (tipo y minutos).
--   * completar_parada(): una "Parada por clasificar" exige elegir el tipo
--     real del catálogo.
-- Requiere 20261090 y 20261091 aplicadas.
-- ============================================================

insert into paradas_tipos (codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, secuencia_planilla, orden, codigo_con_linea)
values ('POR_CLASIFICAR', 'Parada por clasificar', 'NO_PROGRAMADA', 'OPERACIONAL', null, '', null, 901, false)
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 1. +1 "Parada por clasificar" (interno: lo llama pausar_linea).
-- ------------------------------------------------------------
create or replace function sumar_parada_por_clasificar(p_usuario text, p_linea_codigo text, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo paradas_tipos;
  v_turno_id uuid;
  v_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;
  select * into v_tipo from paradas_tipos where codigo = 'POR_CLASIFICAR';

  if exists (select 1 from paradas where linea_id = v_linea_id and tipo_id = v_tipo.id and pendiente) then
    raise exception 'Ya hay una parada sin clasificar en %. Complétala en Registrar Paradas antes de parar otra vez.', v_linea_nombre;
  end if;

  select tu.id into v_turno_id
  from turnos tu
  where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
  order by tu.fecha desc, tu.hora_inicio desc
  limit 1;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por)
  values (v_turno_id, v_linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_tipo.nombre, null, p_nota,
          now(), now(), true, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, 'Líneas (Parada)',
    format('+1 «Parada por clasificar» en %s: %s', v_linea_nombre, p_nota),
    null,
    jsonb_build_object('linea_id', v_linea_id, 'tipo', v_tipo.nombre, 'pendiente', true, 'nota', p_nota)
  );
  return v_id;
end;
$$;

revoke execute on function sumar_parada_por_clasificar(text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. pausar_linea(): igual que 20261082 + descripción obligatoria y +1.
-- ------------------------------------------------------------
create or replace function pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_linea_codigo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_parada_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null
  for update;
  if not found then
    return turno_json(p_turno_id);  -- ya estaba en pausa o no está activa: como antes, no hace nada
  end if;
  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;

  select codigo into v_linea_codigo from lineas where id = v_c.linea_id;
  v_parada_id := sumar_parada_por_clasificar(p_usuario, v_linea_codigo, left(v_motivo, 140));

  update turno_lineas
  set pausada_en = now(),
      pausa_motivo = v_motivo,
      actualizada_por = v_usuario_id
  where id = v_c.id;

  insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
  values (p_turno_id, v_c.linea_id, 'LISTA', v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. continuar_linea(): igual que 20261082 + exige la parada completa.
-- ------------------------------------------------------------
create or replace function continuar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_le lineas_estado;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en Registrar Paradas antes de continuar.';
    end if;
    update lineas_estado set parada_id = null where id = v_le.id;
  end if;

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. completar_parada(): igual que 20261090 + "Parada por clasificar"
--    exige elegir el tipo real (cualquiera del catálogo menos los dos
--    provisionales).
-- ------------------------------------------------------------
create or replace function completar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_minutos integer default null,
  p_inicio text default null,
  p_fin text default null,
  p_tipo_codigo text default null,
  p_justificacion text default null,
  p_pagina text default 'Registrar Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
  v_tipo_actual text;
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
  v_just text := nullif(trim(coalesce(p_justificacion, '')), '');
begin
  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if not v_p.pendiente then
    raise exception 'Esa parada ya está completa.';
  end if;

  select codigo into v_tipo_actual from paradas_tipos where id = v_p.tipo_id;

  if v_tipo_actual = 'FALLA_SIN_ESPECIFICAR' then
    if coalesce(p_tipo_codigo, '') = '' then
      raise exception 'Elige el código y el equipo de la falla.';
    end if;
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.id is not null and (v_tipo.equipo_id is null or v_tipo.codigo = 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige una falla de equipo del catálogo.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  elsif v_tipo_actual = 'POR_CLASIFICAR' then
    if coalesce(p_tipo_codigo, '') = '' then
      raise exception 'Elige el tipo de la parada.';
    end if;
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige un tipo de parada del catálogo.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  else
    select * into v_tipo from paradas_tipos where id = v_p.tipo_id;
    v_nombre := v_p.tipo_nombre;
  end if;
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_ini := hora_planta_a_timestamptz(p_inicio, 'inicio');
  v_fin := hora_planta_a_timestamptz(p_fin, 'fin');
  if v_ini is not null or v_fin is not null then
    if v_ini is null or v_fin is null then
      raise exception 'Pon la hora de inicio y la de fin, o solo los minutos.';
    end if;
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  else
    if p_minutos is null or p_minutos <= 0 then
      raise exception 'Pon cuántos minutos duró la parada.';
    end if;
    if p_minutos > 30 * 24 * 60 then
      raise exception 'La parada no puede durar más de 30 días.';
    end if;
    v_ini := v_p.inicio;
    v_fin := v_ini + make_interval(mins => p_minutos);
    if v_fin > now() then
      v_fin := now();
      v_ini := v_fin - make_interval(mins => p_minutos);
    end if;
  end if;

  v_min := round(extract(epoch from (v_fin - v_ini)) / 60);
  if v_guia is not null and v_min > v_guia and v_just is null then
    raise exception 'La parada duró % min y su tiempo guía es % min. Escribe la justificación.', v_min, round(v_guia);
  end if;

  update paradas
  set tipo_id = v_tipo.id,
      clase = coalesce(v_tipo.clase, v_p.clase),  -- tiempo ocioso de texto libre: sin tipo, conserva su clase
      tipo_nombre = v_nombre,
      tiempo_guia_min = v_guia,
      inicio = v_ini,
      fin = v_fin,
      justificacion_desvio = case when v_guia is not null and v_min > v_guia then v_just else null end,
      pendiente = false
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Completó la parada «%s» (%s min)', v_nombre, v_min),
    jsonb_build_object('pendiente', true, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('pendiente', false, 'tipo', v_nombre, 'minutos', v_min, 'justificacion', v_just)
  );
end;
$$;
