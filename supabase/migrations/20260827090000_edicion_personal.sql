-- ============================================================
-- EDICIÓN DE PERSONAL desde la interfaz (Edición de Datos)
-- ============================================================
-- Segunda pieza de "Edición de Datos" (después de Sabores): editar,
-- restablecer contraseña y dar de baja a alguien del personal ya
-- registrado. "Añadir Personal" (alta) ya existía — crear_usuario no
-- cambia acá.
--
-- Restablecer contraseña reemplaza a "ver la contraseña": las
-- contraseñas están hasheadas (bcrypt) y no se pueden mostrar en
-- texto plano ni recuperar — ver la conversación al respecto. Jorge
-- puede escribirle una contraseña nueva a cualquiera, no ver la
-- vieja.
-- ============================================================

drop function if exists listar_personal();

create or replace function listar_personal()
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  activo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  order by u.created_at desc;
end;
$$;

create or replace function editar_personal(
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_area_codigo text,
  p_rol_codigo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol_id uuid;
  v_area_id uuid;
begin
  select id into v_rol_id from roles where codigo = p_rol_codigo;
  if v_rol_id is null then
    raise exception 'Rol % no existe', p_rol_codigo;
  end if;

  if p_area_codigo is not null then
    select id into v_area_id from areas where codigo = p_area_codigo;
  end if;

  update usuarios set nombre = p_nombre, cedula = p_cedula where id = p_usuario_id;
  update usuario_roles set rol_id = v_rol_id, area_id = v_area_id where usuario_id = p_usuario_id;
end;
$$;

create or replace function restablecer_password(p_usuario_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where id = p_usuario_id;
end;
$$;

create or replace function desactivar_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios set activo = false where id = p_usuario_id;
end;
$$;

create or replace function reactivar_personal(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios set activo = true where id = p_usuario_id;
end;
$$;

grant execute on function listar_personal() to anon, authenticated;
grant execute on function editar_personal(uuid, text, text, text, text) to anon, authenticated;
grant execute on function restablecer_password(uuid, text) to anon, authenticated;
grant execute on function desactivar_personal(uuid) to anon, authenticated;
grant execute on function reactivar_personal(uuid) to anon, authenticated;
