-- ============================================================
-- Sheet de Mantenimiento: el nombre de la parada sin validar el tipo
-- ============================================================
-- Al actualizar desde el Sheet salía «El tipo de parada no existe o está
-- desactivado»: nombre_parada_sheet() (20261108490000) usaba
-- nombre_tipo_en_linea(), que es la validación de quien REGISTRA una
-- parada (tipo activo, que aplique a la línea y a la presentación que
-- corre ahora). Un solo reporte con un tipo desactivado, o de una
-- presentación que no corre hoy, hacía fallar toda la actualización.
--
-- Los reportes del Sheet son historia: el nombre se arma igual que en la
-- app («Equipo · Tipo») pero sin esas validaciones.
-- ============================================================

-- Última versión: 20261108490000_paradas_desde_sheet_mantenimiento.sql
create or replace function nombre_parada_sheet(p_tipo_id uuid, p_linea_id uuid, p_equipo text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when e.id is not null then e.nombre || ' · ' || t.nombre else t.nombre end
     from paradas_tipos t
     left join paradas_equipos e on e.id = t.equipo_id
     where t.id = p_tipo_id),
    'Mantenimiento · ' || coalesce(nullif(trim(p_equipo), ''), 'Sin equipo')
  );
$$;
revoke execute on function nombre_parada_sheet(uuid, uuid, text) from public, anon, authenticated;
