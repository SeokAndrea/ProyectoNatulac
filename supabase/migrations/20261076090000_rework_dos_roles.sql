-- ============================================================
-- REWORK DE ROLES: de 4 a 2 (SUPERVISOR / SUPERADMINISTRADOR)
-- ============================================================
-- Decisión del dueño (2026-09-23): en la práctica solo se usan 2 roles —
-- nunca hubo gente real con ADMINISTRADOR_AREA ni MANTENIMIENTO. Se borran
-- del catálogo y se simplifican las funciones que los distinguían:
--   * Personal (alta/edición/baja) queda exclusivo de SUPERADMINISTRADOR,
--     de TODAS las áreas — se pierde el acotamiento "solo mi área" que
--     tenía ADMINISTRADOR_AREA.
--   * Auditoría (historial de turnos, detalle, turnos activos por área,
--     actas, corrección de Producto Terminado) igual: exclusivo de
--     SUPERADMINISTRADOR, sin acotar por área.
--   * registrar_parada(): SUPERADMINISTRADOR puede registrar paradas
--     igual que un SUPERVISOR, y en CUALQUIER turno abierto (no solo el
--     que él mismo inició).
-- MANTENIMIENTO como ÁREA no cambia — sigue existiendo, y las paradas de
-- Mantenimiento (área_de_paradas_mantenimiento, registrar_parada_mantenimiento)
-- ya se filtran por área, nunca usaron el rol MANTENIMIENTO.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Catálogo de roles: por seguridad, reasignar antes de borrar (el
--    dueño confirma que hoy nadie real tiene estos dos roles).
-- ------------------------------------------------------------
update usuario_roles set rol_id = (select id from roles where codigo = 'SUPERVISOR')
where rol_id in (select id from roles where codigo in ('ADMINISTRADOR_AREA', 'MANTENIMIENTO'));

delete from roles where codigo in ('ADMINISTRADOR_AREA', 'MANTENIMIENTO');

-- ------------------------------------------------------------
-- 1. Personal: puede_gestionar_personal() colapsa a "solo SUPERADMINISTRADOR".
-- ------------------------------------------------------------
create or replace function puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creador_rol text;
begin
  select rol_codigo into v_creador_rol from rol_y_area_de(p_creador_usuario);
  return v_creador_rol = 'SUPERADMINISTRADOR';
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
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);

  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, ao.codigo, u.cargo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  left join areas ao on ao.id = u.area_origen_id
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

  if v_creador_rol is distinct from 'SUPERADMINISTRADOR' then
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

-- ------------------------------------------------------------
-- 2. Auditoría: reabrir_turno / listar_turnos_historial / turno_detalle /
--    turnos_activos_por_area colapsan a "solo SUPERADMINISTRADOR", sin
--    acotar por área.
-- ------------------------------------------------------------
create or replace function reabrir_turno(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_turno turnos%rowtype;
  v_existe_mas_nuevo boolean;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para reabrir turnos.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if v_turno.id is null then
    raise exception 'Ese turno no existe.';
  end if;
  if v_turno.estado <> 'CERRADO' then
    raise exception 'Solo se puede reabrir un turno CERRADO.';
  end if;

  select exists(
    select 1 from turnos t2
    where t2.area_id = v_turno.area_id
      and t2.id <> p_turno_id
      and (t2.fecha, t2.hora_inicio) > (v_turno.fecha, v_turno.hora_inicio)
  ) into v_existe_mas_nuevo;

  if v_existe_mas_nuevo then
    raise exception 'Ya existe un turno más nuevo en esta área — no se puede reabrir este.';
  end if;

  update turnos set estado = 'ABIERTO' where id = p_turno_id;

  return turno_json(p_turno_id);
end;
$$;

create or replace function listar_turnos_historial(
  p_usuario text,
  p_supervisor_usuario text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_area_codigo text default null
)
returns table (
  turno_id uuid,
  codigo text,
  fecha date,
  hora_inicio time,
  estado text,
  supervisor_usuario text,
  supervisor_nombre text,
  area_codigo text,
  turno_tipo_codigo text,
  grupo_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select t.id, t.codigo, t.fecha, t.hora_inicio, t.estado, u.usuario, u.nombre, a.codigo, tt.codigo, g.codigo
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where (p_supervisor_usuario is null or p_supervisor_usuario = '' or u.usuario = lower(p_supervisor_usuario))
    and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc;
end;
$$;

create or replace function turno_detalle(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;

create or replace function turnos_activos_por_area(p_usuario text)
returns table (
  area_codigo text,
  area_nombre text,
  turno_id uuid,
  turno_codigo text,
  supervisor_nombre text,
  hora_inicio time
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select a.codigo, a.nombre, t.id, t.codigo, u.nombre, t.hora_inicio
  from areas a
  left join lateral (
    select * from turnos t2
    where t2.area_id = a.id and t2.estado = 'ABIERTO'
    order by t2.fecha desc, t2.hora_inicio desc
    limit 1
  ) t on true
  left join usuarios u on u.id = t.supervisor_id
  where a.codigo <> 'PRUEBAS'
  order by a.nombre;
end;
$$;

-- ------------------------------------------------------------
-- 3. listar_actas(): colapsa a "solo SUPERADMINISTRADOR", sin acotar por área.
-- ------------------------------------------------------------
create or replace function listar_actas(
  p_usuario text,
  p_area_codigo text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  acta_id uuid,
  turno_id uuid,
  version integer,
  codigo text,
  estado text,
  storage_path text,
  generado_en timestamptz,
  turno_codigo text,
  fecha date,
  supervisor_nombre text,
  area_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select ac.id, ac.turno_id, ac.version, ac.codigo, ac.estado, ac.storage_path, ac.generado_en,
         t.codigo, t.fecha, u.nombre, a.codigo
  from actas ac
  join turnos t on t.id = ac.turno_id
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by ac.generado_en desc;
end;
$$;

-- ------------------------------------------------------------
-- 4. corregir_producto_terminado_auditoria(): colapsa a "solo
--    SUPERADMINISTRADOR", sin acotar por área.
-- ------------------------------------------------------------
create or replace function corregir_producto_terminado_auditoria(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_pagina text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_usuario_id uuid;
  v_turno_id uuid;
  v_linea_codigo text;
  v_sabor_id uuid;
  v_volumen_ml integer;
  v_producto_retenido boolean;
  v_cajas_retenidas integer;
  v_pal_antes integer;
  v_caj_antes integer;
begin
  select rol_codigo into v_rol from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select pt.turno_id, l.codigo, pt.sabor_id, p.volumen_ml, pt.producto_retenido, pt.cajas_retenidas, pt.paletas, pt.cajas_sueltas
  into v_turno_id, v_linea_codigo, v_sabor_id, v_volumen_ml, v_producto_retenido, v_cajas_retenidas, v_pal_antes, v_caj_antes
  from producto_terminado pt
  join lineas l on l.id = pt.linea_id
  join presentaciones p on p.id = pt.presentacion_id
  where pt.turno_linea_id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'No se encontró Producto Terminado para esa corrida.';
  end if;

  perform registrar_producto_terminado(
    v_turno_id, p_turno_linea_id, v_linea_codigo, v_sabor_id, v_volumen_ml,
    p_paletas, p_cajas_sueltas, p_usuario, v_producto_retenido, v_cajas_retenidas, false, true, p_pagina, false
  );

  update producto_terminado
  set editado_por = v_usuario_id, editado_en = now()
  where turno_linea_id = p_turno_linea_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'producto_terminado', p_turno_linea_id::text, p_pagina,
    format('Corrigió Producto Terminado %s: %s→%s paletas, %s→%s cajas',
           v_linea_codigo, v_pal_antes, p_paletas, v_caj_antes, p_cajas_sueltas),
    jsonb_build_object('paletas', v_pal_antes, 'cajas_sueltas', v_caj_antes),
    jsonb_build_object('paletas', p_paletas, 'cajas_sueltas', p_cajas_sueltas)
  );

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 5. registrar_parada(): SUPERADMINISTRADOR registra igual que un
--    SUPERVISOR, y en cualquier turno abierto (no solo el que él inició).
-- ------------------------------------------------------------
create or replace function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_pagina text default 'Registrar Paradas'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno turnos;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_fin timestamptz := now();
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
  v_pres integer;
begin
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'La duración debe ser mayor que 0 minutos.';
  end if;
  if p_minutos > 1440 then
    raise exception 'La duración no puede superar 24 horas.';
  end if;

  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Supervisores y Super Administrador registran paradas (el Área de Pruebas también, para probar).
  if v_rol not in ('SUPERVISOR', 'SUPERADMINISTRADOR') and v_area is distinct from 'PRUEBAS' then
    raise exception 'Solo los supervisores o el Super Administrador pueden registrar paradas.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;
  -- El Super Administrador puede registrar en cualquier turno abierto, no solo el propio.
  if v_turno.supervisor_id is distinct from v_usuario_id and v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'Solo puedes registrar paradas en tu propio turno.';
  end if;

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_turno.area_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  -- Presentación (ml) que corre ahora en esa línea; sin corrida activa no se filtra por presentación.
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  if p_tipo_codigo is null then
    -- Ocioso de texto libre: sin tiempo guía.
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := null;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    -- El supervisor registra Programadas, Línea no programada (LNPE), Operacionales y Tiempo ocioso; lo demás lo registra Mantenimiento.
    if v_area is distinct from 'PRUEBAS' and v_tipo.familia not in ('PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'OCIOSO') then
      raise exception 'Ese tipo de parada lo registra Mantenimiento.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

    -- El tipo puede existir solo en algunas líneas de esta área (paradas_tipos_lineas).
    if v_area is distinct from 'PRUEBAS'
       and exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_turno.area_id
       )
       and not exists (
         select 1 from paradas_tipos_lineas
         where tipo_id = v_tipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa parada no aplica a esta línea.';
    end if;

    if v_tipo.equipo_id is not null then
      select * into v_equipo from paradas_equipos where id = v_tipo.equipo_id;
      if not v_equipo.activo then
        raise exception 'Ese equipo está desactivado.';
      end if;
      if v_area is distinct from 'PRUEBAS'
         and not exists (
           select 1 from paradas_equipos_lineas
           where equipo_id = v_equipo.id and linea_id = v_linea_id
             and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
         ) then
        raise exception 'Esa falla no aplica a esta línea.';
      end if;
      v_nombre := v_equipo.nombre || ' · ' || v_tipo.nombre;
    end if;

    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  -- Sin repetir por descuido: la misma parada (línea, tipo y minutos) cargada hace un momento.
  if exists (
    select 1 from paradas p
    where p.turno_id = p_turno_id and p.linea_id = v_linea_id and p.origen = 'MANUAL'
      and p.tipo_id is not distinct from v_tipo.id and p.tipo_nombre = v_nombre
      and round(extract(epoch from (p.fin - p.inicio)) / 60) = p_minutos
      and p.nota is not distinct from nullif(trim(coalesce(p_nota, '')), '')
      and p.created_at > now() - interval '3 minutes'
  ) then
    raise exception 'Esa parada ya se registró hace un momento.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min,
                       nota, justificacion_desvio, inicio, fin, creado_por)
  values (p_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''),
          case when v_clase = 'PROGRAMADA' then nullif(trim(coalesce(p_justificacion_desvio, '')), '') else null end,
          v_fin - make_interval(mins => p_minutos), v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Registró parada «%s» de %s min en %s (turno %s)', v_nombre, p_minutos,
           (select nombre from lineas where id = v_linea_id), v_turno.codigo),
    null,
    jsonb_build_object('turno_id', p_turno_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'minutos', p_minutos, 'tiempo_guia_min', v_guia, 'nota', p_nota,
                       'justificacion_desvio', p_justificacion_desvio)
  );

  return v_id;
end;
$$;
