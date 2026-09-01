-- ============================================================
-- AUDITORÍA UNIVERSAL — base + módulo Personal (FASE 1)
-- ============================================================
-- Registro append-only de TODA mutación: cuándo, quién, qué acción,
-- qué entidad, en qué página, y los valores antes/después. Se
-- instrumenta módulo por módulo: esta migración trae la base y el
-- primer módulo (Personal). El resto (Programación, Producto
-- Terminado, ciclo de turno) va en migraciones siguientes.
-- Ver la memoria "auditoria-universal".
-- ============================================================

create table auditoria (
  id uuid primary key default gen_random_uuid(),
  ocurrido_en timestamptz not null default now(),
  usuario_id uuid references usuarios (id) on delete set null,
  usuario text,                       -- desnormalizado: sobrevive al borrado del usuario
  accion text not null,              -- CREAR | EDITAR | ELIMINAR | ACTIVAR | DESACTIVAR | RESET_PASSWORD | ...
  entidad text not null,             -- 'personal' | 'programacion_dia' | 'turno' | ...
  entidad_id text,
  pagina text,                       -- lo manda el frontend (ej. "Edición de Datos → Personal")
  resumen text,                      -- frase legible
  antes jsonb,                       -- null en CREAR
  despues jsonb                      -- null en ELIMINAR
);

alter table auditoria enable row level security;
create index auditoria_ocurrido_en_idx on auditoria (ocurrido_en desc);
create index auditoria_entidad_idx on auditoria (entidad, entidad_id);

-- ------------------------------------------------------------
-- Helper: lo llama cada RPC de mutación (perform registrar_auditoria(...)).
-- ------------------------------------------------------------
create or replace function registrar_auditoria(
  p_usuario text,
  p_accion text,
  p_entidad text,
  p_entidad_id text,
  p_pagina text,
  p_resumen text,
  p_antes jsonb,
  p_despues jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into auditoria (usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
  values (
    (select id from usuarios where usuario = lower(p_usuario)),
    lower(p_usuario),
    p_accion, p_entidad, p_entidad_id, p_pagina, p_resumen, p_antes, p_despues
  );
$$;

grant execute on function registrar_auditoria(text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Lectura: solo SUPERADMINISTRADOR (igual que el resto de Auditoría).
-- ------------------------------------------------------------
create or replace function listar_auditoria(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  ocurrido_en timestamptz,
  usuario text,
  usuario_nombre text,
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
  select a.ocurrido_en, a.usuario, u.nombre, a.accion, a.entidad, a.entidad_id, a.pagina, a.resumen, a.antes, a.despues
  from auditoria a
  left join usuarios u on u.id = a.usuario_id
  where (p_fecha_desde is null or a.ocurrido_en::date >= p_fecha_desde)
    and (p_fecha_hasta is null or a.ocurrido_en::date <= p_fecha_hasta)
  order by a.ocurrido_en desc;
end;
$$;

grant execute on function listar_auditoria(text, date, date) to anon, authenticated;

-- ============================================================
-- MÓDULO PERSONAL: se re-emiten las 6 RPC con p_pagina + auditoría.
-- Cuerpos = versión más reciente (20260979 area_origen, 20260978
-- debe_completar_perfil, 20260903 forzar) + el registro.
-- ============================================================

drop function if exists crear_usuario(text, text, text, text, text, text, text, text);

create function crear_usuario(
  p_creador_usuario text,
  p_usuario text,
  p_password text,
  p_rol_codigo text,
  p_area_codigo text default null,
  p_nombre text default null,
  p_cedula text default null,
  p_area_origen_codigo text default null,
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

  perform registrar_auditoria(
    p_creador_usuario, 'CREAR', 'personal', v_usuario_id::text, p_pagina,
    'Creó a ' || coalesce(p_nombre, p_usuario) || ' (@' || lower(p_usuario) || ')',
    null,
    jsonb_build_object(
      'nombre', coalesce(p_nombre, p_usuario),
      'cedula', p_cedula,
      'area', p_area_codigo,
      'area_origen', p_area_origen_codigo,
      'rol', p_rol_codigo
    )
  );

  return v_usuario_id;
end;
$$;

grant execute on function crear_usuario(text, text, text, text, text, text, text, text, text) to anon, authenticated;

drop function if exists editar_personal(text, uuid, text, text, text, text, text);

create function editar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_area_codigo text,
  p_rol_codigo text,
  p_area_origen_codigo text default null,
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

  update usuarios set nombre = p_nombre, cedula = p_cedula, area_origen_id = v_area_origen_id where id = p_usuario_id;
  update usuario_roles set rol_id = v_rol_id, area_id = v_area_id where usuario_id = p_usuario_id;

  v_despues := jsonb_build_object(
    'nombre', p_nombre,
    'cedula', p_cedula,
    'area', p_area_codigo,
    'area_origen', p_area_origen_codigo,
    'rol', p_rol_codigo
  );

  perform registrar_auditoria(
    p_creador_usuario, 'EDITAR', 'personal', p_usuario_id::text, p_pagina,
    'Editó a ' || p_nombre, v_antes, v_despues
  );
end;
$$;

grant execute on function editar_personal(text, uuid, text, text, text, text, text, text) to anon, authenticated;

drop function if exists restablecer_password(text, uuid, text);

create function restablecer_password(p_creador_usuario text, p_usuario_id uuid, p_password text, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para restablecer la contraseña de esta persona.';
  end if;

  select nombre into v_nombre from usuarios where id = p_usuario_id;

  update usuarios
  set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      debe_completar_perfil = true
  where id = p_usuario_id;

  -- Nunca se guardan contraseñas en el registro: solo el hecho.
  perform registrar_auditoria(
    p_creador_usuario, 'RESET_PASSWORD', 'personal', p_usuario_id::text, p_pagina,
    'Restableció la contraseña de ' || coalesce(v_nombre, '@?'), null, null
  );
end;
$$;

grant execute on function restablecer_password(text, uuid, text, text) to anon, authenticated;

drop function if exists desactivar_personal(text, uuid);

create function desactivar_personal(p_creador_usuario text, p_usuario_id uuid, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para dar de baja a esta persona.';
  end if;

  select nombre into v_nombre from usuarios where id = p_usuario_id;
  update usuarios set activo = false where id = p_usuario_id;

  perform registrar_auditoria(
    p_creador_usuario, 'DESACTIVAR', 'personal', p_usuario_id::text, p_pagina,
    'Dio de baja a ' || coalesce(v_nombre, '@?'),
    jsonb_build_object('activo', true), jsonb_build_object('activo', false)
  );
end;
$$;

grant execute on function desactivar_personal(text, uuid, text) to anon, authenticated;

drop function if exists reactivar_personal(text, uuid);

create function reactivar_personal(p_creador_usuario text, p_usuario_id uuid, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para reactivar a esta persona.';
  end if;

  select nombre into v_nombre from usuarios where id = p_usuario_id;
  update usuarios set activo = true where id = p_usuario_id;

  perform registrar_auditoria(
    p_creador_usuario, 'ACTIVAR', 'personal', p_usuario_id::text, p_pagina,
    'Reactivó a ' || coalesce(v_nombre, '@?'),
    jsonb_build_object('activo', false), jsonb_build_object('activo', true)
  );
end;
$$;

grant execute on function reactivar_personal(text, uuid, text) to anon, authenticated;

drop function if exists eliminar_personal(text, uuid, boolean);

create function eliminar_personal(p_creador_usuario text, p_usuario_id uuid, p_forzar boolean default false, p_pagina text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para eliminar a esta persona.';
  end if;

  select jsonb_build_object('usuario', u.usuario, 'nombre', u.nombre, 'cedula', u.cedula)
  into v_antes
  from usuarios u
  where u.id = p_usuario_id;

  if p_forzar then
    delete from turnos where supervisor_id = p_usuario_id;
    delete from turnos_historial where usuario_id = p_usuario_id;
    delete from contadores_historial where usuario_id = p_usuario_id;
  end if;

  delete from usuarios where id = p_usuario_id;

  perform registrar_auditoria(
    p_creador_usuario, 'ELIMINAR', 'personal', p_usuario_id::text, p_pagina,
    'Eliminó a ' || coalesce(v_antes ->> 'nombre', '?')
      || (case when p_forzar then ' (forzado: borró también sus turnos)' else '' end),
    v_antes, null
  );
end;
$$;

grant execute on function eliminar_personal(text, uuid, boolean, text) to anon, authenticated;
