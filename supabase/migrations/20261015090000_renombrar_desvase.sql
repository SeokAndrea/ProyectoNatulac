-- ============================================================
-- RENOMBRA "envasar / tobos / reserva" -> "desvase"
-- ============================================================
-- Fase 2 del rework. Decision del dueno (revierte la nota de vocabulario
-- de la seccion 2.4 del plan, que decia dejar el identificador de base
-- como estaba): los identificadores tienen que llamarse igual a lo que
-- hacen, para no volver a confundir.
--
-- El lio: "Envasar" en la planta es poner el jugo en su empaque final
-- (Producto Terminado). Lo que la funcion envasar_tanque() hace es lo
-- contrario -> sacar el resto de jugo SEMIELABORADO de un tanque y
-- guardarlo en una PIPA para otro turno. Eso se llama DESVASAR. La
-- funcion, la tabla y los parametros quedaron con el nombre equivocado.
--
-- Cambios (solo renombres, sin cambio de logica ni de datos):
--   tabla     reservas_tobos          -> desvases
--   funcion   envasar_tanque(...)     -> desvasar_tanque(...)
--   funcion   listar_reservas_tobos   -> listar_desvases   (col reserva_id -> desvase_id)
--   parametro iniciar_preparacion.p_reserva_id -> p_desvase_id
--   trigger   auditar_reservas_tobos  -> auditar_desvases
--   etiqueta  auditar_cambio(): 'reservas_tobos' -> 'desvases'
--
-- Las filas historicas de `auditoria` con entidad = 'reservas_tobos'
-- quedan como estan (dato historico). El identificador de columna
-- reservas_tobos.* no cambia (turno_id_origen, usado_en_lote_id, etc.)
-- porque ya describen bien lo que guardan.
--
-- OJO DESPLIEGUE: cambian nombres de RPC. Esta migracion y el frontend
-- que la acompana tienen que subir juntos -- frontend viejo + base nueva
-- (o al reves) deja el boton de Desvase roto en esa ventana.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla + su trigger de auditoria
-- ------------------------------------------------------------
alter table reservas_tobos rename to desvases;
alter trigger auditar_reservas_tobos on desvases rename to auditar_desvases;

-- ------------------------------------------------------------
-- 2. auditar_cambio(): idéntica a 20260987, solo cambia la etiqueta
--    de la tabla renombrada.
-- ------------------------------------------------------------
create or replace function auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_usuario_id uuid;
  v_usuario text;
  v_accion text := case tg_op when 'INSERT' then 'CREAR' when 'UPDATE' then 'EDITAR' else 'ELIMINAR' end;
  v_resumen text;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_k text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_usuario_id := coalesce(
    v_row->>'actualizada_por',
    v_row->>'usuario_id',
    v_row->>'activada_por',
    v_row->>'supervisor_id',
    v_row->>'editado_por',
    v_row->>'confirmado_inicio_por',
    v_row->>'confirmado_fin_por'
  )::uuid;
  select usuario into v_usuario from usuarios where id = v_usuario_id;

  -- Sólo columnas legibles: se descartan ids (*_id), autores (*_por),
  -- timestamps de estado (*_en) y blobs internos.
  for v_k in select jsonb_object_keys(v_row) loop
    if v_k in ('id', 'created_at', 'updated_at', 'volumenes_lote_cierre', 'tanques_encontrados')
       or v_k ~ '_(id|por|en)$' then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      if v_new->v_k is distinct from v_old->v_k then
        v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
        v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
      end if;
    elsif tg_op = 'INSERT' then
      v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
    else
      v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
    end if;
  end loop;

  -- UPDATE que sólo tocó columnas de ruido → no se audita.
  if tg_op = 'UPDATE' and v_despues = '{}'::jsonb then
    return null;
  end if;

  v_resumen := case tg_table_name
    when 'turnos' then 'Turno ' || coalesce(v_row->>'codigo', '')
    when 'turno_lineas' then 'Corrida de línea'
    when 'recepcion_tanques' then 'Tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || ' → ' || coalesce(v_row->>'condicion', '?')
    when 'preparaciones' then 'Preparación · tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || coalesce(' · lote ' || (v_row->>'lote'), '')
    when 'desvases' then 'Desvase'
    when 'velocidades_llenadora' then 'Catálogo · velocidad de llenadora'
    when 'sabores' then 'Catálogo · sabor ' || coalesce(v_row->>'nombre', '')
    when 'presentaciones' then 'Catálogo · presentación ' || coalesce(v_row->>'volumen_ml', '') || ' ml'
    when 'lineas' then 'Catálogo · línea ' || coalesce(v_row->>'codigo', '')
    when 'familias_producto' then 'Catálogo · familia ' || coalesce(v_row->>'nombre', '')
    else tg_table_name
  end;

  insert into auditoria (usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
  values (
    v_usuario_id,
    v_usuario,
    v_accion,
    tg_table_name,
    v_row->>'id',
    nullif(current_setting('app.audit_pagina', true), ''),
    v_resumen,
    case when v_antes = '{}'::jsonb then null else v_antes end,
    case when v_despues = '{}'::jsonb then null else v_despues end
  );

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 3. desvasar_tanque(): era envasar_tanque() en
--    20260964090000_envasar_a_tobos.sql. Mismo cuerpo, tabla renombrada.
-- ------------------------------------------------------------
drop function if exists envasar_tanque(text, uuid, smallint);

create or replace function desvasar_tanque(
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
    raise exception 'Este tanque no tiene un lote activo para desvasar.';
  end if;
  if coalesce(v_tanque.volumen_l, 0) <= 0 then
    raise exception 'No queda nada en este tanque para desvasar.';
  end if;

  insert into desvases (area_id, sabor_id, litros, lote_origen, turno_id_origen, usuario_id)
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

grant execute on function desvasar_tanque(text, uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. listar_desvases(): era listar_reservas_tobos(). Columna de salida
--    reserva_id -> desvase_id.
-- ------------------------------------------------------------
drop function if exists listar_reservas_tobos(text, text, uuid);

create or replace function listar_desvases(p_usuario text, p_area_codigo text, p_sabor_id uuid default null)
returns table (
  desvase_id uuid,
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
  from desvases r
  join sabores s on s.id = r.sabor_id
  join familias_producto f on f.id = s.familia_id
  join areas a on a.id = r.area_id
  where a.codigo = p_area_codigo
    and r.consumido_en is null
    and (p_sabor_id is null or r.sabor_id = p_sabor_id)
  order by r.creado_en;
end;
$$;

grant execute on function listar_desvases(text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. iniciar_preparacion(): idéntica a
--    20261003090000_evitar_lotes_y_corridas_duplicadas.sql, con
--    p_reserva_id -> p_desvase_id, v_reserva -> v_desvase y la tabla
--    renombrada. Hay que DROP + CREATE porque cambia el nombre de un
--    parámetro (create or replace no lo permite).
-- ------------------------------------------------------------
drop function if exists iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid);

create function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_desvase_id uuid default null
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
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  -- Guarda: número de lote repetido para el mismo sabor, abierto en
  -- otro tanque de la misma área.
  v_lote_norm := normalizar_lote(p_lote);
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
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_tanque_actual.volumen_l, 0), 0),
        cerrado_en = now()
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
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

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = v_lote_norm, lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;
