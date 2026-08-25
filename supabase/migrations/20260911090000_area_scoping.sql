-- ============================================================
-- AISLAMIENTO POR ÁREA: prerrequisito del Área de Pruebas
-- ============================================================
-- listar_lineas() y estado_planta_actual() no filtraban por área en
-- absoluto — invisible hasta ahora porque solo existía el área
-- ASEPTICO con líneas. En el momento en que exista un área PRUEBAS
-- con sus propias líneas, cualquier supervisor de cualquier área
-- vería (y podría activar) las líneas de PRUEBAS, y el panel en vivo
-- (sin restricción de rol) le mostraría a cualquiera el turno más
-- reciente sea de la área que sea. Se arregla ACÁ, antes de sembrar
-- el área de pruebas, para poder probarlo primero contra los datos
-- reales de ASEPTICO sin la variable extra de datos de prueba.
--
-- De paso, estadisticas_produccion() excluye PRUEBAS por defecto
-- (parámetro p_incluir_pruebas) para que no ensucie los KPIs reales
-- del Panel de Producción.
--
-- También de paso: cambiar_condicion_tanque() todavía comparaba
-- contra el valor viejo 'VOLUMEN' (la condición se renombró a
-- 'LISTO' en 20260910090000_recepcion_y_liberacion.sql, pero esta
-- función no se había vuelto a definir) — hoy, usar el escape hatch
-- manual "Cambiar estado manualmente" para poner un tanque en LISTO
-- guarda sabor/volumen/lote como NULL en vez de los valores
-- cargados, sin avisar. Se corrige acá porque Status depende
-- directamente de que este escape hatch funcione.
-- ============================================================

-- ------------------------------------------------------------
-- 1. listar_lineas(): filtro opcional por área.
-- ------------------------------------------------------------
drop function if exists listar_lineas();

create or replace function listar_lineas(p_area_codigo text default null)
returns table (linea_id uuid, codigo text, nombre text, area_codigo text, activo boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select l.id, l.codigo, l.nombre, a.codigo, l.activo
  from lineas l
  join areas a on a.id = l.area_id
  where p_area_codigo is null or a.codigo = p_area_codigo
  order by l.codigo;
end;
$$;

-- ------------------------------------------------------------
-- 2. estado_planta_actual(): filtro opcional por área (null =
--    comportamiento actual, para SUPERADMINISTRADOR).
-- ------------------------------------------------------------
drop function if exists estado_planta_actual();

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
  where p_area_codigo is null or a.codigo = p_area_codigo
  order by t.fecha desc, t.hora_inicio desc, t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. estadisticas_produccion(): excluir PRUEBAS por defecto.
-- ------------------------------------------------------------
drop function if exists estadisticas_produccion(date, date);

create or replace function estadisticas_produccion(
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_incluir_pruebas boolean default false
)
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
    and (p_incluir_pruebas or a.codigo <> 'PRUEBAS')
  order by t.fecha desc, t.hora_inicio desc, l.codigo, tl.activada_en;
end;
$$;

-- ------------------------------------------------------------
-- 4. cambiar_condicion_tanque(): corrige la comparación contra
--    'VOLUMEN' (valor viejo) — ahora es 'LISTO'.
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
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function listar_lineas(text) to anon, authenticated;
grant execute on function estado_planta_actual(text) to anon, authenticated;
grant execute on function estadisticas_produccion(date, date, boolean) to anon, authenticated;
grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text) to anon, authenticated;
