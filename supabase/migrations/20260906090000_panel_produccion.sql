-- ============================================================
-- PANEL DE PRODUCCIÓN: turno en vivo (o histórico por fecha/tipo)
-- ============================================================
-- Dos formas de encontrar un turno para el panel, sin restricción de
-- rol (ver la sección "Roles y acceso" de resumen-diseno-dashboard-
-- natulac.md: los filtros quedan abiertos para todos, cambia el
-- default por rol, no el acceso al dato):
--
--   1. turno_abierto_ahora(): el turno ABIERTO más reciente de
--      cualquier supervisor — para la vista "en vivo" por defecto.
--   2. turno_de_fecha_tipo(fecha, turno_tipo): el turno (abierto o
--      cerrado) más reciente que coincide con esa fecha y tipo de
--      turno — para navegar hacia atrás en el tiempo con el selector
--      de fecha/turno del panel.
--
-- Ambas devuelven el mismo JSON que turno_json() (turno + líneas +
-- tanques + preparaciones + contadores + producto_terminado).
-- ============================================================

create or replace function turno_abierto_ahora()
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
  where estado = 'ABIERTO'
  order by created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

create or replace function turno_de_fecha_tipo(p_fecha date, p_turno_tipo text)
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
  join turno_tipos tt on tt.id = t.turno_tipo_id
  where t.fecha = p_fecha and tt.codigo = p_turno_tipo
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_abierto_ahora() to anon, authenticated;
grant execute on function turno_de_fecha_tipo(date, text) to anon, authenticated;
