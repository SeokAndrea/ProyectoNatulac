-- ============================================================
-- ENTREGAR CORRIDA: cerrar prolijo la parte de UN turno de una
-- corrida que sigue activa y va a continuar en el siguiente turno.
-- ============================================================
-- Una corrida activa se hereda al turno siguiente como una fila
-- NUEVA (mismo lote_id, pero turno_linea_id distinto) — así que si
-- Juan arranca la Línea 1 a las 9pm y María la sigue en su turno,
-- cada uno carga contador/producto terminado contra SU propia fila,
-- sin pisarse. Eso ya funciona bien para el descuento de litros (se
-- descuenta lectura por lectura, no por el acumulado, así que no
-- importa en qué fila quede cada lectura). Lo que faltaba: una forma
-- de que Juan deje su parte "cerrada prolija" con sus números, sin
-- cortar la corrida real — entregada_en marca justo eso, sin tocar
-- activa (la corrida sigue activa=true, se sigue heredando normal).
-- ============================================================

alter table turno_lineas add column entregada_en timestamptz;
alter table turno_lineas add column entregada_por uuid references usuarios (id);

create or replace function entregar_corrida(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set entregada_en = now(), entregada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- turno_json(): agrega entregada_en a cada línea.
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
        'pausada_en', tl.pausada_en,
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

grant execute on function entregar_corrida(text, uuid, uuid) to anon, authenticated;
grant execute on function turno_json(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- historial_dia_area(): agrega las entregas de corrida como acción
-- propia, para que se vea en el Historial del Día quién entregó qué
-- línea a quién.
-- ------------------------------------------------------------
create or replace function historial_dia_area(p_area_codigo text, p_fecha date)
returns table (
  supervisor_usuario text,
  supervisor_nombre text,
  hora time,
  seccion text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.usuario, u.nombre, t.hora_inicio, 'Comenzar Turno'::text, ('Turno ' || t.codigo)::text
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha

  union all

  select u.usuario, u.nombre, prep.created_at::time, 'Preparación'::text,
         ('Tanque ' || prep.numero_tanque || coalesce(' · ' || s.nombre, '') || coalesce(' · Lote ' || prep.lote, ''))::text
  from preparaciones prep
  join turnos t on t.id = prep.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = prep.usuario_id
  left join sabores s on s.id = prep.sabor_id
  where a.codigo = p_area_codigo and prep.created_at::date = p_fecha

  union all

  select u.usuario, u.nombre, rt.activada_en::time, 'Status (Tanques)'::text,
         ('Tanque ' || rt.numero_tanque || ' → ' || rt.condicion)::text
  from recepcion_tanques rt
  join turnos t on t.id = rt.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = rt.actualizada_por
  where a.codigo = p_area_codigo and rt.actualizada_por is not null and rt.activada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, tl.activada_en::time, 'Líneas'::text,
         (l.codigo || ': corrida activada' || coalesce(' · Lote ' || tl.lote, ''))::text
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = tl.activada_por
  join lineas l on l.id = tl.linea_id
  where a.codigo = p_area_codigo and tl.activada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, tl.entregada_en::time, 'Líneas'::text,
         (l4.codigo || ': entregada al siguiente turno, sigue activa')::text
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = tl.entregada_por
  join lineas l4 on l4.id = tl.linea_id
  where a.codigo = p_area_codigo and tl.entregada_en is not null and tl.entregada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, c.created_at::time, 'Contadores'::text,
         (l2.codigo || ': ' || c.envases_llenadora || ' envases')::text
  from contadores c
  join turnos t on t.id = c.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = c.usuario_id
  join lineas l2 on l2.id = c.linea_id
  where a.codigo = p_area_codigo and c.created_at::date = p_fecha

  order by 1, 3;
end;
$$;

grant execute on function historial_dia_area(text, date) to anon, authenticated;
