-- ============================================================
-- VALIDAR EL DÍA: sabor + presentación
-- ============================================================
-- (dueño, 2026-10-01) Lo que se valida es el número del DÍA, no la
-- corrida de cada supervisor: por cada sabor + presentación de la jornada
-- (7:00 a 7:00, turnos.fecha) se confirma lo del supervisor o se corrige
-- el total de cajas. Ese es el número oficial (el del mensaje).
--
--   * validacion_dia: una fila por área + fecha + sabor (nombre) +
--     presentación. cajas null = CONFIRMADO (vale lo del supervisor).
--   * resumen_produccion_dia(): vuelve a sumar por sabor + presentación +
--     línea (reemplaza la versión por corrida de 20261099090000).
--   * validacion_dia_de(): las validaciones de una jornada.
--   * validar_dia(): confirma (p_cajas null) o corrige (p_cajas) una fila.
-- Entra quien tenga VALIDAR (Analista, Jefe de Producción), el Super
-- Administrador o el dueño. La validación por corrida (validacion_produccion)
-- queda guardada pero ya no se usa.
-- ============================================================

create or replace function puede_validar_dia(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'VALIDAR')
    or coalesce(es_superadmin(p_usuario), false)
    or coalesce(es_dueno(p_usuario), false);
$$;
revoke execute on function puede_validar_dia(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Resumen: sabor + presentación + línea (lo del supervisor)
-- ------------------------------------------------------------
drop function if exists resumen_produccion_dia(text, text, date);

create function resumen_produccion_dia(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  sabor_nombre text,
  presentacion_volumen_ml integer,
  linea_codigo text,
  linea_nombre text,
  cajas bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_validar_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select
    s.nombre,
    pr.volumen_ml,
    l.codigo,
    l.nombre,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  left join sabores s on s.id = pt.sabor_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by s.nombre, pr.volumen_ml, l.codigo, l.nombre
  order by l.codigo, pr.volumen_ml, 1;
end;
$$;
grant execute on function resumen_produccion_dia(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Tabla
-- ------------------------------------------------------------
create table validacion_dia (
  area_id uuid not null references areas (id) on delete cascade,
  fecha date not null,
  sabor_nombre text not null,
  volumen_ml integer not null,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO')),
  -- Total oficial de cajas si se corrigió; null = vale lo del supervisor.
  cajas integer check (cajas is null or cajas >= 0),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now(),
  primary key (area_id, fecha, sabor_nombre, volumen_ml)
);
alter table validacion_dia enable row level security;

-- ------------------------------------------------------------
-- Lectura
-- ------------------------------------------------------------
create or replace function validacion_dia_de(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  sabor_nombre text,
  presentacion_volumen_ml integer,
  estado text,
  cajas integer,
  nota text,
  validado_por_nombre text,
  validado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_validar_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select vd.sabor_nombre, vd.volumen_ml, vd.estado, vd.cajas, vd.nota, u.nombre, vd.validado_en
  from validacion_dia vd
  join areas a on a.id = vd.area_id
  left join usuarios u on u.id = vd.validado_por
  where a.codigo = p_area_codigo and vd.fecha = p_fecha;
end;
$$;
grant execute on function validacion_dia_de(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Confirmar (p_cajas null) o corregir (p_cajas) una fila del día
-- ------------------------------------------------------------
create or replace function validar_dia(
  p_usuario text,
  p_area_codigo text,
  p_fecha date,
  p_sabor_nombre text,
  p_volumen_ml integer,
  p_cajas integer default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_usuario_id uuid;
  v_antes validacion_dia;
  v_estado text := case when p_cajas is null then 'CONFIRMADO' else 'EDITADO' end;
begin
  if not puede_validar_dia(p_usuario) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  if p_cajas is not null and p_cajas < 0 then
    raise exception 'Las cajas no pueden ser negativas.';
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_antes from validacion_dia
  where area_id = v_area_id and fecha = p_fecha and sabor_nombre = p_sabor_nombre and volumen_ml = p_volumen_ml;

  insert into validacion_dia (area_id, fecha, sabor_nombre, volumen_ml, estado, cajas, nota, validado_por, validado_en)
  values (v_area_id, p_fecha, p_sabor_nombre, p_volumen_ml, v_estado, p_cajas, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (area_id, fecha, sabor_nombre, volumen_ml) do update
    set estado = excluded.estado,
        cajas = excluded.cajas,
        nota = excluded.nota,
        validado_por = excluded.validado_por,
        validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_dia', format('%s %s %s %s', p_area_codigo, p_fecha, p_sabor_nombre, p_volumen_ml), 'Resumen del Día',
    format('%s %s ml del %s: %s', p_sabor_nombre, p_volumen_ml, to_char(p_fecha, 'DD/MM/YYYY'),
           case when p_cajas is null then 'confirmó lo del supervisor' else format('corrigió a %s cajas', p_cajas) end),
    case when v_antes.area_id is null then null else jsonb_strip_nulls(jsonb_build_object('estado', v_antes.estado, 'cajas', v_antes.cajas, 'nota', v_antes.nota)) end,
    jsonb_strip_nulls(jsonb_build_object('estado', v_estado, 'cajas', p_cajas, 'nota', nullif(trim(coalesce(p_nota, '')), '')))
  );
end;
$$;
grant execute on function validar_dia(text, text, date, text, integer, integer, text) to anon, authenticated;
