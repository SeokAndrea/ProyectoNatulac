-- Personal por Áreas y Puestos: los nombres de las áreas los lee toda la app (banner, filtros,
-- actas, auditoría). Como las líneas y las presentaciones, es un dato abierto: solo código,
-- nombre y tipo. Los conteos de personas siguen en listar_estructura (con permiso).

create or replace function listar_areas()
returns table (codigo text, nombre text, tipo text, activo boolean, orden int)
language sql
stable
security definer
set search_path = public
as $$
  select a.codigo, a.nombre, a.tipo, a.activo, a.orden
    from areas a
   order by a.orden, a.nombre;
$$;

grant execute on function listar_areas() to anon, authenticated;
