-- ============================================================
-- CARGO (título del puesto) — separado del rol funcional
-- ============================================================
-- El rol (SUPERVISOR / ADMINISTRADOR_AREA / SUPERADMINISTRADOR) sigue
-- controlando TODOS los permisos. El cargo es solo un rótulo visible:
-- el mismo cargo ("Analista de Producción") puede ir sobre roles
-- distintos, y no cambia nada de lo que la persona puede hacer.
-- Catálogo de cargos en src/lib/catalogos.ts (CARGOS).
-- ============================================================

alter table usuarios add column cargo text;

-- Consulta suelta para el Panel (muestra el cargo del supervisor del turno).
create or replace function cargo_de_usuario(p_usuario text)
returns text
language sql
security definer
set search_path = public
as $$
  select cargo from usuarios where usuario = lower(p_usuario);
$$;

grant execute on function cargo_de_usuario(text) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_personal: suma cargo al retorno.
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

  if v_rol is null then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, ao.codigo, u.cargo, u.activo, u.created_at
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
-- listar_auditoria: suma el cargo de quien hizo la acción.
-- ------------------------------------------------------------
drop function if exists listar_auditoria(text, date, date);

create function listar_auditoria(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  ocurrido_en timestamptz,
  usuario text,
  usuario_nombre text,
  usuario_cargo text,
  accion text,
  entidad text,
  entidad_id text,
  pagina text,
  resumen text,
  antes jsonb,
  despues jsonb
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
  select a.ocurrido_en, a.usuario, u.nombre, u.cargo, a.accion, a.entidad, a.entidad_id, a.pagina, a.resumen, a.antes, a.despues
  from auditoria a
  left join usuarios u on u.id = a.usuario_id
  where (p_fecha_desde is null or a.ocurrido_en::date >= p_fecha_desde)
    and (p_fecha_hasta is null or a.ocurrido_en::date <= p_fecha_hasta)
  order by a.ocurrido_en desc;
end;
$$;

grant execute on function listar_auditoria(text, date, date) to anon, authenticated;

-- ------------------------------------------------------------
-- crear_usuario: suma p_cargo (antes de p_pagina). Cuerpo = 20260980
-- + guardado del cargo y su registro en la auditoría.
-- ------------------------------------------------------------
drop function if exists crear_usuario(text, text, text, text, text, text, text, text, text);

create function crear_usuario(
  p_creador_usuario text,
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null,
  p_cedula text default null,
  p_area_origen_codigo text default null,
  p_cargo text default null,
  p_pagina text default null
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

  insert into usuarios (usuario, password_hash, nombre, cedula, area_origen_id, cargo)
  values (
    lower(p_usuario),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(p_nombre, p_usuario),
    p_cedula,
    v_area_origen_id,
    p_cargo
  )
  returning id into v_usuario_id;

  insert into usuario_roles (usuario_id, rol_id, area_id)
  values (v_usuario_id, v_rol_id, v_area_id);

  perform registrar_auditoria(
    p_creador_usuario, 'CREAR', 'personal', v_usuario_id::text, p_pagina,
    'Creó a ' || coalesce(p_nombre, p_usuario) || ' (@' || lower(p_usuario) || ')',
    null,
    jsonb_build_object(
      'nombre', coalesce(p_nombre, p_usuario),
      'cedula', p_cedula,
      'area', p_area_codigo,
      'area_origen', p_area_origen_codigo,
      'cargo', p_cargo,
      'rol', p_rol_codigo
    )
  );

  return v_usuario_id;
end;
$$;

grant execute on function crear_usuario(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- editar_personal: suma p_cargo (antes de p_pagina). Cuerpo = 20260980
-- + cargo en el snapshot antes/después.
-- ------------------------------------------------------------
drop function if exists editar_personal(text, uuid, text, text, text, text, text, text);

create function editar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_area_codigo text,
  p_rol_codigo text,
  p_area_origen_codigo text default null,
  p_cargo text default null,
  p_pagina text default null
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
  v_antes jsonb;
  v_despues jsonb;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para editar a esta persona.';
  end if;

  select * into v_creador_rol, v_creador_area from rol_y_area_de(p_creador_usuario);
  if v_creador_rol = 'ADMINISTRADOR_AREA' and (p_rol_codigo = 'SUPERADMINISTRADOR' or p_area_codigo is distinct from v_creador_area) then
    raise exception 'No tienes permiso para asignar ese rol o área.';
  end if;

  select jsonb_build_object(
    'nombre', u.nombre,
    'cedula', u.cedula,
    'area', (select codigo from areas where id = ur.area_id),
    'area_origen', (select codigo from areas where id = u.area_origen_id),
    'cargo', u.cargo,
    'rol', (select codigo from roles where id = ur.rol_id)
  )
  into v_antes
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  where u.id = p_usuario_id;

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

  update usuarios
  set nombre = p_nombre, cedula = p_cedula, area_origen_id = v_area_origen_id, cargo = p_cargo
  where id = p_usuario_id;
  update usuario_roles set rol_id = v_rol_id, area_id = v_area_id where usuario_id = p_usuario_id;

  v_despues := jsonb_build_object(
    'nombre', p_nombre,
    'cedula', p_cedula,
    'area', p_area_codigo,
    'area_origen', p_area_origen_codigo,
    'cargo', p_cargo,
    'rol', p_rol_codigo
  );

  perform registrar_auditoria(
    p_creador_usuario, 'EDITAR', 'personal', p_usuario_id::text, p_pagina,
    'Editó a ' || p_nombre, v_antes, v_despues
  );
end;
$$;

grant execute on function editar_personal(text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
