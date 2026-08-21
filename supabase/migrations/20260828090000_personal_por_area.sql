-- ============================================================
-- PERSONAL FILTRADO POR ÁREA (y reforzado en la base, no en la UI)
-- ============================================================
-- Regla de negocio: el personal está ligado al área. Los
-- ADMINISTRADOR_AREA de una misma área (ej. todos los de Aséptico)
-- ven y gestionan el MISMO personal, acotado a su área — no pueden
-- ver ni tocar el de otras áreas, ni asignar el rol
-- SUPERADMINISTRADOR. Jorge (SUPERADMINISTRADOR) es la jerarquía más
-- alta: ve y edita el personal de TODAS las áreas.
--
-- Hasta ahora estas funciones no sabían quién las llamaba — cualquiera
-- con la clave "anon" podía pedir crear_usuario con cualquier área o
-- rol, incluido SUPERADMINISTRADOR. Ahora reciben quién hace el
-- pedido (p_creador_usuario) y la regla de "qué le está permitido
-- tocar" se valida ACÁ, en Postgres — no confiando en que la
-- interfaz oculte botones. Así, lo único que Jorge no puede hacer
-- desde la app es algo que estas funciones no permitan a nadie; todo
-- lo demás lo edita desde acá, sin tocar la base directo.
-- ============================================================

drop function if exists listar_personal();
drop function if exists crear_usuario(text, text, text, text, text, text);
drop function if exists editar_personal(uuid, text, text, text, text);
drop function if exists restablecer_password(uuid, text);
drop function if exists desactivar_personal(uuid);
drop function if exists reactivar_personal(uuid);

-- Devuelve (rol_codigo, area_codigo) de quien está haciendo el
-- pedido, para que el resto de las funciones validen contra esto.
create or replace function rol_y_area_de(p_usuario text, out rol_codigo text, out area_codigo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  select r.codigo, a.codigo into rol_codigo, area_codigo
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.usuario = lower(p_usuario)
  limit 1;
end;
$$;

create or replace function listar_personal(p_usuario text)
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
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);

  if v_rol is null then
    raise exception 'No tenés permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where v_rol = 'SUPERADMINISTRADOR' or a.codigo = v_area
  order by u.created_at desc;
end;
$$;

create or replace function crear_usuario(
  p_creador_usuario text,
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
  v_creador_rol text;
  v_creador_area text;
  v_usuario_id uuid;
  v_rol_id uuid;
  v_area_id uuid;
begin
  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);

  if v_creador_rol = 'ADMINISTRADOR_AREA' then
    if p_rol_codigo = 'SUPERADMINISTRADOR' then
      raise exception 'No tenés permiso para asignar ese rol.';
    end if;
    if p_area_codigo is distinct from v_creador_area then
      raise exception 'Solo podés agregar personal de tu propia área.';
    end if;
  elsif v_creador_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tenés permiso para hacer esto.';
  end if;

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

-- Valida que quien edita/resetea/da de baja tenga permiso sobre ESE
-- usuario puntual (misma área, o SUPERADMINISTRADOR).
create or replace function puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador_rol text;
  v_creador_area text;
  v_objetivo_area text;
  v_objetivo_rol text;
begin
  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);
  if v_creador_rol = 'SUPERADMINISTRADOR' then
    return true;
  end if;
  if v_creador_rol is distinct from 'ADMINISTRADOR_AREA' then
    return false;
  end if;

  select a.codigo, r.codigo into v_objetivo_area, v_objetivo_rol
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.id = p_usuario_id;

  return v_objetivo_rol is distinct from 'SUPERADMINISTRADOR' and v_objetivo_area = v_creador_area;
end;
$$;

create or replace function editar_personal(
  p_creador_usuario text,
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
  v_creador_rol text;
  v_creador_area text;
  v_rol_id uuid;
  v_area_id uuid;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tenés permiso para editar a esta persona.';
  end if;

  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);
  if v_creador_rol = 'ADMINISTRADOR_AREA' and (p_rol_codigo = 'SUPERADMINISTRADOR' or p_area_codigo is distinct from v_creador_area) then
    raise exception 'No tenés permiso para asignar ese rol o área.';
  end if;

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

create or replace function restablecer_password(p_creador_usuario text, p_usuario_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tenés permiso para restablecer la contraseña de esta persona.';
  end if;

  update usuarios
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
  where id = p_usuario_id;
end;
$$;

create or replace function desactivar_personal(p_creador_usuario text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tenés permiso para dar de baja a esta persona.';
  end if;
  update usuarios set activo = false where id = p_usuario_id;
end;
$$;

create or replace function reactivar_personal(p_creador_usuario text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tenés permiso para reactivar a esta persona.';
  end if;
  update usuarios set activo = true where id = p_usuario_id;
end;
$$;

grant execute on function rol_y_area_de(text) to anon, authenticated;
grant execute on function listar_personal(text) to anon, authenticated;
grant execute on function crear_usuario(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function puede_gestionar_personal(text, uuid) to anon, authenticated;
grant execute on function editar_personal(text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function restablecer_password(text, uuid, text) to anon, authenticated;
grant execute on function desactivar_personal(text, uuid) to anon, authenticated;
grant execute on function reactivar_personal(text, uuid) to anon, authenticated;
