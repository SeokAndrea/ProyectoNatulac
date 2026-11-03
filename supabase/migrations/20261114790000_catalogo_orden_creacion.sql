-- ============================================================
-- Catálogo de fallas: equipos, sistemas y subsistemas en orden de CREACIÓN
-- ============================================================
-- Hasta ahora listar_catalogo_fallas() los daba por nombre y la tabla los
-- reordenaba por sufijo. Se agrega «creado_en» a cada nivel (ya existe en las
-- tablas) y se ordena por él; lo que se creó en el mismo instante (los de la
-- carga inicial) queda por sufijo. Las fallas ya salían por número (= orden de
-- creación dentro de su subsistema). Solo cambia la lectura: no toca datos.
-- ============================================================

create or replace function listar_catalogo_fallas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'sufijo', e.sufijo, 'nombre', e.nombre, 'tipo', e.tipo, 'activo', e.activo, 'creado_en', e.creado_en,
        'lineas', coalesce((select jsonb_agg(el.linea_id) from catalogo_equipos_lineas el where el.equipo_id = e.id), '[]'::jsonb)
      ) order by e.creado_en, e.sufijo)
      from catalogo_equipos e), '[]'::jsonb),
    'sistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'equipo_id', s.equipo_id, 'sufijo', s.sufijo, 'nombre', s.nombre, 'activo', s.activo, 'creado_en', s.creado_en)
                       order by s.creado_en, s.sufijo)
      from catalogo_sistemas s), '[]'::jsonb),
    'subsistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'sistema_id', u.sistema_id, 'sufijo', u.sufijo, 'nombre', u.nombre,
                                          'codigo_sheet', u.codigo_sheet, 'activo', u.activo, 'creado_en', u.creado_en)
                       order by u.creado_en, u.sufijo)
      from catalogo_subsistemas u), '[]'::jsonb),
    'fallas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'subsistema_id', f.subsistema_id, 'numero', f.numero, 'nombre', f.nombre, 'clase', f.clase, 'activo', f.activo,
        'codigo', e.sufijo || '-' || s.sufijo || '-' || u.sufijo || '-' || lpad(f.numero::text, 2, '0')
      ) order by f.subsistema_id, f.numero)
      from catalogo_fallas f
      join catalogo_subsistemas u on u.id = f.subsistema_id
      join catalogo_sistemas s on s.id = u.sistema_id
      join catalogo_equipos e on e.id = s.equipo_id), '[]'::jsonb)
  );
$$;
grant execute on function listar_catalogo_fallas() to anon, authenticated;
