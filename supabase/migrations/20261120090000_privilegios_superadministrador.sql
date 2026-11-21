comment on column public.usuarios.ve_errores is 'Marca honorifica de propietaria; no concede permisos.';

create or replace function es_superadministrador_de_puesto(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuarios u join puestos p on p.id = u.puesto_id
    where u.usuario = lower(p_usuario) and u.activo and p.codigo = 'SUPERADMINISTRADOR'
  );
$$;

-- Alias para las funciones instaladas que consultan esta capacidad.

create or replace function es_dueno(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_superadministrador_de_puesto(p_usuario);
$$;

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

  -- Nadie se gestiona a sí mismo.
  if v_creador.id = v_destino.id then
    return false;
  end if;

  select * into v_dp from puestos where id = v_destino.puesto_id;

  if tiene_permiso(p_creador_usuario, 'ESTRUCTURA_GESTIONAR') then
    if v_dp.codigo = 'SUPERADMINISTRADOR' then
      return es_superadministrador_de_puesto(p_creador_usuario);
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
       (v_todos and (p.codigo <> 'SUPERADMINISTRADOR' or es_superadministrador_de_puesto(p_usuario)))
       or (not v_todos and p.area_id = v_cp.area_id and p.nivel > v_cp.nivel)
     )
   order by a.codigo nulls last, p.nivel nulls last, p.nombre;
end;
$$;

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
  if not (tiene_permiso(p_creador_usuario, 'ESTRUCTURA_GESTIONAR')) then
    raise exception 'Solo quien administra áreas y puestos puede eliminar personas.';
  end if;

  select id into v_yo from usuarios where usuario = lower(p_creador_usuario);
  if v_yo = p_usuario_id then
    raise exception 'No puedes eliminarte a ti mismo.';
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

create or replace function perfil_sesion(p_usuario text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.exigir_usuario('perfil_sesion', p_usuario);
  select jsonb_build_object(
    'activo', u.activo,
    'rol', r.codigo,
    'area', a.codigo,
    'es_dueno', es_superadministrador_de_puesto(u.usuario),
    'es_propietaria', u.ve_errores,
    'puesto_id', p.id,
    'puesto_codigo', p.codigo,
    'puesto', p.nombre,
    'nivel', p.nivel,
    'titulo', u.titulo,
    'permisos', to_jsonb(permisos_de(u.usuario))
  )
  from usuarios u
  join puestos p on p.id = u.puesto_id
  left join roles r on r.id = p.rol_equivalente_id
  left join areas a on a.id = p.area_id
  where u.usuario = lower(p_usuario)
  limit 1;
$$;

create or replace function listar_errores_cliente(p_usuario text, p_limite integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.exigir_usuario('listar_errores_cliente', p_usuario);
  if not es_superadministrador_de_puesto(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select jsonb_agg(x.obj order by x.creado_en desc) into v_result
  from (
    select
      e.creado_en,
      jsonb_build_object(
        'id', e.id,
        'usuarioNombre', coalesce(u.nombre, e.usuario_texto),
        'funcion', e.funcion,
        'mensaje', e.mensaje,
        'contexto', e.contexto,
        'creadoEn', e.creado_en
      ) as obj
    from errores_cliente e
    left join usuarios u on u.id = e.usuario_id
    order by e.creado_en desc
    limit p_limite
  ) x;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;
