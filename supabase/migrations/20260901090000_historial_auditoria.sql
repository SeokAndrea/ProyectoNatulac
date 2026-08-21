-- ============================================================
-- AUDITORÍA: historial de turnos por supervisor y fecha
-- ============================================================
-- Solo SUPERADMINISTRADOR. Permite buscar cualquier turno (abierto o
-- cerrado, de cualquier área/supervisor) y ver su detalle completo
-- (líneas, Recepción, Contadores, Producto Terminado) — la misma
-- información que ya arma turno_activo_de(), pero para un turno
-- puntual en vez de "el turno abierto de este usuario".
--
-- Se extrae la construcción del JSON a turno_json() para no repetir
-- la consulta grande dos veces (turno_activo_de la usa también).
-- ============================================================

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
        'litros_hora', tl.litros_hora
      ))
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre,
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
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
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

create or replace function turno_activo_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  select t.id into v_turno_id
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where u.usuario = lower(p_usuario) and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

create or replace function listar_turnos_historial(
  p_usuario text,
  p_supervisor_usuario text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  turno_id uuid,
  codigo text,
  fecha date,
  hora_inicio time,
  estado text,
  supervisor_usuario text,
  supervisor_nombre text,
  area_codigo text,
  turno_tipo_codigo text,
  grupo_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select t.id, t.codigo, t.fecha, t.hora_inicio, t.estado, u.usuario, u.nombre, a.codigo, tt.codigo, g.codigo
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where (p_supervisor_usuario is null or p_supervisor_usuario = '' or u.usuario = lower(p_supervisor_usuario))
    and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
  order by t.fecha desc, t.hora_inicio desc;
end;
$$;

create or replace function turno_detalle(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function listar_turnos_historial(text, text, date, date) to anon, authenticated;
grant execute on function turno_detalle(text, uuid) to anon, authenticated;
