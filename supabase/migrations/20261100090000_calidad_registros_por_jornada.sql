-- ============================================================
-- CALIDAD: los registros se filtran por DÍA DE TURNO, no por día calendario
-- ============================================================
-- listar_analisis_calidad() filtraba por la fecha calendario de
-- created_at. Un análisis de la 1:35 del 2/10 se hizo en el turno 3 que
-- empezó el 1/10 a las 22:30, pero salía en "Hoy" del 2/10 junto con los
-- del turno 1 — parecían horas equivocadas.
--
-- Ahora filtra por turnos.fecha del turno en que se hizo el análisis
-- (analisis_calidad.turno_id), igual que el Resumen del día y la
-- Validación. created_at sigue siendo la hora real y es lo que se muestra.
--
-- Regla del proyecto:
--   * turnos.fecha            → día de turno (jornada 7:00 → 7:00). Para
--                               agrupar / filtrar por "día".
--   * created_at (timestamptz) → instante real. Para mostrar la hora.
--   * turno_de_hora(ts)        → día de turno de un instante sin turno_id.
-- ============================================================

-- Última versión: 20261088090000_calidad_parametros_por_sabor.sql
create or replace function listar_analisis_calidad(
  p_usuario text,
  p_desde date,
  p_hasta date,
  p_area_codigo text default null
)
returns table (
  id uuid,
  creado_en timestamptz,
  turno_codigo text,
  numero_tanque smallint,
  sabor_nombre text,
  lote text,
  brix numeric,
  acidez numeric,
  conforme boolean,
  sensorial_conforme boolean,
  brix_min numeric,
  brix_max numeric,
  acidez_min numeric,
  acidez_max numeric,
  observacion text,
  analista_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (tiene_permiso(p_usuario, 'LOTE_LIBERAR') or tiene_permiso(p_usuario, 'AUDITORIA_VER') or p_area_codigo = 'PRUEBAS') then
    raise exception 'No tienes permiso para ver los registros de Calidad.';
  end if;

  return query
  select ac.id, ac.created_at, t.codigo, p.numero_tanque, s.nombre, p.lote,
         ac.brix, ac.acidez, ac.conforme, ac.sensorial_conforme,
         ac.brix_min, ac.brix_max, ac.acidez_min, ac.acidez_max, ac.observacion, u.nombre
  from analisis_calidad ac
  join preparaciones p on p.id = ac.preparacion_id
  join turnos t on t.id = ac.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = ac.usuario_id
  left join sabores s on s.id = p.sabor_id
  where t.fecha between p_desde and p_hasta
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by ac.created_at desc;
end;
$$;
