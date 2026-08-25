-- ============================================================
-- AISLAR ÁREA DE PRUEBAS
-- ============================================================
-- El usuario reportó que el Super Administrador (Jorge, session.area
-- = null) seguía viendo turnos del Área de Pruebas. Causas reales:
--
-- 1. estado_planta_actual(null) y turno_de_fecha_tipo(..., null)
--    tomaban el turno más reciente de TODAS las áreas sin excluir
--    Pruebas — si Pruebas tenía el turno más nuevo, se colaba en la
--    vista "en vivo" del Super Admin aunque no hubiera elegido
--    explícitamente "Todas las áreas".
--
-- 2. estadisticas_produccion() (Resumen de Planta / Histórico) NO
--    tenía ningún filtro de área — devolvía TODO mezclado (todas las
--    áreas + Pruebas) a CUALQUIER usuario logueado, sin importar su
--    rol o área. Esto es más grave que el punto 1: cualquier
--    supervisor de cualquier área veía ahí datos de Pruebas y de las
--    demás áreas.
--
-- Regla nueva, consistente en las tres funciones: si se pide un área
-- puntual (incluida 'PRUEBAS' a propósito), se filtra a esa sola; si
-- no se pide ninguna (null = "todas", solo lo usa el Super Admin), se
-- excluye 'PRUEBAS' — queda totalmente aislada del resto salvo que
-- alguien la pida a propósito.
-- ============================================================

drop function if exists estado_planta_actual(text);

create or replace function estado_planta_actual(p_area_codigo text default null)
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
  join areas a on a.id = t.area_id
  where (p_area_codigo is not null and a.codigo = p_area_codigo)
     or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
  order by t.fecha desc, t.hora_inicio desc, t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function estado_planta_actual(text) to anon, authenticated;

drop function if exists turno_de_fecha_tipo(date, text, text);

create or replace function turno_de_fecha_tipo(p_fecha date, p_turno_tipo text, p_area_codigo text default null)
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
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join areas a on a.id = t.area_id
  where t.fecha = p_fecha and tt.codigo = p_turno_tipo
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_de_fecha_tipo(date, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- estadisticas_produccion(): gana p_area_codigo — no tenía NINGÚN
-- filtro de área, se la pasa igual para todos los usuarios.
-- ------------------------------------------------------------
drop function if exists estadisticas_produccion(date, date);

create or replace function estadisticas_produccion(p_fecha_desde date default null, p_fecha_hasta date default null, p_area_codigo text default null)
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
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc, l.codigo, tl.activada_en;
end;
$$;

grant execute on function estadisticas_produccion(date, date, text) to anon, authenticated;
