-- ============================================================
-- "TURNO PASADO" DEBE USAR LA MISMA FÓRMULA DE MERMA QUE "TURNO ACTUAL"
-- ============================================================
-- obtenerResumenTurnoAnterior() (src/lib/panelProduccion.ts) calculaba
-- la merma de semielaborado del turno pasado a mano, sumando
-- envasesLlenadora × volumenMl de estadisticas_produccion() — el
-- método VIEJO, de antes de que mermaSemielaboradoTurno() pasara a
-- calcularse por tanque (volumen_inicial_l - volumen_l, ver
-- 20260958090000 en adelante). Las dos vías dan números DISTINTOS para
-- el mismo turno — confirmado con datos reales: un turno real dio
-- 100.96% por tanque (correcto) y 103%+ por el método viejo, y en la
-- práctica alguno de los dos llega a pasarse de 100% de Rendimiento,
-- que no tiene sentido físico.
--
-- La solución de fondo: en vez de reimplementar el cálculo con otra
-- fuente de datos, "turno pasado" debe usar el turno_json() COMPLETO
-- de ese turno y correrlo por las MISMAS funciones (mermaEnvasesTurno/
-- mermaSemielaboradoTurno) que ya usa "turno actual" — así es
-- literalmente imposible que vuelvan a divergir. Esta función solo
-- resuelve CUÁL es el turno pasado (el CERRADO más reciente del área,
-- sin contar el turno actual) y devuelve su turno_json() completo.
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
  order by t.fecha desc, coalesce(t.hora_fin, t.hora_inicio) desc, t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_anterior_json(text, uuid) to anon, authenticated;
