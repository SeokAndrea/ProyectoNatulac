-- ============================================================
-- PREPARACIÓN: estado continuo de líneas y tanques
-- ============================================================
-- Hasta acá, "Líneas en uso" y "Recepción" se cargaban UNA sola vez
-- al presionar "Empezar Turno" y quedaban fijas para todo el turno.
-- El usuario pidió que dejen de resetearse turno a turno: una línea o
-- un tanque activado sigue activo hasta que un supervisor lo cambie a
-- mano, sin importar cuántos turnos pasen — y que esa activación se
-- pueda hacer en cualquier momento (no solo al empezar turno).
--
-- Cambios:
--   1. turno_lineas y recepcion_tanques ganan columnas para soportar
--      esto (lote y tanque_numero en líneas; hora de activación y
--      "último sabor/lote" en tanques).
--   2. Funciones nuevas activar_linea/detener_linea/
--      cambiar_condicion_tanque — se pueden llamar en cualquier
--      momento del turno, no solo al crearlo.
--   3. iniciar_turno() pierde los parámetros p_lineas/p_tanques: ya no
--      los pide el supervisor. En su lugar, copia el último estado de
--      líneas y tanques del turno más reciente de la misma área
--      (cualquier supervisor). Si es la primera vez que se usa esto
--      para esa área, arranca con los 3 tanques en VACÍO y ninguna
--      línea activa — Preparación permite activar todo desde cero
--      igual que cualquier otro día, no hay una pantalla especial de
--      "primera carga".
--   4. turno_json() se extiende para exponer los campos nuevos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
alter table turno_lineas add column lote text;
alter table turno_lineas add column tanque_numero smallint check (tanque_numero is null or tanque_numero between 1 and 3);
alter table turno_lineas add column activada_en timestamptz not null default now();
alter table turno_lineas add column activada_por uuid references usuarios (id);

alter table recepcion_tanques add column activada_en timestamptz not null default now();
alter table recepcion_tanques add column ultimo_sabor_id uuid references sabores (id);
alter table recepcion_tanques add column ultimo_lote text;
alter table recepcion_tanques add column actualizada_por uuid references usuarios (id);

-- ------------------------------------------------------------
-- 2. turno_json(): agrega lote/tanque_numero/activada_en a líneas, y
--    activada_en/último sabor-lote a tanques.
-- ------------------------------------------------------------
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
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sl.nombre,
        'lote', tl.lote,
        'tanque_numero', tl.tanque_numero,
        'activada_en', tl.activada_en
      ))
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre,
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', us.nombre,
        'ultimo_lote', rt.ultimo_lote
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join sabores us on us.id = rt.ultimo_sabor_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'envases_desechados', c.envases_desechados,
        'merma_pct', c.merma_pct,
        'requiere_justificacion', c.requiere_justificacion,
        'justificacion', c.justificacion,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l3.codigo,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', s2.nombre,
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at
      ))
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', s3.nombre,
        'lote', prep.lote,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      where prep.turno_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 3. activar_linea / detener_linea: se pueden llamar en cualquier
--    momento del turno, no solo al crearlo. activar_linea hace
--    upsert (si la línea ya estaba activa, actualiza sus datos y
--    refresca activada_en en vez de duplicar la fila).
-- ------------------------------------------------------------
create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_sabor_id uuid,
  p_lote text,
  p_tanque_numero smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_presentacion_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, tanque_numero, activada_en, activada_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, p_sabor_id, nullif(p_lote, ''), p_tanque_numero, now(), v_usuario_id
  )
  on conflict (turno_id, linea_id) do update
    set presentacion_id = excluded.presentacion_id,
        envases_hora = excluded.envases_hora,
        litros_hora = excluded.litros_hora,
        sabor_id = excluded.sabor_id,
        lote = excluded.lote,
        tanque_numero = excluded.tanque_numero,
        activada_en = now(),
        activada_por = excluded.activada_por;

  return turno_json(p_turno_id);
end;
$$;

create or replace function detener_linea(p_usuario text, p_turno_id uuid, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from turno_lineas
  where turno_id = p_turno_id
    and linea_id = (select id from lineas where codigo = p_linea_codigo);

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. cambiar_condicion_tanque: cambia la condición de un tanque en
--    cualquier momento. Si pasa de VOLUMEN a SUCIO, copia el sabor y
--    lote que tenía a ultimo_sabor_id/ultimo_lote antes de limpiarlos
--    — así SUCIO puede mostrar "último sabor · lote" sin que el
--    supervisor tenga que volver a escribirlo.
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

  if p_condicion = 'SUCIO' and v_actual.condicion = 'VOLUMEN' and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion = 'VOLUMEN' then p_sabor_id else null end,
      volumen_l = case when p_condicion = 'VOLUMEN' then p_volumen_l else null end,
      lote = case when p_condicion = 'VOLUMEN' then nullif(p_lote, '') else null end,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 5. iniciar_turno(): ya no recibe líneas ni tanques — los hereda del
--    turno más reciente de la misma área (cualquier supervisor,
--    abierto o cerrado). Si no hay ninguno previo, arranca con los 3
--    tanques en VACÍO y ninguna línea activa.
-- ------------------------------------------------------------
drop function if exists iniciar_turno(text, text, text, text, jsonb, jsonb, date, time);

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
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, tanque_numero, activada_en, activada_por
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, tanque_numero, activada_en, activada_por
    from turno_lineas
    where turno_id = v_turno_anterior_id;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
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

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, uuid, text, smallint) to anon, authenticated;
grant execute on function detener_linea(text, uuid, text) to anon, authenticated;
grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text) to anon, authenticated;
