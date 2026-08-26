-- ============================================================
-- AISLAR ÁREA DE PRUEBAS EN AUDITORÍA
-- ============================================================
-- 20260922090000_aislar_area_pruebas.sql aisló el Área de Pruebas en
-- estado_planta_actual(), turno_de_fecha_tipo() y
-- estadisticas_produccion() — pero se quedó afuera
-- listar_turnos_historial() (Auditoría, src/pages/apps/Historial.tsx),
-- que es SUPERADMINISTRADOR-only y no tenía NINGÚN filtro de área: por
-- eso a Jorge Guerrero (jguerrero) le aparecían turnos del Área de
-- Pruebas ahí, sin haberlos pedido.
--
-- Mismo criterio que las demás: si se pide un área puntual (incluida
-- 'PRUEBAS' a propósito) se filtra a esa sola; si no se pide ninguna
-- (el caso de hoy — Auditoría no tiene selector de área en la
-- interfaz), se excluye 'PRUEBAS' siempre. Con esto no le sale a
-- NADIE que entre a Auditoría, no solo a jguerrero.
-- ============================================================

drop function if exists listar_turnos_historial(text, text, date, date);

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
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc;
end;
$$;

grant execute on function listar_turnos_historial(text, text, date, date, text) to anon, authenticated;
