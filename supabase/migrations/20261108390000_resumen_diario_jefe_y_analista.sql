-- ============================================================
-- RESUMEN DIARIO: el jefe mira, la analista corrige y copia
-- ============================================================
-- Dueña, 2026-10-08 (boceto aprobado): el Resumen del Día pasa a ser el
-- Resumen Diario. Lo ven el Jefe y la Analista de Producción; solo la
-- analista corrige las cajas del mensaje de WhatsApp (el número oficial
-- del día, validacion_dia, igual que antes). El jefe no valida nada.
--
--   * Permiso nuevo RESUMEN_VER (Jefe de Producción y Analista).
--   * El Jefe de Producción pierde VALIDAR. La analista lo conserva.
--   * puede_ver_resumen_dia(): RESUMEN_VER o lo que ya podía validar.
--     resumen_produccion_dia() y validacion_dia_de() la usan para leer;
--     validar_dia() sigue pidiendo VALIDAR.
--   * nombre_sabor_resumen(): el nombre del sabor en el resumen, en un
--     solo lugar (regla de 20261108290000: la Pera Jucosa va aparte).
--   * resumen_produccion_dia_por_turno(): las mismas cajas, por turno
--     (columnas T1 / T2 / T3 y cajas por grupo).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permisos
-- ------------------------------------------------------------
insert into permisos (codigo, nombre) values ('RESUMEN_VER', 'Ver el Resumen Diario')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'RESUMEN_VER' from roles r where r.codigo in ('JEFE_PRODUCCION', 'ANALISTA')
on conflict do nothing;

delete from rol_permisos
where permiso_codigo = 'VALIDAR'
  and rol_id = (select id from roles where codigo = 'JEFE_PRODUCCION');

create or replace function puede_ver_resumen_dia(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'RESUMEN_VER') or puede_validar_dia(p_usuario);
$$;
revoke execute on function puede_ver_resumen_dia(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Nombre del sabor en el resumen
-- ------------------------------------------------------------
-- Clásicos: su nombre. Otra familia con un nombre repetido: nombre + familia
-- ("Pera Jucosa"). El resto: su nombre ("Pera 35%").
create or replace function nombre_sabor_resumen(p_sabor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when fp.nombre in ('Clasicos', 'Clásicos') then s.nombre
    when exists (select 1 from sabores s2 where s2.nombre = s.nombre and s2.familia_id <> s.familia_id) then s.nombre || ' ' || fp.nombre
    else s.nombre
  end
  from sabores s
  left join familias_producto fp on fp.id = s.familia_id
  where s.id = p_sabor_id;
$$;
revoke execute on function nombre_sabor_resumen(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Resumen por sabor + presentación + línea
-- ------------------------------------------------------------
-- Última versión: 20261108290000_resumen_dia_jucosa_aparte.sql
create or replace function resumen_produccion_dia(p_usuario text, p_area_codigo text, p_fecha date)
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
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select
    nombre_sabor_resumen(pt.sabor_id),
    pr.volumen_ml,
    l.codigo,
    l.nombre,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by nombre_sabor_resumen(pt.sabor_id), pr.volumen_ml, l.codigo, l.nombre
  order by l.codigo, pr.volumen_ml, 1;
end;
$$;
grant execute on function resumen_produccion_dia(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Lo mismo, por turno
-- ------------------------------------------------------------
create or replace function resumen_produccion_dia_por_turno(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  turno_id uuid,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  linea_codigo text,
  cajas bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select
    t.id,
    nombre_sabor_resumen(pt.sabor_id),
    pr.volumen_ml,
    l.codigo,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by t.id, nombre_sabor_resumen(pt.sabor_id), pr.volumen_ml, l.codigo;
end;
$$;
grant execute on function resumen_produccion_dia_por_turno(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Validaciones: las ve quien ve el resumen
-- ------------------------------------------------------------
-- Última versión: 20261099190000_validacion_dia.sql
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
  if not puede_ver_resumen_dia(p_usuario) then
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
