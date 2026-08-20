-- ============================================================
-- USUARIOS COMO TABLA PROPIA (sin Supabase Auth)
-- ============================================================
-- Decisión explícita: NO se usa Supabase Auth. Los usuarios y sus
-- contraseñas viven en la tabla "usuarios" de este mismo esquema.
--
-- La tabla "usuarios" se había creado en 20260819120000_core_schema.sql
-- con id referenciando auth.users(id) — eso asumía Supabase Auth y ya
-- no aplica, así que se saca esa referencia acá.
--
-- Las contraseñas se guardan hasheadas (bcrypt, vía la función
-- crypt() de pgcrypto — ya estaba habilitada en la primera
-- migración), nunca en texto plano, y nunca se devuelven al
-- frontend. Todo el acceso pasa por tres funciones "security
-- definer" (corren con permisos de administrador aunque las llame
-- el frontend con la clave anon):
--   - crear_usuario(): alta de un usuario (hashea la contraseña acá).
--   - verificar_login(): valida usuario+contraseña, devuelve el
--     perfil (nunca el hash).
--   - listar_personal(): lista usuarios sin exponer password_hash.
-- Estas son las únicas funciones con permiso para tocar la tabla:
-- "usuarios" sigue con Row Level Security activado y sin políticas,
-- así que el acceso directo (select/insert desde el frontend) sigue
-- bloqueado — solo se puede entrar por estas tres puertas.
-- ============================================================

alter table usuarios drop constraint usuarios_id_fkey;
alter table usuarios alter column id set default gen_random_uuid();
alter table usuarios alter column nombre drop not null;
alter table usuarios alter column apellido drop not null;
alter table usuarios add column usuario text unique not null;
alter table usuarios add column password_hash text not null;

create or replace function crear_usuario(
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null
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

  insert into usuarios (usuario, password_hash, nombre)
  values (lower(p_usuario), extensions.crypt(p_password, extensions.gen_salt('bf')), coalesce(p_nombre, p_usuario))
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id, area_id)
  values (v_usuario_id, v_rol_id, v_area_id);

  return v_usuario_id;
end;
$$;

create or replace function verificar_login(p_usuario text, p_password text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  rol_codigo text,
  area_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.usuario, u.nombre, r.codigo, a.codigo
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.usuario = lower(p_usuario)
    and u.password_hash = extensions.crypt(p_password, u.password_hash)
    and u.activo = true
  limit 1;
end;
$$;

create or replace function listar_personal()
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
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
  select u.id, u.usuario, u.nombre, r.codigo, a.codigo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  order by u.created_at desc;
end;
$$;

grant execute on function crear_usuario(text, text, text, text, text) to anon, authenticated;
grant execute on function verificar_login(text, text) to anon, authenticated;
grant execute on function listar_personal() to anon, authenticated;

-- Jorge Guerrero, único Super Administrador por ahora. Ve y edita
-- todas las áreas, por eso p_area_codigo va en null.
select crear_usuario('jguerrero', '123456-jg', 'SUPERADMINISTRADOR', null, 'Jorge Guerrero');
