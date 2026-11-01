-- Personal por Áreas y Puestos, paso 3: los permisos salen del puesto.
-- tiene_permiso ya no lee rol_permisos ni el código SUPERADMINISTRADOR.

-- 1) Super Administrador sigue siendo Super Administrador aunque su área sea Pruebas
create or replace function puesto_para(p_rol text, p_area text, p_cargo text, p_area_origen text)
returns table (puesto_codigo text, titulo text)
language plpgsql
stable
as $$
declare
  v_aseptico boolean := p_area is not distinct from 'ASEPTICO';
  v_aseptico_o_sin boolean := p_area is null or p_area = 'ASEPTICO';
begin
  if p_rol = 'SUPERADMINISTRADOR' then
    return query select 'SUPERADMINISTRADOR'::text, null::text; return;
  end if;
  -- Área de Pruebas: siempre Probador
  if p_area = 'PRUEBAS' then
    return query select 'PROBADOR'::text, null::text; return;
  end if;
  -- Cargo SUBJEFE en Aséptico (cualquier rol)
  if p_cargo = 'SUBJEFE' and v_aseptico then
    return query select 'COORDINADOR_PRODUCCION'::text, 'Subjefe'::text; return;
  end if;
  if p_cargo = 'PASANTE' and v_aseptico_o_sin then
    return query select 'PASANTE'::text, null::text; return;
  end if;
  if p_rol = 'JEFE_PRODUCCION' and v_aseptico_o_sin then
    return query select 'JEFE_PRODUCCION'::text, null::text; return;
  end if;
  if p_rol = 'ANALISTA' and v_aseptico_o_sin then
    return query select 'COORDINADOR_PRODUCCION'::text, 'Analista de Producción'::text; return;
  end if;
  if p_rol = 'SUPERVISOR' and v_aseptico_o_sin then
    return query select 'SUPERVISOR'::text, null::text; return;
  end if;
  if p_rol = 'MANTENIMIENTO' and (p_area is null or p_area = 'MANTENIMIENTO') then
    return query select (case p_cargo
        when 'JEFE_MANTENIMIENTO' then 'JEFE_MANTENIMIENTO'
        when 'SUPERVISOR_MANTENIMIENTO' then 'SUPERVISOR_MANTENIMIENTO'
        else 'TECNICO_MANTENIMIENTO' end)::text, null::text;
    return;
  end if;
  if p_rol = 'SERVICIOS_INDUSTRIALES' and (p_area is null or p_area = 'SERVICIOS_INDUSTRIALES') then
    return query select 'SERVICIOS_INDUSTRIALES'::text, null::text; return;
  end if;
  if p_rol = 'VISTA' and (p_area is null or p_area in ('OTROS', 'ASEPTICO')) then
    return query select 'SOLO_VISTA'::text, nullif(btrim(p_area_origen), '')::text; return;
  end if;
  if p_rol = 'CALIDAD' and (p_area is null or p_area = 'CALIDAD') then
    return query select 'ANALISTA_CALIDAD'::text, null::text; return;
  end if;
  if p_rol = 'SUPERVISOR_CALIDAD' and (p_area is null or p_area = 'CALIDAD') then
    return query select 'SUPERVISOR_CALIDAD'::text, null::text; return;
  end if;
  -- Cualquier otra combinación: sin puesto
end;
$$;

-- 2) tiene_permiso: puesto (o todos los permisos) o extra por persona
create or replace function tiene_permiso(p_usuario text, p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.exigir_usuario('tiene_permiso', p_usuario);
  select exists (
    select 1
    from usuarios u
    join puestos p on p.id = u.puesto_id
    where u.usuario = lower(p_usuario)
      and u.activo
      and (
        p.todos_los_permisos
        or exists (select 1 from puesto_permisos pp where pp.puesto_id = p.id and pp.permiso_codigo = p_permiso)
        or exists (select 1 from usuario_permisos up where up.usuario_id = u.id and up.permiso_codigo = p_permiso)
      )
  );
$$;

-- 3) perfil_sesion: suma puesto, nivel y título; quita cargo
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
    'es_dueno', u.ve_errores,
    'puesto_id', p.id,
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

-- 4) «Ver como» por puesto (permisos_de_rol queda hasta la Fase 2)
create or replace function permisos_de_puesto(p_usuario text, p_puesto_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('permisos_de_puesto', p_usuario);
  if not coalesce(es_dueno(p_usuario), false) then
    raise exception 'Solo el dueño puede usar «Ver como».';
  end if;
  return coalesce(
    (select array_agg(t.c order by t.c) from (
       select pe.codigo as c from permisos pe
        where exists (select 1 from puestos p where p.id = p_puesto_id and p.todos_los_permisos)
       union
       select pp.permiso_codigo from puesto_permisos pp where pp.puesto_id = p_puesto_id
     ) t),
    array[]::text[]
  );
end;
$$;

-- 5) Códigos de Mantenimiento: lo decide el permiso, no el área
create or replace function exigir_editor_mtto(p_usuario text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('exigir_editor_mtto', p_usuario);
  if not (tiene_permiso(p_usuario, 'CODIGOS_MTTO_EDITAR') or es_dueno(p_usuario)) then
    raise exception 'Solo Mantenimiento puede editar los códigos.';
  end if;
end;
$$;

-- 6) Lecturas de Servicios Industriales: las decide LECTURAS_SI
create or replace function registrar_lectura_servicios_industriales(
  p_usuario text,
  p_temperatura_quantum numeric default null,
  p_agua_osmotizada numeric default null,
  p_gasoil numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
  v_id uuid;
begin
  perform public.exigir_usuario('registrar_lectura_servicios_industriales', p_usuario);
  if not tiene_permiso(p_usuario, 'LECTURAS_SI') then
    raise exception 'Solo Servicios Industriales carga estas lecturas.';
  end if;

  if p_temperatura_quantum is null and p_agua_osmotizada is null and p_gasoil is null then
    raise exception 'Carga al menos un valor.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select t.id into v_turno_id
  from turnos t
  join areas a on a.id = t.area_id
  where t.estado = 'ABIERTO' and a.codigo <> 'PRUEBAS'
  order by t.fecha desc, t.hora_inicio desc, t.created_at desc
  limit 1;

  insert into servicios_industriales_lecturas (temperatura_quantum, agua_osmotizada, gasoil, usuario_id, turno_id)
  values (p_temperatura_quantum, p_agua_osmotizada, p_gasoil, v_usuario_id, v_turno_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'servicios_industriales_lecturas', v_id::text, 'Panel de Producción',
    format('Servicios Industriales%s%s%s',
           case when p_temperatura_quantum is not null then format(' · Temp. Quantum %s', p_temperatura_quantum) else '' end,
           case when p_agua_osmotizada is not null then format(' · Agua Osmotizada %s', p_agua_osmotizada) else '' end,
           case when p_gasoil is not null then format(' · Gasoil %s L', p_gasoil) else '' end),
    null,
    jsonb_build_object('temperatura_quantum', p_temperatura_quantum, 'agua_osmotizada', p_agua_osmotizada, 'gasoil', p_gasoil)
  );

  return lectura_servicios_industriales_actual();
end;
$$;

grant execute on function permisos_de_puesto(text, uuid) to anon, authenticated;
