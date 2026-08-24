-- ============================================================
-- RECEPCIÓN: renombre VOLUMEN → LISTO + flujo de liberación
-- ============================================================
-- El usuario aclaró la terminología real de planta:
--   - Un tanque VACÍO se pasa a "En Preparación" (NO liberado) con
--     UNA sola acción que ya pide sabor/lote/volumen/tambores/ajustes
--     — antes esto eran dos pasos sueltos (cambiar condición +
--     registrar preparación por separado).
--   - "Liberar" (pasar a LISTO) es un cambio de estado aparte, sin
--     pedir datos nuevos — recién ahí el tanque queda disponible para
--     que una corrida lo use. Antes la condición se llamaba VOLUMEN;
--     ahora es LISTO en todos lados (más claro: "tiene volumen" no
--     dice nada de si está aprobado para usar).
--   - "Activar corrida" pasa a pedir TANQUE (no lote suelto) — el
--     lote y sabor salen solos del tanque elegido, y solo se puede
--     elegir un tanque que esté LISTO (liberado), nunca uno todavía
--     "En Preparación".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Renombrar la condición VOLUMEN → LISTO (dato + constraint).
-- ------------------------------------------------------------
alter table recepcion_tanques drop constraint recepcion_tanques_condicion_check;
update recepcion_tanques set condicion = 'LISTO' where condicion = 'VOLUMEN';
alter table recepcion_tanques add constraint recepcion_tanques_condicion_check
  check (condicion in ('LISTO', 'SUCIO', 'VACIO', 'EN_PREPARACION'));

-- ------------------------------------------------------------
-- 2. preparaciones (= lotes) gana volumen_l y liberado_en.
-- ------------------------------------------------------------
alter table preparaciones add column volumen_l numeric(10, 2) check (volumen_l is null or (volumen_l >= 0 and volumen_l <= 20000));
alter table preparaciones add column liberado_en timestamptz;

-- ------------------------------------------------------------
-- 3. turno_json(): preparaciones gana volumen_l/liberado_en.
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
        'volumen_l', prep.volumen_l,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at,
        'liberado_en', prep.liberado_en,
        'cerrado_en', prep.cerrado_en
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
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
-- 4. iniciar_preparacion(): reemplaza al combo "cambiar condición a
--    EN_PREPARACION" + "registrar preparación" por UNA sola acción,
--    atómica: crea el lote (con volumen ahora incluido) y pone el
--    tanque en EN_PREPARACION (no liberado — sabor/volumen/lote del
--    tanque quedan en null hasta que se libere).
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
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 5. liberar_lote(): marca el lote como liberado (sin pedir datos
--    nuevos) y pasa el tanque a LISTO, copiando sabor/lote/volumen
--    del lote hacia recepcion_tanques.
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
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 6. activar_linea(): ahora pide TANQUE (no lote suelto) — solo
--    puede ser uno LISTO. El lote/sabor salen del tanque elegido.
-- ------------------------------------------------------------
drop function if exists activar_linea(text, uuid, text, integer, integer, numeric, uuid, text, uuid);

create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_numero_tanque smallint
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
  v_tanque recepcion_tanques%rowtype;
  v_lote_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  select id into v_lote_id from preparaciones
  where numero_tanque = p_numero_tanque and liberado_en is not null and cerrado_en is null
  order by liberado_en desc
  limit 1;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_lote_id, true, now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 7. registrar_preparacion() queda reemplazada por iniciar_preparacion
--    (todo el lote se crea de una sola vez, con volumen incluido).
-- ------------------------------------------------------------
drop function if exists registrar_preparacion(uuid, smallint, uuid, text, integer, numeric, numeric, numeric, text);

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, numeric, integer, numeric, numeric, numeric) to anon, authenticated;
grant execute on function liberar_lote(text, uuid, uuid) to anon, authenticated;
grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint) to anon, authenticated;
