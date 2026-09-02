-- ============================================================
-- LÍNEAS: recordar la última configuración usada (prellenado)
-- ============================================================
-- plan-rework-tanques-lineas-recepcion.md §12. El problema real de
-- "Continuar Siguiente Lote" era que exige que el tanque siguiente ya
-- esté Liberado en ese momento exacto — no se puede aflojar (es una
-- regla física real, confirmada con el dueño). En vez de eso, se
-- resuelve el fastidio de retipear velocidad/presentación: al activar
-- una línea, el formulario se prellena con lo último que esa MISMA
-- línea usó, sin importar el timing ni si fue "continuación" o una
-- corrida nueva de cero.
-- ============================================================

create or replace function ultima_configuracion_linea(p_area_codigo text, p_linea_codigo text)
returns table (
  presentacion_volumen_ml integer,
  envases_hora integer,
  litros_hora numeric
)
language sql
security definer
set search_path = public
as $$
  select p.volumen_ml, tl.envases_hora, tl.litros_hora
  from turno_lineas tl
  join lineas l on l.id = tl.linea_id
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  left join presentaciones p on p.id = tl.presentacion_id
  where a.codigo = p_area_codigo and l.codigo = p_linea_codigo
  order by tl.activada_en desc
  limit 1;
$$;

grant execute on function ultima_configuracion_linea(text, text) to anon, authenticated;
