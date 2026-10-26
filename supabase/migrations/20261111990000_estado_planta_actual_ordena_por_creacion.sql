-- ============================================================
-- Panel en vivo: el turno más reciente es el último CREADO
-- ============================================================
-- estado_planta_actual() ordenaba por (fecha, hora_inicio). Un T3 iniciado
-- después de medianoche lleva la fecha operativa del día anterior y una
-- hora_inicio chica (00:30), así que quedaba detrás del T2 de las 15:00 de
-- esa misma fecha y el Panel seguía mostrando el T2. Mismo problema que
-- abrir_turno() resolvió en 20261108090000: se ordena por created_at.
-- ============================================================

-- Última versión: 20260922090000_aislar_area_pruebas.sql
create or replace function estado_planta_actual(p_area_codigo text default null)
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
  where (p_area_codigo is not null and a.codigo = p_area_codigo)
     or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
  order by (t.estado = 'ABIERTO') desc, t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function estado_planta_actual(text) to anon, authenticated;
