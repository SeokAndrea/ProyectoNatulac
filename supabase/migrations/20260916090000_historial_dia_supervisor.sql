-- ============================================================
-- HISTORIAL DEL DÍA POR SUPERVISOR
-- ============================================================
-- Qué hizo cada supervisor en el día, para que el que entra pueda
-- revisar rápido sin reconstruir la historia a mano. Se arma
-- juntando (union all) las acciones que YA quedan timestampeadas en
-- las tablas existentes — no se crea una tabla de auditoría nueva:
-- inicio de turno, preparaciones, cambios de tanque hechos a mano
-- (cambiar_condicion_tanque — las filas heredadas de iniciar_turno
-- no tienen actualizada_por, así que no aparecen como "acción" de
-- nadie), activación de línea, y contadores.
-- ============================================================

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
