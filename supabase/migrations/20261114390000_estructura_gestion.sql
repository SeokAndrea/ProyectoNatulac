-- Personal por Áreas y Puestos: funciones para administrar áreas, puestos y la matriz de permisos.
-- Todas exigen ESTRUCTURA_GESTIONAR; listar_estructura también la admite con PERSONAL_GESTIONAR
-- (entonces trae solo el área de quien pregunta y sus puestos).

create or replace function listar_estructura(p_usuario text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_todos boolean;
  v_area uuid;
  v_areas jsonb;
  v_puestos jsonb;
  v_permisos jsonb;
begin
  perform public.exigir_usuario('listar_estructura', p_usuario);

  v_todos := tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR');
  if not v_todos then
    if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
      raise exception 'No tienes permiso para ver esto.';
    end if;
    select p.area_id into v_area from usuarios u join puestos p on p.id = u.puesto_id
     where u.usuario = lower(p_usuario);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', a.codigo, 'nombre', a.nombre, 'tipo', a.tipo, 'activo', a.activo, 'orden', a.orden,
           'personas', (select count(*) from usuarios u join puestos p on p.id = u.puesto_id where p.area_id = a.id)
         ) order by a.orden, a.nombre), '[]'::jsonb)
    into v_areas
    from areas a
   where v_todos or (v_area is not null and a.id = v_area);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'area_codigo', a.codigo,
           'nivel', p.nivel, 'activo', p.activo, 'todos_los_permisos', p.todos_los_permisos,
           'rol_equivalente', (select r.codigo from roles r where r.id = p.rol_equivalente_id),
           'personas', (select count(*) from usuarios u where u.puesto_id = p.id),
           'permisos', coalesce((select jsonb_agg(pp.permiso_codigo order by pp.permiso_codigo)
                                   from puesto_permisos pp where pp.puesto_id = p.id), '[]'::jsonb)
         ) order by a.orden nulls last, p.nivel nulls last, p.nombre), '[]'::jsonb)
    into v_puestos
    from puestos p
    left join areas a on a.id = p.area_id
   where v_todos or (v_area is not null and p.area_id = v_area);

  select coalesce(jsonb_agg(jsonb_build_object('codigo', pe.codigo, 'nombre', pe.nombre, 'tema', pe.tema)
                            order by pe.tema, pe.nombre), '[]'::jsonb)
    into v_permisos
    from permisos pe;

  return jsonb_build_object('areas', v_areas, 'puestos', v_puestos, 'permisos', v_permisos);
end;
$$;

create or replace function guardar_area(
  p_usuario text,
  p_codigo text,
  p_nombre text,
  p_tipo text,
  p_activo boolean,
  p_pagina text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_antes areas%rowtype;
  v_id uuid;
begin
  perform public.exigir_usuario('guardar_area', p_usuario);
  if not tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR') then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  if v_codigo !~ '^[A-Z0-9_]+$' then
    raise exception 'El código solo admite letras sin tilde, números y guion bajo.';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe el nombre del área.';
  end if;
  if p_tipo is not null and p_tipo not in ('PRODUCCION', 'APOYO') then
    raise exception 'El tipo debe ser PRODUCCION o APOYO.';
  end if;

  select * into v_antes from areas where codigo = v_codigo;
  if v_antes.id is null then
    if p_tipo is null then
      raise exception 'Elige el tipo del área.';
    end if;
    insert into areas (codigo, nombre, tipo, activo, orden)
    values (v_codigo, v_nombre, p_tipo, coalesce(p_activo, true),
            coalesce((select max(orden) from areas), 0) + 1)
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'areas', v_id::text, p_pagina,
      'Creó el área ' || v_nombre, null,
      jsonb_build_object('codigo', v_codigo, 'nombre', v_nombre, 'tipo', p_tipo,
                         'activo', coalesce(p_activo, true))
    );
  else
    update areas
       set nombre = v_nombre,
           tipo = coalesce(p_tipo, tipo),
           activo = coalesce(p_activo, activo)
     where id = v_antes.id;

    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'areas', v_antes.id::text, p_pagina,
      'Editó el área ' || v_nombre,
      jsonb_build_object('codigo', v_antes.codigo, 'nombre', v_antes.nombre, 'tipo', v_antes.tipo, 'activo', v_antes.activo),
      jsonb_build_object('codigo', v_antes.codigo, 'nombre', v_nombre, 'tipo', coalesce(p_tipo, v_antes.tipo),
                         'activo', coalesce(p_activo, v_antes.activo))
    );
  end if;
end;
$$;

create or replace function guardar_puesto(
  p_usuario text,
  p_id uuid,
  p_area_codigo text,
  p_nombre text,
  p_nivel smallint,
  p_activo boolean,
  p_pagina text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_area areas%rowtype;
  v_antes puestos%rowtype;
  v_antes_area text;
  v_id uuid;
  v_base text;
  v_codigo text;
  v_i int := 1;
  v_rol uuid;
begin
  perform public.exigir_usuario('guardar_puesto', p_usuario);
  if not tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR') then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  if v_nombre = '' then
    raise exception 'Escribe el nombre del puesto.';
  end if;
  if p_nivel is null or p_nivel not between 1 and 4 then
    raise exception 'El nivel debe ser de 1 a 4.';
  end if;

  if p_id is not null then
    select * into v_antes from puestos where id = p_id;
    if v_antes.id is null then
      raise exception 'No se encontró ese puesto.';
    end if;
    if v_antes.todos_los_permisos then
      raise exception 'Este puesto no se edita.';
    end if;
    select codigo into v_antes_area from areas where id = v_antes.area_id;
    if p_area_codigo is distinct from v_antes_area then
      raise exception 'Un puesto no cambia de área.';
    end if;

    update puestos
       set nombre = v_nombre, nivel = p_nivel, activo = coalesce(p_activo, activo)
     where id = p_id;

    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'puestos', p_id::text, p_pagina,
      'Editó el puesto ' || v_nombre,
      jsonb_build_object('nombre', v_antes.nombre, 'nivel', v_antes.nivel, 'activo', v_antes.activo, 'area', v_antes_area),
      jsonb_build_object('nombre', v_nombre, 'nivel', p_nivel, 'activo', coalesce(p_activo, v_antes.activo), 'area', v_antes_area)
    );
    return p_id;
  end if;

  select * into v_area from areas where codigo = upper(btrim(coalesce(p_area_codigo, '')));
  if v_area.id is null then
    raise exception 'No se encontró esa área.';
  end if;

  -- Código derivado del nombre, único.
  v_base := btrim(regexp_replace(
              upper(translate(lower(v_nombre), 'áéíóúüñ', 'aeiouun')),
              '[^A-Z0-9]+', '_', 'g'), '_');
  if v_base = '' then
    raise exception 'El nombre del puesto debe tener letras o números.';
  end if;
  v_codigo := v_base;
  while exists (select 1 from puestos where codigo = v_codigo) loop
    v_i := v_i + 1;
    v_codigo := v_base || '_' || v_i;
  end loop;

  -- Rol equivalente: el del puesto activo más cercano en nivel dentro de la misma área; si no hay, VISTA.
  select p.rol_equivalente_id into v_rol
    from puestos p
   where p.area_id = v_area.id and p.activo and not p.todos_los_permisos and p.nivel is not null
   order by abs(p.nivel - p_nivel), p.nivel
   limit 1;
  if v_rol is null then
    select id into v_rol from roles where codigo = 'VISTA';
  end if;

  insert into puestos (codigo, nombre, area_id, nivel, rol_equivalente_id, activo)
  values (v_codigo, v_nombre, v_area.id, p_nivel, v_rol, coalesce(p_activo, true))
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'puestos', v_id::text, p_pagina,
    'Creó el puesto ' || v_nombre || ' en ' || v_area.nombre, null,
    jsonb_build_object('codigo', v_codigo, 'nombre', v_nombre, 'nivel', p_nivel,
                       'activo', coalesce(p_activo, true), 'area', v_area.codigo)
  );
  return v_id;
end;
$$;

create or replace function guardar_permisos_puestos(
  p_usuario text,
  p_cambios jsonb,
  p_pagina text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_aplicados int := 0;
  v_puesto uuid;
  v_antes jsonb := '{}'::jsonb;
  v_despues text[];
  v_antes_arr text[];
  v_nombre text;
  v_existe boolean;
  v_ids uuid[];
begin
  perform public.exigir_usuario('guardar_permisos_puestos', p_usuario);
  if not tiene_permiso(p_usuario, 'ESTRUCTURA_GESTIONAR') then
    raise exception 'No tienes permiso para hacer esto.';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'Los cambios no son válidos.';
  end if;

  -- Validar todo antes de aplicar nada.
  for c in
    select (e ->> 'puesto_id') as puesto_id, (e ->> 'permiso') as permiso, (e ->> 'activo') as activo
      from jsonb_array_elements(p_cambios) e
  loop
    if c.puesto_id is null or c.permiso is null or c.activo is null
       or c.activo not in ('true', 'false') then
      raise exception 'Los cambios no son válidos.';
    end if;
    begin
      v_puesto := c.puesto_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Puesto no válido.';
    end;
    if not exists (select 1 from puestos where id = v_puesto) then
      raise exception 'No se encontró uno de los puestos.';
    end if;
    if exists (select 1 from puestos where id = v_puesto and todos_los_permisos) then
      raise exception 'Este puesto tiene todos los permisos y no se cambia.';
    end if;
    if not exists (select 1 from permisos where codigo = c.permiso) then
      raise exception 'No existe el permiso %.', c.permiso;
    end if;
  end loop;

  select array_agg(distinct (e ->> 'puesto_id')::uuid) into v_ids from jsonb_array_elements(p_cambios) e;

  -- Estado anterior de los puestos tocados.
  for v_puesto in select unnest(v_ids) loop
    v_antes := v_antes || jsonb_build_object(v_puesto::text, (
      select coalesce(jsonb_agg(pp.permiso_codigo order by pp.permiso_codigo), '[]'::jsonb)
        from puesto_permisos pp where pp.puesto_id = v_puesto));
  end loop;

  -- Aplicar en orden; un cambio que no cambia nada no cuenta.
  for c in
    select (e ->> 'puesto_id')::uuid as puesto_id, e ->> 'permiso' as permiso, (e ->> 'activo')::boolean as activo
      from jsonb_array_elements(p_cambios) e
  loop
    v_existe := exists (select 1 from puesto_permisos where puesto_id = c.puesto_id and permiso_codigo = c.permiso);
    if c.activo and not v_existe then
      insert into puesto_permisos (puesto_id, permiso_codigo) values (c.puesto_id, c.permiso);
      v_aplicados := v_aplicados + 1;
    elsif not c.activo and v_existe then
      delete from puesto_permisos where puesto_id = c.puesto_id and permiso_codigo = c.permiso;
      v_aplicados := v_aplicados + 1;
    end if;
  end loop;

  -- Una auditoría por puesto que quedó distinto.
  for v_puesto in select unnest(v_ids) loop
    select coalesce(array_agg(pp.permiso_codigo order by pp.permiso_codigo), '{}') into v_despues
      from puesto_permisos pp where pp.puesto_id = v_puesto;
    select coalesce(array_agg(x order by x), '{}') into v_antes_arr
      from jsonb_array_elements_text(v_antes -> v_puesto::text) x;
    if v_antes_arr is distinct from v_despues then
      select nombre into v_nombre from puestos where id = v_puesto;
      perform registrar_auditoria(
        p_usuario, 'EDITAR', 'puestos', v_puesto::text, p_pagina,
        'Cambió los permisos del puesto ' || v_nombre,
        jsonb_build_object('permisos', to_jsonb(v_antes_arr)),
        jsonb_build_object('permisos', to_jsonb(v_despues))
      );
    end if;
  end loop;

  return v_aplicados;
end;
$$;

grant execute on function listar_estructura(text) to anon, authenticated;
grant execute on function guardar_area(text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function guardar_puesto(text, uuid, text, text, smallint, boolean, text) to anon, authenticated;
grant execute on function guardar_permisos_puestos(text, jsonb, text) to anon, authenticated;
