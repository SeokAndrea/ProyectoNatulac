-- ============================================================
-- PANEL DE PRODUCCIÓN: dejar de depender de "hay un turno ABIERTO"
-- ============================================================
-- turno_abierto_ahora() solo devolvía algo si estado = 'ABIERTO'. En
-- la práctica, entre que un supervisor finaliza su turno y el
-- siguiente empieza el suyo, no hay ninguno ABIERTO — y como líneas y
-- tanques ahora son estado CONTINUO (ver
-- 20260907090000_preparacion_continua.sql), el panel igual debería
-- poder mostrar el último estado conocido de la planta en ese hueco,
-- en vez de la pantalla vacía de "sin turno en curso" (que hacía
-- parecer que finalizar turno "borraba" los tanques — no borra nada,
-- finalizar_turno() solo cambia estado a CERRADO).
--
-- estado_planta_actual() reemplaza a turno_abierto_ahora() como
-- fuente de la vista "en vivo": busca el turno MÁS RECIENTE en
-- general (abierto o cerrado, mismo criterio de "más reciente" que ya
-- usa iniciar_turno() para heredar) y devuelve el mismo turno_json()
-- de siempre. El frontend distingue con turno.estado si mostrar "En
-- Operación" o "Turno cerrado" — los tanques y líneas se ven en
-- cualquiera de los dos casos.
-- ============================================================

create or replace function estado_planta_actual()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  select id into v_turno_id
  from turnos
  order by fecha desc, hora_inicio desc, created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function estado_planta_actual() to anon, authenticated;
