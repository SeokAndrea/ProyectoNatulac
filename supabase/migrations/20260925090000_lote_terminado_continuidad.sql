-- ============================================================
-- LOTE TERMINADO + CONTINUIDAD AUTOMÁTICA + NORMALIZACIÓN DE LOTE
-- ============================================================
-- El usuario describió dos vacíos del flujo real, después de que los
-- supervisores probaron la app:
--
-- 1. NORMALIZACIÓN DE LOTE: el lote se escribe a mano y dos
--    supervisores pueden tipear el mismo lote distinto ("3", "03",
--    "003", "0003") — hoy esto solo se corregía en la edición manual
--    de Status (normalizarLote() en TanqueEditForm.tsx), pero NO en
--    el camino principal (Iniciar Preparación, en Preparación). Se
--    mueve la normalización a la base de datos (normalizar_lote()),
--    para que sea la MISMA sin importar desde dónde se llame.
--
-- 2. "TERMINÓ PREPARACIÓN" → "TERMINÓ EL LOTE" en cascada: cuando un
--    supervisor arranca una preparación NUEVA sobre un tanque que ya
--    estaba Listo (con un lote en uso), eso significa que el lote
--    viejo se terminó — la(s) corrida(s) de línea que lo estaban
--    tomando quedan marcadas automáticamente "Terminó el Lote"
--    (lote_terminado_en), SIN cortarlas (activa sigue en true, igual
--    que una Parada). Desde Líneas, el supervisor ve 2 opciones:
--      - "Terminó Sabor" (como ya existía: archiva la corrida).
--      - "Continuar al siguiente lote": si el lote actual era "0003",
--        calcula "0004", busca solo (dentro del mismo turno) el
--        tanque que esté Listo con ese lote y arranca la corrida ahí
--        — la velocidad (envases_hora/litros_hora) y la presentación
--        se heredan tal cual, porque eso no cambia por turno.
-- ============================================================

-- ------------------------------------------------------------
-- 1. normalizar_lote(): "3" / "03" / "003" / "0003" → "0003". Si no es
--    puramente numérico, se deja como vino (recortado) — no se fuerza
--    un formato que no aplica.
-- ------------------------------------------------------------
create or replace function normalizar_lote(p_lote text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_recortado text;
  v_sin_ceros text;
begin
  if p_lote is null then
    return null;
  end if;

  v_recortado := trim(p_lote);
  if v_recortado = '' then
    return null;
  end if;

  if v_recortado !~ '^[0-9]+$' then
    return v_recortado;
  end if;

  v_sin_ceros := ltrim(v_recortado, '0');
  if v_sin_ceros = '' then
    v_sin_ceros := '0';
  end if;

  return lpad(v_sin_ceros, 4, '0');
end;
$$;

grant execute on function normalizar_lote(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. turno_lineas gana lote_terminado_en: cuándo el lote que
--    alimentaba esta corrida se cerró (por iniciar_preparacion nueva
--    sobre el mismo tanque) sin que el supervisor la haya cortado
--    todavía.
-- ------------------------------------------------------------
alter table turno_lineas add column lote_terminado_en timestamptz;

-- ------------------------------------------------------------
-- 3. iniciar_preparacion(): normaliza el lote y, si el tanque ya
--    estaba Listo con un lote en uso, lo cierra y marca "Terminó el
--    Lote" en las corridas activas que lo estaban tomando.
-- ------------------------------------------------------------
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
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
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  select * into v_tanque_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque_actual.condicion = 'LISTO' and v_tanque_actual.lote_id is not null then
    update preparaciones set cerrado_en = now() where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id);

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
-- 4. finalizar_lote(): mismo criterio que iniciar_preparacion — cierra
--    el lote pero ya NO archiva la corrida directo, la marca "Terminó
--    el Lote" para que el supervisor elija desde Líneas.
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
  set lote_terminado_en = now()
  where lote_id = p_lote_id and activa;

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 5. cambiar_condicion_tanque(): normaliza el lote también en el
--    escape hatch manual de Status (mismo estándar que Preparación).
-- ------------------------------------------------------------
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null
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
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

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
      lote = case when p_condicion = 'LISTO' then normalizar_lote(p_lote) else null end,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 6. continuar_siguiente_lote(): cierra la corrida actual (que estaba
--    "Terminó el Lote") y arranca una nueva en el tanque que tenga el
--    lote siguiente (mismo ancho, +1) ya Listo — hereda presentación y
--    velocidad de la corrida vieja tal cual, no se vuelven a pedir.
-- ------------------------------------------------------------
create or replace function continuar_siguiente_lote(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual turno_lineas%rowtype;
  v_ancho integer;
  v_lote_siguiente text;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
    raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente.', v_actual.lote;
  end if;

  v_ancho := length(v_actual.lote);
  v_lote_siguiente := lpad((v_actual.lote::bigint + 1)::text, greatest(v_ancho, 4), '0');

  select * into v_tanque
  from recepcion_tanques
  where turno_id = p_turno_id and condicion = 'LISTO' and lote = v_lote_siguiente
  order by numero_tanque
  limit 1;

  if v_tanque.numero_tanque is null then
    raise exception 'Todavía no hay ningún tanque Listo con el Lote %.', v_lote_siguiente;
  end if;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where id = v_actual.id;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_siguiente_lote(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. turno_json(): agrega lote_terminado_en a cada línea.
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
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
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
        'pausada_en', tl.pausada_en,
        'lote_terminado_en', tl.lote_terminado_en,
        'entregada_en', tl.entregada_en,
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
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en
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
  join usuarios u on u.id = t.supervisor_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric) to anon, authenticated;
grant execute on function finalizar_lote(text, uuid) to anon, authenticated;
grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;
