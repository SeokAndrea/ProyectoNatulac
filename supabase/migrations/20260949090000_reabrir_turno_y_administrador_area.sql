-- ============================================================
-- REABRIR TURNO + ACCESO DE ADMINISTRADOR_AREA A AUDITORÍA + TURNOS ACTIVOS
-- ============================================================
-- Tres cosas relacionadas, todas para separar "Registro" de "Actas" en
-- Auditoría y abrirle el acceso también a ADMINISTRADOR_AREA (hoy solo
-- SUPERADMINISTRADOR puede entrar, ver src/lib/apps.tsx):
--
-- 1. reabrir_turno(): necesaria para poder corregir un acta — vuelve
--    un turno CERRADO a ABIERTO para que el supervisor cargue lo que
--    falte y vuelva a Finalizar (eso genera la V1 del acta, ver
--    registrar_acta() en 20260948090000_actas_pdf.sql). Rechaza si ya
--    hay un turno MÁS NUEVO en la misma área — reabrir uno viejo
--    mientras ya hay otro corriendo dejaría dos turnos "ABIERTO" a la
--    vez en la misma área, y estado_planta_actual()/turno_activo_de()
--    asumen uno solo.
--
-- 2. listar_turnos_historial() y turno_detalle() ganan
--    ADMINISTRADOR_AREA — pero forzando su propia área (ignora lo que
--    mande el cliente), nunca puede ver otra área ni PRUEBAS. Mismo
--    criterio que ya usa listar_actas().
--
-- 3. turnos_activos_por_area(): "¿quién es el supervisor activo ahora
--    mismo, por área?" para el vistazo rápido arriba de Auditoría —
--    todas las áreas menos PRUEBAS para SUPERADMINISTRADOR, solo la
--    propia para ADMINISTRADOR_AREA.
-- ============================================================

-- ------------------------------------------------------------
-- 1. reabrir_turno()
-- ------------------------------------------------------------
create or replace function reabrir_turno(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_turno turnos%rowtype;
  v_turno_area_codigo text;
  v_existe_mas_nuevo boolean;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para reabrir turnos.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if v_turno.id is null then
    raise exception 'Ese turno no existe.';
  end if;
  if v_turno.estado <> 'CERRADO' then
    raise exception 'Solo se puede reabrir un turno CERRADO.';
  end if;

  select a.codigo into v_turno_area_codigo from areas a where a.id = v_turno.area_id;
  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tienes permiso para reabrir turnos de otra área.';
  end if;

  select exists(
    select 1 from turnos t2
    where t2.area_id = v_turno.area_id
      and t2.id <> p_turno_id
      and (t2.fecha, t2.hora_inicio) > (v_turno.fecha, v_turno.hora_inicio)
  ) into v_existe_mas_nuevo;

  if v_existe_mas_nuevo then
    raise exception 'Ya existe un turno más nuevo en esta área — no se puede reabrir este.';
  end if;

  update turnos set estado = 'ABIERTO' where id = p_turno_id;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function reabrir_turno(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 2a. listar_turnos_historial(): gana ADMINISTRADOR_AREA.
-- ------------------------------------------------------------
create or replace function listar_turnos_historial(
  p_usuario text,
  p_supervisor_usuario text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_area_codigo text default null
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
  v_area_efectiva text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  v_area_efectiva := case when v_rol = 'SUPERADMINISTRADOR' then p_area_codigo else v_area end;

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
    and (
      (v_area_efectiva is not null and a.codigo = v_area_efectiva)
      or (v_area_efectiva is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc;
end;
$$;

grant execute on function listar_turnos_historial(text, text, date, date, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2b. turno_detalle(): gana ADMINISTRADOR_AREA, con chequeo de área
--     del turno puntual (antes no filtraba por área en absoluto).
-- ------------------------------------------------------------
create or replace function turno_detalle(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_turno_area_codigo text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select a.codigo into v_turno_area_codigo
  from turnos t join areas a on a.id = t.area_id
  where t.id = p_turno_id;

  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function turno_detalle(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. turnos_activos_por_area(): supervisor activo ahora mismo, por
--    área (siempre excluye PRUEBAS; ADMINISTRADOR_AREA solo ve la suya).
-- ------------------------------------------------------------
create or replace function turnos_activos_por_area(p_usuario text)
returns table (
  area_codigo text,
  area_nombre text,
  turno_id uuid,
  turno_codigo text,
  supervisor_nombre text,
  hora_inicio time
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
  if v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select a.codigo, a.nombre, t.id, t.codigo, u.nombre, t.hora_inicio
  from areas a
  left join lateral (
    select * from turnos t2
    where t2.area_id = a.id and t2.estado = 'ABIERTO'
    order by t2.fecha desc, t2.hora_inicio desc
    limit 1
  ) t on true
  left join usuarios u on u.id = t.supervisor_id
  where a.codigo <> 'PRUEBAS'
    and (v_rol = 'SUPERADMINISTRADOR' or a.codigo = v_area)
  order by a.nombre;
end;
$$;

grant execute on function turnos_activos_por_area(text) to anon, authenticated;
