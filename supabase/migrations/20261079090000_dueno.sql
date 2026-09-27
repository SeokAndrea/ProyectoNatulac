-- ============================================================
-- DUEÑO: un nivel por encima de Super Administrador
-- ============================================================
-- Rework 2026-09-27 (dueño). Pensado para dejar ese usuario como
-- debugger/responsable técnico. Es un flag, no un rol: el dueño es
-- Super Administrador para todo lo demás. Se reutiliza usuarios.ve_errores
-- (ya existe y hoy solo lo tiene agomez, ver 20261047090000) para no
-- tocar las funciones que ya lo leen. Solo el dueño:
--   * Es intocable: nadie más lo edita, desactiva, elimina ni le cambia
--     la contraseña (él mismo sí).
--   * Da o quita el rol Super Administrador y gestiona a los Super Admins.
--   * Ve Errores (ya era así) y cambia los ajustes (configuracion_app).
-- ============================================================

comment on column usuarios.ve_errores is 'Dueño: por encima de Super Administrador (ver 20261079090000_dueno.sql).';

create or replace function es_dueno(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.ve_errores and u.activo from usuarios u where u.usuario = lower(p_usuario)), false);
$$;

grant execute on function es_dueno(text) to anon, authenticated;

-- Ids de los dueños, para que la pantalla de Personal los marque y no ofrezca tocarlos.
create or replace function listar_duenos(p_usuario text)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;
  return query select u.id from usuarios u where u.ve_errores;
end;
$$;

grant execute on function listar_duenos(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Personal: al dueño solo lo toca él mismo; a un Super Administrador,
-- solo el dueño. Lo usan editar/restablecer/desactivar/reactivar/eliminar.
-- ------------------------------------------------------------
create or replace function puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from usuarios u where u.id = p_usuario_id and u.ve_errores) then
    return exists (select 1 from usuarios u where u.id = p_usuario_id and u.usuario = lower(p_creador_usuario));
  end if;
  if not tiene_permiso(p_creador_usuario, 'PERSONAL_GESTIONAR') then
    return false;
  end if;
  if exists (
    select 1 from usuario_roles ur join roles r on r.id = ur.rol_id
    where ur.usuario_id = p_usuario_id and r.codigo = 'SUPERADMINISTRADOR'
  ) then
    return es_dueno(p_creador_usuario);
  end if;
  return true;
end;
$$;


-- Dar el rol Super Administrador: solo el dueño.

-- Última versión: 20261078090000_roles_y_permisos.sql
create or replace function crear_usuario(
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
  v_usuario_id uuid;
  v_rol_id uuid;
  v_area_id uuid;
  v_area_origen_id uuid;
begin
  select rol_codigo into v_creador_rol from rol_y_area_de(p_creador_usuario);

  if not tiene_permiso(p_creador_usuario, 'PERSONAL_GESTIONAR') then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  if p_rol_codigo = 'SUPERADMINISTRADOR' and not es_dueno(p_creador_usuario) then
    raise exception 'Solo el dueño puede dar el rol Super Administrador.';
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

-- Última versión: 20261078090000_roles_y_permisos.sql
create or replace function editar_personal(
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
  v_rol_id uuid;
  v_area_id uuid;
  v_area_origen_id uuid;
  v_antes jsonb;
  v_despues jsonb;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para editar a esta persona.';
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

  if p_rol_codigo = 'SUPERADMINISTRADOR' and not es_dueno(p_creador_usuario) then
    raise exception 'Solo el dueño puede dar el rol Super Administrador.';
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

-- Ajustes de la app: solo el dueño.

-- Última versión: 20261065090000_configuracion_app.sql
create or replace function guardar_configuracion(
  p_usuario text,
  p_clave text,
  p_valor text,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_antes text;
  v_valor text := nullif(trim(coalesce(p_valor, '')), '');
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not es_dueno(p_usuario) then
    raise exception 'No tienes permiso para cambiar los ajustes.';
  end if;
  if p_clave not in ('sheet_mantenimiento_url') then
    raise exception 'Ajuste desconocido.';
  end if;
  if p_clave = 'sheet_mantenimiento_url' and v_valor is not null
     and v_valor !~ '^https://docs\.google\.com/spreadsheets/' then
    raise exception 'El enlace tiene que ser de un Google Sheet (https://docs.google.com/spreadsheets/…).';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select valor into v_antes from configuracion_app where clave = p_clave;

  insert into configuracion_app (clave, valor, updated_at, updated_by)
  values (p_clave, v_valor, now(), v_usuario_id)
  on conflict (clave) do update
    set valor = excluded.valor, updated_at = now(), updated_by = v_usuario_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'configuracion_app', p_clave, p_pagina,
    format('Cambió el ajuste «%s»', p_clave),
    jsonb_build_object('valor', v_antes),
    jsonb_build_object('valor', v_valor)
  );
end;
$$;
