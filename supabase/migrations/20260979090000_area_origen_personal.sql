-- ============================================================
-- ÁREA DE ORIGEN (reemplazos temporales entre áreas)
-- ============================================================
-- Caso real: un supervisor que pertenece a un área (ej. Vacío) cubre
-- temporalmente otra (ej. Aséptico). El área "actual" (usuario_roles)
-- sigue siendo la única que importa para permisos, turnos y
-- estadísticas — eso NO cambia. area_origen_id es solo una etiqueta
-- informativa: de dónde es realmente la persona, para no perder ese
-- dato mientras dura el reemplazo.
--
-- Se muestra en Personal como "De <origen>" al lado del área actual,
-- solo cuando son distintas. No afecta permisos ni scoping — cualquiera
-- que pueda gestionar a la persona puede setearla o sacarla.
-- ============================================================

alter table usuarios add column area_origen_id uuid references areas (id);

-- ------------------------------------------------------------
-- listar_personal: suma area_origen_codigo al retorno.
-- ------------------------------------------------------------
drop function if exists listar_personal(text);

create function listar_personal(p_usuario text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  area_origen_codigo text,
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
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, ao.codigo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  left join areas ao on ao.id = u.area_origen_id
  where v_rol = 'SUPERADMINISTRADOR' or a.codigo = v_area
  order by u.created_at desc;
end;
$$;

grant execute on function listar_personal(text) to anon, authenticated;

-- ------------------------------------------------------------
-- crear_usuario: suma p_area_origen_codigo (opcional).
-- ------------------------------------------------------------
drop function if exists crear_usuario(text, text, text, text, text, text, text);

create function crear_usuario(
  p_creador_usuario text,
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null,
  p_cedula text default null,
  p_area_origen_codigo text default null
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
  v_area_origen_id uuid;
begin
  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);

  if v_creador_rol = 'ADMINISTRADOR_AREA' then
    if p_rol_codigo = 'SUPERADMINISTRADOR' then
      raise exception 'No tienes permiso para asignar ese rol.';
    end if;
    if p_area_codigo is distinct from v_creador_area then
      raise exception 'Solo puedes agregar personal de tu propia área.';
    end if;
  elsif v_creador_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para hacer esto.';
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

  if p_area_origen_codigo is not null then
    select id into v_area_origen_id from areas where codigo = p_area_origen_codigo;
  end if;

  insert into usuarios (usuario, password_hash, nombre, cedula, area_origen_id)
  values (
    lower(p_usuario),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(p_nombre, p_usuario),
    p_cedula,
    v_area_origen_id
  )
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id, area_id)
  values (v_usuario_id, v_rol_id, v_area_id);

  return v_usuario_id;
end;
$$;

grant execute on function crear_usuario(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- editar_personal: suma p_area_origen_codigo (opcional; null = sin
-- área de origen / termina el reemplazo).
-- ------------------------------------------------------------
drop function if exists editar_personal(text, uuid, text, text, text, text);

create function editar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_area_codigo text,
  p_rol_codigo text,
  p_area_origen_codigo text default null
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
  v_area_origen_id uuid;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para editar a esta persona.';
  end if;

  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);
  if v_creador_rol = 'ADMINISTRADOR_AREA' and (p_rol_codigo = 'SUPERADMINISTRADOR' or p_area_codigo is distinct from v_creador_area) then
    raise exception 'No tienes permiso para asignar ese rol o área.';
  end if;

  select id into v_rol_id from roles where codigo = p_rol_codigo;
  if v_rol_id is null then
    raise exception 'Rol % no existe', p_rol_codigo;
  end if;
  if p_area_codigo is not null then
    select id into v_area_id from areas where codigo = p_area_codigo;
  end if;
  if p_area_origen_codigo is not null then
    select id into v_area_origen_id from areas where codigo = p_area_origen_codigo;
  end if;

  update usuarios set nombre = p_nombre, cedula = p_cedula, area_origen_id = v_area_origen_id where id = p_usuario_id;
  update usuario_roles set rol_id = v_rol_id, area_id = v_area_id where usuario_id = p_usuario_id;
end;
$$;

grant execute on function editar_personal(text, uuid, text, text, text, text, text) to anon, authenticated;
