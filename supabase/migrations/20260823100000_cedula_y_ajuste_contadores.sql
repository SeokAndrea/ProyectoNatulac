-- ============================================================
-- Cédula en personal + ajuste de la validación de contadores
-- ============================================================

-- ------------------------------------------------------------
-- La regla "buenos + desechados = llenadora" no se cumple siempre
-- en la práctica (ejemplo real: llenadora 7061, buenos 6874,
-- desechados 162 → suman 7036, no 7061). Se saca esa validación
-- rígida; se dejan las que sí tienen sentido siempre (que ningún
-- valor sea negativo).
-- ------------------------------------------------------------
alter table contadores drop constraint contadores_check;

-- ------------------------------------------------------------
-- Cédula: dato de identidad para el acta de fin de turno que se
-- firma (todavía no está esa función, pero el dato hay que
-- empezar a pedirlo desde ya). Nullable porque el personal que ya
-- existe (Jorge, etc.) no la tiene cargada todavía.
-- ------------------------------------------------------------
alter table usuarios add column cedula text;

-- crear_usuario cambia de firma (parámetro nuevo) y listar_personal
-- cambia de tipo de retorno (columna nueva) — "create or replace" no
-- puede hacer ninguna de las dos cosas, hay que borrar la versión
-- vieja primero.
drop function if exists crear_usuario(text, text, text, text, text);
drop function if exists listar_personal();

create or replace function crear_usuario(
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null,
  p_cedula text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_rol_id uuid;
  v_area_id uuid;
begin
  select id into v_rol_id from roles where codigo = p_rol_codigo;
  if v_rol_id is null then
    raise exception 'Rol % no existe', p_rol_codigo;
  end if;

  if p_area_codigo is not null then
    select id into v_area_id from areas where codigo = p_area_codigo;
    if v_area_id is null then
      raise exception 'Área % no existe', p_area_codigo;
    end if;
  end if;

  insert into usuarios (usuario, password_hash, nombre, cedula)
  values (lower(p_usuario), extensions.crypt(p_password, extensions.gen_salt('bf')), coalesce(p_nombre, p_usuario), p_cedula)
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id, area_id)
  values (v_usuario_id, v_rol_id, v_area_id);

  return v_usuario_id;
end;
$$;

create or replace function listar_personal()
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  order by u.created_at desc;
end;
$$;

grant execute on function crear_usuario(text, text, text, text, text, text) to anon, authenticated;
grant execute on function listar_personal() to anon, authenticated;
