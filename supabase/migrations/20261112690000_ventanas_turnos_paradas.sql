-- ============================================================
-- REPORTES DE PARADAS: ventanas reales de los turnos
-- ============================================================
-- El reporte reparte una parada entre los turnos que cruzó («T1 60 + T2 150»)
-- con las horas reales de cada turno (nunca ventanas fijas de 8 h).
-- Devuelve los turnos de un área que tocan el rango de fechas, con su
-- inicio y su fin (fin vacío = el turno sigue abierto). Sin permiso propio:
-- son las mismas horas que muestra el reporte de paradas a quien lo ve.
-- ============================================================
create or replace function ventanas_turnos_paradas(p_area text, p_desde date, p_hasta date)
returns table (
  turno_id uuid,
  turno_tipo_codigo text,
  desde text,
  hasta text
)
language sql
security definer
set search_path = public
stable
as $$
  select tu.id,
         tt.codigo,
         to_char(tu.fecha + tu.hora_inicio, 'YYYY-MM-DD"T"HH24:MI:SS'),
         case when tu.fecha_fin is not null and tu.hora_fin is not null
              then to_char(tu.fecha_fin + tu.hora_fin, 'YYYY-MM-DD"T"HH24:MI:SS')
         end
  from turnos tu
  join areas a on a.id = tu.area_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  where a.codigo = p_area
    and tu.fecha between p_desde - 1 and p_hasta
  order by tu.fecha, tu.hora_inicio;
$$;
grant execute on function ventanas_turnos_paradas(text, date, date) to anon, authenticated;
