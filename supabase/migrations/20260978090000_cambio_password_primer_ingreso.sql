-- ============================================================
-- PRIMER INGRESO: corroborar datos + definir contraseña
-- ============================================================
-- El alta de usuarios se hace con datos mínimos y la clave base "1234"
-- (para que coincida con el otro sistema, que usa claves de 4 dígitos).
-- En el primer ingreso la persona tiene que:
--   - confirmar / completar Nombre y Apellido y Cédula,
--   - elegir su propia clave de 4 dígitos, distinta de 1234.
--
--   - usuarios.debe_completar_perfil: flag explícito. Arranca en true
--     (default). completar_primer_ingreso() lo apaga;
--     restablecer_password() (reset del admin) lo vuelve a prender.
--   - verificar_login() devuelve ese flag y la cédula (para prellenar
--     la pantalla de primer ingreso).
--   - Cédula: se guarda formateada "XX.XXX.XXX" o "X.XXX.XXX".
--   - El frontend, al iniciar sesión, además chequea que la clave
--     escrita sea de 4 dígitos y != 1234 — algo que el hash por sí
--     solo no permite saber (bcrypt es de una sola vía).
-- ============================================================

alter table usuarios add column debe_completar_perfil boolean not null default true;

-- Los usuarios que YA existen siguen como están (no se les fuerza nada).
update usuarios set debe_completar_perfil = false;

-- ------------------------------------------------------------
-- verificar_login: suma debe_completar_perfil y cedula al retorno.
-- "create or replace" no puede cambiar el tipo de retorno — se borra
-- la versión vieja primero.
-- ------------------------------------------------------------
drop function if exists verificar_login(text, text);

create function verificar_login(p_usuario text, p_password text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  debe_completar_perfil boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.debe_completar_perfil
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

grant execute on function verificar_login(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- completar_primer_ingreso: la propia persona confirma sus datos y
-- define su clave nueva. Valida la clave actual, el formato de la
-- cédula y la clave nueva (4 dígitos, != 1234), y apaga el flag.
-- ------------------------------------------------------------
create or replace function completar_primer_ingreso(
  p_usuario text,
  p_password_actual text,
  p_password_nueva text,
  p_nombre text,
  p_cedula text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from usuarios
  where usuario = lower(p_usuario)
    and password_hash = extensions.crypt(p_password_actual, password_hash)
    and activo = true;

  if v_id is null then
    raise exception 'La contraseña actual no es correcta.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre y apellido.';
  end if;

  if p_cedula !~ '^\d{1,2}\.\d{3}\.\d{3}$' then
    raise exception 'La cédula debe tener el formato XX.XXX.XXX o X.XXX.XXX.';
  end if;

  if p_password_nueva !~ '^\d{4}$' then
    raise exception 'La contraseña nueva debe ser de 4 dígitos.';
  end if;

  if p_password_nueva = '1234' then
    raise exception 'La contraseña nueva no puede ser 1234.';
  end if;

  update usuarios
  set nombre = trim(p_nombre),
      cedula = p_cedula,
      password_hash = extensions.crypt(p_password_nueva, extensions.gen_salt('bf')),
      debe_completar_perfil = false
  where id = v_id;
end;
$$;

grant execute on function completar_primer_ingreso(text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- restablecer_password (reset del admin): además de cambiar el hash,
-- vuelve a exigir el paso de primer ingreso.
-- ------------------------------------------------------------
create or replace function restablecer_password(p_creador_usuario text, p_usuario_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para restablecer la contraseña de esta persona.';
  end if;

  update usuarios
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      debe_completar_perfil = true
  where id = p_usuario_id;
end;
$$;

grant execute on function restablecer_password(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Usuario de prueba para verificar el flujo: clavepr / 1234.
-- Inserción directa (mismo hash que crear_usuario). Se le pone nombre
-- pero NO cédula, para ver la pantalla de primer ingreso prellenando
-- el nombre y pidiendo la cédula. debe_completar_perfil queda en true
-- por el default de la columna.
-- ------------------------------------------------------------
insert into usuarios (usuario, password_hash, nombre)
values ('clavepr', extensions.crypt('1234', extensions.gen_salt('bf')), 'Clave Prueba');

insert into usuario_roles (usuario_id, rol_id, area_id)
select u.id, r.id, a.id
from usuarios u, roles r, areas a
where u.usuario = 'clavepr' and r.codigo = 'SUPERVISOR' and a.codigo = 'ASEPTICO';
