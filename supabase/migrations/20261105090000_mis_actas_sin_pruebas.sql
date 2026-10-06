-- ============================================================
-- MIS ACTAS: sin las actas del área de Pruebas
-- ============================================================
-- mis_actas() (20261097) devolvía también las actas de turnos de Pruebas,
-- mezcladas con las reales. Ahora las deja fuera para todos. Desde esta
-- versión los turnos de Pruebas tampoco generan acta (FinalizarTurno.tsx).
-- Mismas columnas que antes: create or replace alcanza.
-- ============================================================

create or replace function mis_actas(p_usuario text, p_limite integer default 300)
returns table (
  acta_id uuid,
  turno_id uuid,
  codigo text,
  storage_path text,
  generado_en timestamptz,
  turno_codigo text,
  fecha date,
  turno_tipo_codigo text,
  grupo_codigo text,
  supervisor_nombre text,
  area_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todas boolean := coalesce(es_superadmin(p_usuario), false) or coalesce(es_dueno(p_usuario), false);
begin
  return query
  select ac.id, ac.turno_id, ac.codigo, ac.storage_path, ac.generado_en,
         t.codigo, t.fecha, tt.codigo, g.codigo, u.nombre, a.nombre
  from actas ac
  join turnos t on t.id = ac.turno_id
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where (v_todas or u.usuario = lower(p_usuario))
    and ac.estado = 'VIGENTE'
    and a.codigo <> 'PRUEBAS'
  order by ac.generado_en desc
  limit p_limite;
end;
$$;
grant execute on function mis_actas(text, integer) to anon, authenticated;
