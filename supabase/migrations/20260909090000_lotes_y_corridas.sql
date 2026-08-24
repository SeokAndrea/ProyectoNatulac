-- ============================================================
-- LOTES: cada preparación es su propio lote (no se suman) +
-- corridas de línea con historial real (no se borran al detener) +
-- Contadores de un solo valor + Producto Terminado por corrida
-- ============================================================
-- El usuario describió el flujo real de planta y no coincidía con lo
-- construido hasta acá en varios puntos:
--
--   1. Cada preparación (tambores) es un LOTE independiente — hoy la
--      pantalla de Preparación sumaba los tambores de todas las
--      preparaciones del tanque, dando un total que no existe en la
--      realidad. No hace falta cambiar la tabla para esto (cada
--      preparación ya es su propia fila) — pero se le agrega
--      "cerrado_en" para poder marcar cuándo ese lote se terminó de
--      usar.
--   2. Una corrida de línea (turno_lineas) queda ligada al lote que
--      consume (lote_id), y "detener línea" pasa a ARCHIVAR la
--      corrida (activa=false, finalizada_en) en vez de borrar la fila
--      — así se puede mirar después "qué pasó con el Lote 1 de la
--      Línea 1". Por eso turno_lineas deja de tener una sola fila por
--      (turno, línea): ahora puede haber varias (una por corrida),
--      con un índice único que garantiza que a lo sumo UNA esté
--      activa a la vez por (turno, línea).
--   3. Contadores pasa a pedir un solo valor (envases_llenadora) en
--      vez de buenos/desechados — la merma se calcula comparando
--      contra Producto Terminado de esa MISMA corrida (turno_linea_id),
--      no como columnas generadas dentro de contadores. Se sigue
--      pudiendo agregar/editar la justificación después, cuando la
--      merma ya se puede calcular (para eso, actualizar_justificacion_contador).
--   4. Producto Terminado se re-referencia a la corrida
--      (turno_linea_id) en vez de a (turno_id, línea) — sigue siendo
--      upsert (se puede corregir mientras la corrida sigue activa),
--      pero una corrida nueva del Lote 2 genera un registro NUEVO en
--      vez de pisar el del Lote 1.
-- ============================================================

-- ------------------------------------------------------------
-- 1. preparaciones (= Lotes): gana cerrado_en
-- ------------------------------------------------------------
alter table preparaciones add column cerrado_en timestamptz;

-- ------------------------------------------------------------
-- 2. turno_lineas: de "una fila fija por línea" a "una fila por
--    corrida", con lote_id y ciclo de vida activa/finalizada_en.
-- ------------------------------------------------------------
alter table turno_lineas drop constraint turno_lineas_pkey;
alter table turno_lineas add column id uuid not null default gen_random_uuid();
alter table turno_lineas add constraint turno_lineas_pkey primary key (id);

alter table turno_lineas add column lote_id uuid references preparaciones (id);
alter table turno_lineas add column activa boolean not null default true;
alter table turno_lineas add column finalizada_en timestamptz;

-- tanque_numero queda reemplazado por lote_id (el lote ya sabe de qué
-- tanque es) — se borra para no tener dos fuentes de verdad.
alter table turno_lineas drop column tanque_numero;

-- A lo sumo una corrida activa por (turno, línea) a la vez.
create unique index turno_lineas_activa_unica on turno_lineas (turno_id, linea_id) where activa;

-- ------------------------------------------------------------
-- 3. contadores: un solo valor (envases_llenadora) + turno_linea_id.
--    Se van las columnas generadas (dependían de envases_desechados)
--    y buenos/desechados — la merma se calcula en el frontend
--    comparando contra Producto Terminado de la misma corrida.
-- ------------------------------------------------------------
alter table contadores drop column merma_pct;
alter table contadores drop column requiere_justificacion;
alter table contadores drop column envases_buenos;
alter table contadores drop column envases_desechados;
alter table contadores add column turno_linea_id uuid references turno_lineas (id);

-- ------------------------------------------------------------
-- 4. producto_terminado: se re-referencia a la corrida (turno_linea_id)
--    en vez de (turno_id, línea) — sigue siendo upsert, pero ahora
--    por corrida: una corrida nueva del mismo turno genera un
--    registro nuevo, no pisa al de la corrida anterior.
-- ------------------------------------------------------------
alter table producto_terminado drop constraint producto_terminado_turno_id_linea_id_key;
alter table producto_terminado add column turno_linea_id uuid references turno_lineas (id);
alter table producto_terminado add constraint producto_terminado_turno_linea_id_key unique (turno_linea_id);

-- ------------------------------------------------------------
-- 5. turno_json(): "lineas" pasa a devolver TODAS las corridas del
--    turno (activas y finalizadas durante este turno, para que el
--    historial las muestre) con id/lote_id/activa/finalizada_en.
--    Contadores y producto_terminado ganan turno_linea_id y pierden
--    las columnas viejas. Preparaciones gana cerrado_en.
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
        'id', tl.id,
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sl.nombre,
        'lote', tl.lote,
        'lote_id', tl.lote_id,
        'activa', tl.activa,
        'activada_en', tl.activada_en,
        'finalizada_en', tl.finalizada_en
      ) order by tl.activada_en)
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
        'turno_linea_id', c.turno_linea_id,
        'envases_llenadora', c.envases_llenadora,
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
        'sabor_nombre', s2.nombre,
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at
      ) order by pt.updated_at desc)
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
        'creado_en', prep.created_at,
        'cerrado_en', prep.cerrado_en
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      -- Los del turno (para SU historial, abiertos o cerrados) + CUALQUIER
      -- lote todavía abierto (cerrado_en null) sin importar en qué turno se
      -- creó — un lote puede seguir vigente al cruzar de un turno al
      -- siguiente (ver recepcion_tanques, que sí se hereda), así que
      -- Preparación tiene que poder verlo y las líneas poder tomarlo.
      where prep.turno_id = t.id or prep.cerrado_en is null
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
-- 6. iniciar_turno(): al heredar turno_lineas del turno anterior,
--    solo copia las corridas ACTIVAS (las finalizadas quedan como
--    historial del turno donde se cerraron, no se re-arrastran).
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

-- ------------------------------------------------------------
-- 7. activar_linea(): si la línea ya tenía una corrida activa, la
--    cierra (finaliza) y crea una fila nueva — cada corrida es su
--    propio tramo, nunca se pisan los datos de la anterior.
-- ------------------------------------------------------------
drop function if exists activar_linea(text, uuid, text, integer, integer, numeric, uuid, text, smallint);

create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_sabor_id uuid,
  p_lote text,
  p_lote_id uuid
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

  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, p_sabor_id, nullif(p_lote, ''), p_lote_id, true, now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 8. finalizar_linea() (reemplaza a detener_linea): archiva la
--    corrida en vez de borrarla.
-- ------------------------------------------------------------
drop function if exists detener_linea(text, uuid, text);

create or replace function finalizar_linea(p_usuario text, p_turno_id uuid, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id
    and linea_id = (select id from lineas where codigo = p_linea_codigo)
    and activa;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 9. finalizar_lote(): cierra la preparación (cerrado_en) y archiva
--    cualquier corrida activa que la esté usando (cascada, ver punto
--    "se da finalizar al tanque y a la línea" del flujo descrito).
-- ------------------------------------------------------------
create or replace function finalizar_lote(p_usuario text, p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  select turno_id into v_turno_id from preparaciones where id = p_lote_id;

  update preparaciones set cerrado_en = now() where id = p_lote_id and cerrado_en is null;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where lote_id = p_lote_id and activa;

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 10. registrar_contador(): un solo valor (envases_llenadora),
--     ligado a la corrida (turno_linea_id) en vez de calcular merma
--     acá adentro.
-- ------------------------------------------------------------
drop function if exists registrar_contador(uuid, text, integer, integer, integer, text, text);

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
  v_registro contadores%rowtype;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id)
  returning * into v_registro;

  return jsonb_build_object(
    'id', v_registro.id,
    'linea_codigo', p_linea_codigo,
    'turno_linea_id', v_registro.turno_linea_id,
    'envases_llenadora', v_registro.envases_llenadora,
    'justificacion', v_registro.justificacion,
    'creado_en', v_registro.created_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 11. actualizar_justificacion_contador(): agregar/editar la
--     justificación DESPUÉS de registrado el contador, para cuando
--     recién en ese momento se conoce la merma (comparando contra
--     Producto Terminado, que puede cargarse antes o después).
-- ------------------------------------------------------------
create or replace function actualizar_justificacion_contador(p_contador_id uuid, p_justificacion text)
returns void
language sql
security definer
set search_path = public
as $$
  update contadores set justificacion = nullif(p_justificacion, '') where id = p_contador_id;
$$;

-- ------------------------------------------------------------
-- 12. registrar_producto_terminado(): re-referenciado a la corrida
--     (turno_linea_id) — upsert por corrida, no por (turno, línea).
-- ------------------------------------------------------------
drop function if exists registrar_producto_terminado(uuid, text, uuid, integer, integer, integer, text);

create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_sabor_nombre text;
  v_registro producto_terminado%rowtype;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select nombre into v_sabor_nombre from sabores where id = p_sabor_id;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        updated_at = now()
  returning * into v_registro;

  return jsonb_build_object(
    'id', v_registro.id,
    'linea_codigo', p_linea_codigo,
    'turno_linea_id', v_registro.turno_linea_id,
    'sabor_id', v_registro.sabor_id,
    'sabor_nombre', v_sabor_nombre,
    'presentacion_volumen_ml', p_volumen_ml,
    'paletas', v_registro.paletas,
    'cajas_sueltas', v_registro.cajas_sueltas,
    'litros_producidos', v_registro.litros_producidos,
    'creado_en', v_registro.updated_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 13. estadisticas_produccion(): pasa de "una fila por (turno, línea)"
--     a "una fila por CORRIDA" (turno_lineas ahora tiene varias filas
--     por línea, una por lote) — si no se cambia esto, cada corrida
--     de una línea se contaría de más. Pierde envases_buenos/
--     envases_desechados (ya no existen); "merma teórica" deja de
--     calcularse en el frontend porque ya no hay con qué — la única
--     merma que queda es la real (llenadora vs. producto terminado),
--     ver src/lib/estadisticas.ts.
-- ------------------------------------------------------------
drop function if exists estadisticas_produccion(date, date);

create or replace function estadisticas_produccion(p_fecha_desde date default null, p_fecha_hasta date default null)
returns table (
  turno_id uuid,
  turno_codigo text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  estado text,
  turno_tipo_codigo text,
  grupo_codigo text,
  area_codigo text,
  supervisor_usuario text,
  supervisor_nombre text,
  linea_codigo text,
  turno_linea_id uuid,
  envases_llenadora bigint,
  paletas integer,
  cajas_sueltas integer,
  cajas_x_paleta integer,
  envases_x_caja integer,
  litros_producidos numeric,
  sabor_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.id,
    t.codigo,
    t.fecha,
    t.hora_inicio,
    t.hora_fin,
    t.estado,
    tt.codigo,
    g.codigo,
    a.codigo,
    u.usuario,
    u.nombre,
    l.codigo,
    tl.id,
    coalesce(ct.envases_llenadora, 0),
    coalesce(pt.paletas, 0),
    coalesce(pt.cajas_sueltas, 0),
    coalesce(pr.cajas_x_paleta, 0),
    coalesce(pr.envases_x_caja, 0),
    coalesce(pt.litros_producidos, 0),
    s.nombre
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join turno_lineas tl on tl.turno_id = t.id
  join lineas l on l.id = tl.linea_id
  left join lateral (
    select sum(c.envases_llenadora) as envases_llenadora
    from contadores c
    where c.turno_linea_id = tl.id
  ) ct on true
  left join producto_terminado pt on pt.turno_linea_id = tl.id
  left join presentaciones pr on pr.id = pt.presentacion_id
  left join sabores s on s.id = pt.sabor_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
  order by t.fecha desc, t.hora_inicio desc, l.codigo, tl.activada_en;
end;
$$;

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
grant execute on function estadisticas_produccion(date, date) to anon, authenticated;
grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, uuid, text, uuid) to anon, authenticated;
grant execute on function finalizar_linea(text, uuid, text) to anon, authenticated;
grant execute on function finalizar_lote(text, uuid) to anon, authenticated;
grant execute on function registrar_contador(uuid, uuid, text, integer, text, text) to anon, authenticated;
grant execute on function actualizar_justificacion_contador(uuid, text) to anon, authenticated;
grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
