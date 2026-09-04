-- ============================================================
-- "TURNO PASADO": ORDENAR POR EL INSTANTE REAL DE CIERRE
-- ============================================================
-- turno_anterior_json() elegía el turno pasado ordenando por
--   t.fecha desc, coalesce(t.hora_fin, t.hora_inicio) desc, t.created_at desc
--
-- Problema: `t.fecha` es la fecha de JORNADA (igual para los 3 turnos
-- del día, no desempata) y `hora_fin` es sólo hora del día, sin fecha.
-- El Turno 3 cierra 07:00 (cruza medianoche), así que su `hora_fin` es
-- la MÁS CHICA de la jornada y queda ÚLTIMO en el orden — nunca se lo
-- elige como turno pasado. El `created_at` no lo salva: sólo se
-- consulta si las horas empatan, y no empatan.
--
-- Consecuencia: siempre que el turno pasado real es un Turno 3 (o sea,
-- durante todo el Turno 1 y en el hueco previo), la función devolvía el
-- Turno 2 de esa jornada. El Panel mostraba merma de envase /
-- rendimiento / litros / cajas de un turno equivocado.
--
-- Arreglo: ordenar por el instante real de cierre. finalizar_turno y
-- cerrar_turnos_vencidos() ya guardan `fecha_fin` con el día calendario
-- del cierre (para el Turno 3, el día siguiente), así que
-- (fecha_fin + hora_fin) es el timestamp real de cuándo terminó.
-- Los coalesce son de más (todo turno CERRADO tiene ambos), quedan por
-- las dudas; created_at sigue de desempate final.
-- ============================================================

create or replace function turno_anterior_json(p_area_codigo text, p_turno_actual_id uuid default null)
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
  where a.codigo = p_area_codigo
    and t.estado = 'CERRADO'
    and (p_turno_actual_id is null or t.id <> p_turno_actual_id)
  order by (coalesce(t.fecha_fin, t.fecha)::timestamp + coalesce(t.hora_fin, t.hora_inicio)) desc,
           t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_anterior_json(text, uuid) to anon, authenticated;
