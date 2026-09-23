-- ============================================================
-- FIX: listar_personal() tiraba "column reference rol_codigo is
-- ambiguous"
-- ============================================================
-- 20261076090000_rework_dos_roles.sql redefinió listar_personal() con
-- `select rol_codigo into v_rol from rol_y_area_de(p_usuario)` — pero
-- rol_codigo es también una columna del RETURNS TABLE de esta misma
-- función, así que Postgres la trata como variable plpgsql en el
-- cuerpo y no sabe si querés esa o la que devuelve rol_y_area_de().
-- Se vuelve al patrón `select * into v_rol, v_area from
-- rol_y_area_de(...)` que ya usa el resto de la base, que no tiene
-- este problema.
-- ============================================================

create or replace function listar_personal(p_usuario text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  area_origen_codigo text,
  cargo text,
  activo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);

  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, ao.codigo, u.cargo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  left join areas ao on ao.id = u.area_origen_id
  order by u.created_at desc;
end;
$$;
