-- Personal: cada jefe gestiona su área y los niveles menores (reglas en la base).
-- Reemplaza crear_usuario, editar_personal y listar_personal (firmas nuevas con puesto)
-- y endurece puede_gestionar_personal, guardar_permisos_extra y eliminar_personal.
-- Los roles (usuario_roles) los sigue llenando el trigger de usuarios al cambiar puesto_id.

drop function if exists crear_usuario(text, text, text, text, text, text, text, text, text, text);
drop function if exists editar_personal(text, uuid, text, text, text, text, text, text, text);
drop function if exists listar_personal(text);

-- ¿Puede p_creador_usuario gestionar a la persona p_usuario_id?
create or replace function puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador usuarios%rowtype;
  v_cp puestos%rowtype;
  v_dp puestos%rowtype;
  v_destino usuarios%rowtype;
begin
  perform public.exigir_usuario('puede_gestionar_personal', p_creador_usuario);

  select * into v_creador from usuarios where usuario = lower(p_creador_usuario);
  select * into v_destino from usuarios where id = p_usuario_id;
  if v_destino.id is null or v_creador.id is null then
    return false;
  end if;

  -- La dueña solo la gestiona ella misma.
  if v_destino.ve_errores then
    return v_creador.id = v_destino.id and es_dueno(p_creador_usuario);
  end if;

  -- Nadie se gestiona a sí mismo.
  if v_creador.id = v_destino.id then
    return false;
  end if;

  select * into v_dp from puestos where id = v_destino.puesto_id;

  if tiene_permiso(p_creador_usuario, 'ESTRUCTURA_GESTIONAR') then
    -- El puesto Super Administrador solo lo gestiona la dueña.
    if v_dp.codigo = 'SUPERADMINISTRADOR' then
      return es_dueno(p_creador_usuario);
    end if;
    return true;
  end if;

  if not tiene_permiso(p_creador_usuario, 'PERSONAL_GESTIONAR') then
    return false;
  end if;

  select * into v_cp from puestos where id = v_creador.puesto_id;
  if v_cp.area_id is null or v_cp.nivel is null
     or v_dp.area_id is null or v_dp.nivel is null then
    return false;
  end if;

  return v_dp.area_id = v_cp.area_id and v_dp.nivel > v_cp.nivel;
end;
$$;

-- Puestos que p_usuario puede dar a otras personas.
create or replace function puestos_asignables(p_usuario text)
returns table (puesto_id uuid, codigo text, nombre text, area_codigo text, nivel smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cp puestos%rowtype;
  v_todos boolean;
begin
  perform public.exigir_usuario('puestos_asignables', p_usuario);

  v_todos := tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR');
  if not v_todos then
    if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
      return;
    end if;
    select p.* into v_cp from usuarios u join puestos p on p.id = u.puesto_id
     where u.usuario = lower(p_usuario);
    if v_cp.area_id is null or v_cp.nivel is null then
      return;
    end if;
  end if;

  return query
  select p.id, p.codigo, p.nombre, a.codigo, p.nivel
    from puestos p
    left join areas a on a.id = p.area_id
   where p.activo
     and (
       (v_todos and (p.codigo <> 'SUPERADMINISTRADOR' or es_dueno(p_usuario)))
       or (not v_todos and p.area_id = v_cp.area_id and p.nivel > v_cp.nivel)
     )
   order by a.codigo nulls last, p.nivel nulls last, p.nombre;
end;
$$;

create or replace function listar_personal(p_usuario text)
returns table (
  usuario_id uuid, usuario text, nombre text, cedula text,
  puesto_id uuid, puesto text, area_codigo text, nivel smallint, titulo text,
  activo boolean, gestionable boolean, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todos boolean;
  v_area uuid;
begin
  perform public.exigir_usuario('listar_personal', p_usuario);

  v_todos := tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR');
  if not v_todos then
    if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
      raise exception 'No tienes permiso para ver esto.';
    end if;
    select p.area_id into v_area from usuarios uu join puestos p on p.id = uu.puesto_id
     where uu.usuario = lower(p_usuario);
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula,
         p.id, p.nombre, a.codigo, p.nivel, u.titulo,
         u.activo, puede_gestionar_personal(p_usuario, u.id), u.created_at
    from usuarios u
    join puestos p on p.id = u.puesto_id
    left join areas a on a.id = p.area_id
   where u.usuario <> 'sistema'
     and (v_todos or (v_area is not null and p.area_id = v_area))
   order by u.created_at desc;
end;
$$;

create or replace function crear_usuario(
  p_creador_usuario text,
  p_usuario text,
  p_password text,
  p_puesto_id uuid,
  p_nombre text,
  p_cedula text default null,
  p_titulo text default null,
  p_pagina text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_puesto_nombre text;
begin
  perform public.exigir_usuario('crear_usuario', p_creador_usuario);

  if not (tiene_permiso(p_creador_usuario, 'PERSONAL_GESTIONAR')
          or tiene_permiso(p_creador_usuario, 'ESTRUCTURA_GESTIONAR')) then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  select pa.nombre into v_puesto_nombre
    from puestos_asignables(p_creador_usuario) pa where pa.puesto_id = p_puesto_id;
  if v_puesto_nombre is null then
    raise exception 'Ese puesto no lo puedes asignar.';
  end if;

  insert into usuarios (usuario, password_hash, nombre, cedula, puesto_id, titulo)
  values (
    lower(p_usuario),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(p_nombre, p_usuario),
    p_cedula,
    p_puesto_id,
    nullif(btrim(p_titulo), '')
  )
  returning id into v_usuario_id;

  perform registrar_auditoria(
    p_creador_usuario, 'CREAR', 'personal', v_usuario_id::text, p_pagina,
    'Creó a ' || coalesce(p_nombre, p_usuario) || ' (@' || lower(p_usuario) || ')',
    null,
    jsonb_build_object(
      'nombre', coalesce(p_nombre, p_usuario),
      'cedula', p_cedula,
      'puesto', v_puesto_nombre,
      'titulo', nullif(btrim(p_titulo), '')
    )
  );

  return v_usuario_id;
end;
$$;

create or replace function editar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_nombre text,
  p_cedula text,
  p_puesto_id uuid,
  p_titulo text,
  p_pagina text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual uuid;
  v_antes jsonb;
  v_despues jsonb;
  v_propio boolean;
  v_puesto_nuevo text;
begin
  perform public.exigir_usuario('editar_personal', p_creador_usuario);
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No puedes gestionar a esta persona.';
  end if;

  select u.puesto_id,
         jsonb_build_object('nombre', u.nombre, 'cedula', u.cedula, 'puesto', p.nombre, 'titulo', u.titulo),
         u.usuario = lower(p_creador_usuario)
    into v_actual, v_antes, v_propio
    from usuarios u join puestos p on p.id = u.puesto_id
   where u.id = p_usuario_id;

  p_puesto_id := coalesce(p_puesto_id, v_actual);
  if p_puesto_id is distinct from v_actual then
    if v_propio then
      raise exception 'No puedes cambiar tu propio puesto.';
    end if;
    if not exists (select 1 from puestos_asignables(p_creador_usuario) pa where pa.puesto_id = p_puesto_id) then
      raise exception 'Ese puesto no lo puedes asignar.';
    end if;
  end if;

  update usuarios
     set nombre = p_nombre, cedula = p_cedula, puesto_id = p_puesto_id,
         titulo = nullif(btrim(p_titulo), '')
   where id = p_usuario_id;

  select nombre into v_puesto_nuevo from puestos where id = p_puesto_id;
  v_despues := jsonb_build_object(
    'nombre', p_nombre, 'cedula', p_cedula, 'puesto', v_puesto_nuevo,
    'titulo', nullif(btrim(p_titulo), '')
  );

  perform registrar_auditoria(
    p_creador_usuario, 'EDITAR', 'personal', p_usuario_id::text, p_pagina,
    'Editó a ' || p_nombre, v_antes, v_despues
  );
end;
$$;

create or replace function guardar_permisos_extra(
  p_usuario text,
  p_usuario_id uuid,
  p_permisos text[],
  p_pagina text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otorgante uuid;
  v_antes text[];
  v_despues text[];
  v_nombre text;
  v_nuevos text[];
begin
  perform public.exigir_usuario('guardar_permisos_extra', p_usuario);

  select id into v_otorgante from usuarios where usuario = lower(p_usuario);
  if v_otorgante = p_usuario_id then
    raise exception 'No puedes cambiar tus propios permisos extra.';
  end if;
  if not puede_gestionar_personal(p_usuario, p_usuario_id) then
    raise exception 'No puedes gestionar a esta persona.';
  end if;
  select nombre into v_nombre from usuarios where id = p_usuario_id;
  if v_nombre is null then
    raise exception 'No se encontró a esa persona.';
  end if;

  select coalesce(array_agg(up.permiso_codigo order by up.permiso_codigo), '{}') into v_antes
    from usuario_permisos up where up.usuario_id = p_usuario_id;

  -- Solo los permisos agregados deben ser propios.
  select coalesce(array_agg(distinct x), '{}') into v_nuevos
    from unnest(coalesce(p_permisos, '{}')) x
    join permisos p on p.codigo = x
   where x <> all (v_antes);
  if exists (select 1 from unnest(v_nuevos) n where not tiene_permiso(p_usuario, n)) then
    raise exception 'No puedes dar un permiso que no tienes.';
  end if;

  -- Quita lo que el creador puede dar y ya no está en la lista; lo que no tiene, se conserva.
  delete from usuario_permisos up
   where up.usuario_id = p_usuario_id
     and up.permiso_codigo <> all (coalesce(p_permisos, '{}'))
     and tiene_permiso(p_usuario, up.permiso_codigo);

  insert into usuario_permisos (usuario_id, permiso_codigo, otorgado_por)
  select p_usuario_id, n, v_otorgante from unnest(v_nuevos) n;

  select coalesce(array_agg(up.permiso_codigo order by up.permiso_codigo), '{}') into v_despues
    from usuario_permisos up where up.usuario_id = p_usuario_id;

  if v_antes is distinct from v_despues then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'personal', p_usuario_id::text, p_pagina,
      'Cambió los permisos extra de ' || v_nombre,
      jsonb_build_object('permisos_extra', to_jsonb(v_antes)),
      jsonb_build_object('permisos_extra', to_jsonb(v_despues))
    );
  end if;
end;
$$;

-- Solo quien administra áreas y puestos (o la dueña) elimina; el modo forzado se conserva.
create or replace function eliminar_personal(
  p_creador_usuario text,
  p_usuario_id uuid,
  p_forzar boolean default false,
  p_pagina text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb;
  v_yo uuid;
begin
  perform public.exigir_usuario('eliminar_personal', p_creador_usuario);
  if not (tiene_permiso(p_creador_usuario, 'ESTRUCTURA_GESTIONAR') or es_dueno(p_creador_usuario)) then
    raise exception 'Solo quien administra áreas y puestos puede eliminar personas.';
  end if;

  select id into v_yo from usuarios where usuario = lower(p_creador_usuario);
  if v_yo = p_usuario_id then
    raise exception 'No puedes eliminarte a ti mismo.';
  end if;
  if exists (select 1 from usuarios where id = p_usuario_id and ve_errores) then
    raise exception 'No se puede eliminar a la dueña.';
  end if;
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No puedes gestionar a esta persona.';
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

grant execute on function puede_gestionar_personal(text, uuid) to anon, authenticated;
grant execute on function puestos_asignables(text) to anon, authenticated;
grant execute on function listar_personal(text) to anon, authenticated;
grant execute on function crear_usuario(text, text, text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function editar_personal(text, uuid, text, text, uuid, text, text) to anon, authenticated;
grant execute on function guardar_permisos_extra(text, uuid, text[], text) to anon, authenticated;
grant execute on function eliminar_personal(text, uuid, boolean, text) to anon, authenticated;
