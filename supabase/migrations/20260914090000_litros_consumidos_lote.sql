-- ============================================================
-- LITROS CONSUMIDOS DEL LOTE: al registrar el contador de una
-- corrida, se descuentan los litros usados del LOTE que alimentó esa
-- corrida (no directo del tanque) — un tanque se recarga con lotes
-- distintos con el tiempo, así que el número correcto para restar es
-- el del lote específico consumido. Si ese lote sigue siendo el que
-- el tanque tiene cargado ahora mismo, se refleja también ahí (Status
-- muestra el volumen del tanque = volumen del lote que tiene adentro).
-- Si el tanque ya se recargó con un lote nuevo mientras tanto, el
-- descuento queda solo en el histórico del lote viejo — no le resta
-- al número del lote nuevo que ya está en el tanque.
--
-- litros_consumidos = envases_llenadora × (volumen_ml de la
-- presentación de la corrida) / 1000.
--
-- El contador que "cierra" una corrida que estaba Esperando Cierre
-- (activa=false por terminar_sabor_linea, finalizada_en todavía
-- null) es justamente este: recién con el contador cargado se sabe
-- cuánto se consumió de verdad, así que acá mismo se marca
-- finalizada_en.
-- ============================================================

-- ------------------------------------------------------------
-- 1. recepcion_tanques gana lote_id: match confiable de "sigue
--    siendo el mismo lote" (antes solo había el texto libre "lote",
--    que dos lotes distintos podrían compartir por error de tipeo).
-- ------------------------------------------------------------
alter table recepcion_tanques add column lote_id uuid references preparaciones (id);

-- ------------------------------------------------------------
-- 1b. iniciar_turno(): al heredar recepcion_tanques del turno
--     anterior, copiar también lote_id (si no, un tanque LISTO que
--     cruza de un turno a otro pierde el link a su lote y el
--     contador de una corrida vieja ya no podría reflejarle el
--     descuento — quedaría protegido de más).
-- ------------------------------------------------------------
create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_fecha date,
  p_hora_inicio time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_area_id uuid;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_i integer;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := 'T-' || to_char(p_fecha, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio)
  returning id into v_turno_id;

  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by t2.fecha desc, t2.hora_inicio desc, t2.created_at desc
  limit 1;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por
    from turno_lineas
    where turno_id = v_turno_anterior_id and activa;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'VACIO');
    end loop;
  end if;

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 2. liberar_lote(): además de sabor/volumen/lote, copia lote_id.
-- ------------------------------------------------------------
create or replace function liberar_lote(p_usuario text, p_turno_id uuid, p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  update preparaciones set liberado_en = now() where id = p_lote_id and liberado_en is null;

  update recepcion_tanques
  set condicion = 'LISTO',
      sabor_id = v_lote.sabor_id,
      volumen_l = v_lote.volumen_l,
      lote = v_lote.lote,
      lote_id = p_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. iniciar_preparacion(): limpia lote_id del tanque al mandarlo a
--    EN_PREPARACION (igual que ya limpia sabor/volumen/lote).
-- ------------------------------------------------------------
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_volumen_l numeric,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, nullif(p_lote, ''), p_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id);

  update recepcion_tanques
  set condicion = 'EN_PREPARACION',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. cambiar_condicion_tanque(): escape hatch manual — siempre limpia
--    lote_id (una corrección a mano ya no está atada de forma
--    confiable a un lote real).
-- ------------------------------------------------------------
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text
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
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion = 'SUCIO' and v_actual.condicion = 'LISTO' and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion = 'LISTO' then p_sabor_id else null end,
      volumen_l = case when p_condicion = 'LISTO' then p_volumen_l else null end,
      lote = case when p_condicion = 'LISTO' then nullif(p_lote, '') else null end,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 5. registrar_contador(): además de insertar el contador, descuenta
--    los litros consumidos del lote (y del tanque si sigue siendo el
--    mismo), y cierra la corrida si estaba esperando cierre. Devuelve
--    turno_json() completo (como el resto de las mutaciones) en vez
--    de solo la fila de contador, para refrescar tanques/lotes/líneas
--    de una sola vez.
-- ------------------------------------------------------------
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
  v_lote_id uuid;
  v_volumen_ml integer;
  v_litros_consumidos numeric;
  v_nuevo_volumen numeric;
  v_numero_tanque smallint;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id);

  select tl.lote_id, p.volumen_ml into v_lote_id, v_volumen_ml
  from turno_lineas tl
  left join presentaciones p on p.id = tl.presentacion_id
  where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_volumen_ml is not null then
    v_litros_consumidos := p_envases_llenadora * v_volumen_ml / 1000.0;

    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_consumidos)
    where id = v_lote_id
    returning volumen_l, numero_tanque into v_nuevo_volumen, v_numero_tanque;

    update recepcion_tanques
    set volumen_l = v_nuevo_volumen
    where turno_id = p_turno_id
      and numero_tanque = v_numero_tanque
      and lote_id = v_lote_id;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
grant execute on function liberar_lote(text, uuid, uuid) to anon, authenticated;
grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, integer, numeric, numeric, numeric) to anon, authenticated;
grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text) to anon, authenticated;
grant execute on function registrar_contador(uuid, uuid, text, integer, text, text) to anon, authenticated;
