-- ============================================================
-- ROLES Y PERMISOS: rol base + permisos extra por usuario
-- ============================================================
-- Rework 2026-09-27. Se separan tres cosas que antes se mezclaban:
--   * ÁREA: dónde trabaja la persona y qué datos ve (sin cambios).
--   * ROL: paquete de permisos por defecto (rol_permisos).
--   * PERMISO: acción concreta. Un usuario puede tener permisos extra
--     además de los de su rol (usuario_permisos). Así el SubJefe es un
--     SUPERVISOR con permisos de jefe, sin inventar un rol aparte.
-- SUPERADMINISTRADOR (técnicos) tiene todos los permisos siempre.
-- El cargo sigue siendo solo visual. ve_errores sigue siendo un flag aparte.
--
-- Roles nuevos: ANALISTA, JEFE_PRODUCCION, MANTENIMIENTO. A nadie se le
-- cambia el rol acá: se reasigna desde Personal.
--
-- Las funciones que exigían SUPERADMINISTRADOR pasan a exigir su permiso.
-- Se copian desde su última versión (indicada arriba de cada una) y solo
-- cambia la validación del rol. Quedan solo para SUPERADMINISTRADOR:
-- eliminar_turno, crear_turno_manual, agregar/editar_fila_turno_manual y
-- guardar_configuracion.
-- ============================================================

insert into roles (codigo, nombre) values
  ('ANALISTA', 'Analista de Producción'),
  ('JEFE_PRODUCCION', 'Jefe de Producción'),
  ('MANTENIMIENTO', 'Mantenimiento')
on conflict (codigo) do nothing;

create table permisos (
  codigo text primary key,
  nombre text not null
);

create table rol_permisos (
  rol_id uuid not null references roles (id) on delete cascade,
  permiso_codigo text not null references permisos (codigo) on delete cascade,
  primary key (rol_id, permiso_codigo)
);

create table usuario_permisos (
  usuario_id uuid not null references usuarios (id) on delete cascade,
  permiso_codigo text not null references permisos (codigo) on delete cascade,
  otorgado_por uuid references usuarios (id),
  created_at timestamptz not null default now(),
  primary key (usuario_id, permiso_codigo)
);

alter table permisos enable row level security;
alter table rol_permisos enable row level security;
alter table usuario_permisos enable row level security;

insert into permisos (codigo, nombre) values
  ('TURNO_ASUMIR', 'Asumir turno'),
  ('TURNO_CARGAR', 'Cargar Preparación, Líneas y Producto Terminado'),
  ('PARADAS_REGISTRAR', 'Registrar paradas'),
  ('PARADAS_MANTENIMIENTO', 'Registrar paradas de Mantenimiento'),
  ('TURNO_CORREGIR', 'Corregir turno cerrado'),
  ('AUDITORIA_VER', 'Ver Auditoría'),
  ('VALIDAR', 'Validar producción'),
  ('PERSONAL_GESTIONAR', 'Gestionar personal'),
  ('PROGRAMACION_EDITAR', 'Editar Programación'),
  ('CATALOGO_PARADAS', 'Editar Catálogo de Paradas'),
  ('EDICION_DATOS', 'Edición de Datos'),
  ('CALCULADORAS', 'Calculadoras'),
  ('ESQUEMA_TURNOS', 'Cambiar esquema de turnos (3x8 / 12x12)');

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, v.permiso
from roles r
join (values
  ('SUPERVISOR', 'TURNO_ASUMIR'),
  ('SUPERVISOR', 'TURNO_CARGAR'),
  ('SUPERVISOR', 'PARADAS_REGISTRAR'),
  ('ANALISTA', 'TURNO_ASUMIR'),
  ('ANALISTA', 'TURNO_CARGAR'),
  ('ANALISTA', 'PARADAS_REGISTRAR'),
  ('ANALISTA', 'AUDITORIA_VER'),
  ('ANALISTA', 'VALIDAR'),
  ('JEFE_PRODUCCION', 'TURNO_ASUMIR'),
  ('JEFE_PRODUCCION', 'TURNO_CARGAR'),
  ('JEFE_PRODUCCION', 'PARADAS_REGISTRAR'),
  ('JEFE_PRODUCCION', 'TURNO_CORREGIR'),
  ('JEFE_PRODUCCION', 'AUDITORIA_VER'),
  ('JEFE_PRODUCCION', 'VALIDAR'),
  ('JEFE_PRODUCCION', 'PERSONAL_GESTIONAR'),
  ('JEFE_PRODUCCION', 'PROGRAMACION_EDITAR'),
  ('JEFE_PRODUCCION', 'CALCULADORAS'),
  ('JEFE_PRODUCCION', 'ESQUEMA_TURNOS'),
  ('MANTENIMIENTO', 'PARADAS_MANTENIMIENTO')
) as v (rol, permiso) on v.rol = r.codigo;

-- ------------------------------------------------------------
-- tiene_permiso(): la única pregunta que hacen las RPC.
-- ------------------------------------------------------------
create or replace function tiene_permiso(p_usuario text, p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from usuarios u
    join usuario_roles ur on ur.usuario_id = u.id
    join roles r on r.id = ur.rol_id
    where u.usuario = lower(p_usuario)
      and u.activo
      and (
        r.codigo = 'SUPERADMINISTRADOR'
        or exists (select 1 from rol_permisos rp where rp.rol_id = r.id and rp.permiso_codigo = p_permiso)
        or exists (select 1 from usuario_permisos up where up.usuario_id = u.id and up.permiso_codigo = p_permiso)
      )
  );
$$;

grant execute on function tiene_permiso(text, text) to anon, authenticated;

-- Permisos efectivos de la sesión (rol + extras), para mostrar/ocultar en el front.
create or replace function permisos_de(p_usuario text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(p.codigo order by p.codigo), '{}')
  from permisos p
  where tiene_permiso(p_usuario, p.codigo);
$$;

grant execute on function permisos_de(text) to anon, authenticated;

-- Catálogo de permisos y el paquete de cada rol (para la pantalla de Personal).
create or replace function listar_permisos_catalogo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'permisos', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre) order by nombre) from permisos), '[]'::jsonb),
    'por_rol', coalesce((
      select jsonb_object_agg(r.codigo, coalesce(
        (select jsonb_agg(rp.permiso_codigo order by rp.permiso_codigo) from rol_permisos rp where rp.rol_id = r.id),
        '[]'::jsonb
      ))
      from roles r
    ), '{}'::jsonb)
  );
$$;

grant execute on function listar_permisos_catalogo() to anon, authenticated;

-- Permisos extra de todo el personal (quien gestiona personal).
create or replace function listar_permisos_extra(p_usuario text)
returns table (usuario_id uuid, permiso_codigo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;
  return query select up.usuario_id, up.permiso_codigo from usuario_permisos up;
end;
$$;

grant execute on function listar_permisos_extra(text) to anon, authenticated;

-- Reemplaza los permisos extra de una persona. Solo SUPERADMINISTRADOR.
create or replace function guardar_permisos_extra(
  p_usuario text,
  p_usuario_id uuid,
  p_permisos text[],
  p_pagina text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otorgante uuid;
  v_antes text[];
  v_despues text[];
  v_nombre text;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'Solo un Super Administrador puede dar permisos extra.';
  end if;

  select id into v_otorgante from usuarios where usuario = lower(p_usuario);
  select nombre into v_nombre from usuarios where id = p_usuario_id;
  if v_nombre is null then
    raise exception 'No se encontró a esa persona.';
  end if;

  select coalesce(array_agg(up.permiso_codigo order by up.permiso_codigo), '{}') into v_antes
  from usuario_permisos up where up.usuario_id = p_usuario_id;

  delete from usuario_permisos up where up.usuario_id = p_usuario_id;
  insert into usuario_permisos (usuario_id, permiso_codigo, otorgado_por)
  select distinct p_usuario_id, x, v_otorgante
  from unnest(coalesce(p_permisos, '{}')) x
  join permisos p on p.codigo = x;

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

grant execute on function guardar_permisos_extra(text, uuid, text[], text) to anon, authenticated;

-- ------------------------------------------------------------
-- Personal: quien tenga PERSONAL_GESTIONAR gestiona a todos, menos a un
-- Super Administrador (a ese solo lo toca otro Super Administrador).
-- Lo usan editar/restablecer/desactivar/reactivar/eliminar personal.
-- ------------------------------------------------------------
create or replace function puede_gestionar_personal(p_creador_usuario text, p_usuario_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso(p_creador_usuario, 'PERSONAL_GESTIONAR') then
    return false;
  end if;
  if exists (
    select 1 from usuario_roles ur join roles r on r.id = ur.rol_id
    where ur.usuario_id = p_usuario_id and r.codigo = 'SUPERADMINISTRADOR'
  ) then
    return es_superadmin(p_creador_usuario);
  end if;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- Auditoría: ver historial, detalle, turnos activos, actas y registro de cambios → AUDITORIA_VER
-- ------------------------------------------------------------

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'AUDITORIA_VER') then
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

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'AUDITORIA_VER') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'AUDITORIA_VER') then
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

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'AUDITORIA_VER') then
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

-- Última versión: migrations\20260982090000_cargo_personal.sql
create or replace function listar_auditoria(
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
  if not tiene_permiso(p_usuario, 'AUDITORIA_VER') then
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

-- ------------------------------------------------------------
-- Corrección de turnos cerrados → TURNO_CORREGIR
-- ------------------------------------------------------------

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'TURNO_CORREGIR') then
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

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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
  if not tiene_permiso(p_usuario, 'TURNO_CORREGIR') then
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
-- Validar → VALIDAR (antes es_superadmin)
-- ------------------------------------------------------------

-- Última versión: migrations\20261062090000_validar_contador2_y_paradas.sql
create or replace function listar_validacion_produccion(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not tiene_permiso(p_usuario, 'VALIDAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_agg(fila order by fila ->> 'fecha' desc, fila ->> 'supervisor_nombre', fila ->> 'turno_codigo', fila ->> 'linea'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'turno_linea_id', tl.id,
      'turno_codigo', t.codigo,
      'fecha', t.fecha,
      'supervisor_nombre', su.nombre,
      'area_nombre', ar.nombre,
      'linea', ln.nombre,
      'presentacion', coalesce(p.volumen_ml::text || ' ml', '—'),
      'sabor', sabor_display(s.nombre, f.nombre),
      'lote', tl.lote,
      'sin_pt', (pt.turno_linea_id is null),
      'cierre_automatico', coalesce(t.cierre_automatico, false),
      'datos_presentacion', jsonb_build_object(
        'cajas_x_paleta', coalesce(pt.cajas_x_paleta, p.cajas_x_paleta),
        'envases_x_caja', p.envases_x_caja,
        'litros_x_caja', p.litros_x_caja,
        'volumen_ml', p.volumen_ml
      ),
      'supervisor', jsonb_build_object(
        'paletas', coalesce(pt.paletas, 0),
        'cajas_sueltas', coalesce(pt.cajas_sueltas, 0),
        'cajas', coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0),
        'envases_llenadora', coalesce(cont.llenadora, 0),
        'envases_buenos', cont.buenos,
        'litros_producidos', round(coalesce(pt.litros_producidos, 0)),
        'litros_consumidos', round(coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) / 1000.0),
        'merma_envases_pct', case
          when coalesce(cont.llenadora, 0) > 0 then round(
            (1 - ((coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0))
                  * coalesce(p.envases_x_caja, 0))::numeric / cont.llenadora) * 100, 1)
          end,
        'merma_semielaborado_pct', case
          when coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) > 0 then round(
            (1 - coalesce(pt.litros_producidos, 0) / (cont.llenadora * p.volumen_ml / 1000.0)) * 100, 1)
          end
      ),
      'estado', coalesce(v.estado, 'PENDIENTE'),
      'overrides', case when v.estado = 'EDITADO' then jsonb_strip_nulls(jsonb_build_object(
          'paletas', v.paletas,
          'cajasSueltas', v.cajas_sueltas,
          'envasesLlenadora', v.envases_llenadora,
          'envasesBuenos', v.envases_buenos,
          'litrosConsumidos', v.litros_consumidos,
          'lote', v.lote,
          'mermaEnvasesPct', v.merma_envases_pct,
          'mermaSemielaboradoPct', v.merma_semielaborado_pct,
          'nota', v.nota
        )) else null end,
      'validado_por_nombre', vu.nombre,
      'validado_en', v.validado_en
    ) as fila
    from turno_lineas tl
    join turnos t on t.id = tl.turno_id and t.estado = 'CERRADO'
    join areas ar on ar.id = t.area_id and ar.codigo <> 'PRUEBAS'
    join usuarios su on su.id = t.supervisor_id
    join lineas ln on ln.id = tl.linea_id
    left join presentaciones p on p.id = tl.presentacion_id
    left join sabores s on s.id = tl.sabor_id
    left join familias_producto f on f.id = s.familia_id
    left join producto_terminado pt on pt.turno_linea_id = tl.id
    left join lateral (
      select sum(c.envases_llenadora) as llenadora,
             sum(c.envases_buenos) as buenos
      from contadores c
      where c.turno_linea_id = tl.id
    ) cont on true
    left join validacion_produccion v on v.turno_linea_id = tl.id
    left join usuarios vu on vu.id = v.validado_por
    where t.fecha >= date '2026-09-02'
      and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
      and (pt.turno_linea_id is not null or cont.llenadora is not null or coalesce(t.cierre_automatico, false))
  ) x;

  return v_result;
end;
$$;

-- Última versión: migrations\20261005090000_validacion_produccion.sql
create or replace function confirmar_produccion(p_usuario text, p_turno_linea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
begin
  if not tiene_permiso(p_usuario, 'VALIDAR') then
    raise exception 'No tienes permiso para validar producción.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select turno_id into v_turno_id from turno_lineas where id = p_turno_linea_id;
  if v_turno_id is null then
    raise exception 'Esa corrida no existe.';
  end if;

  insert into validacion_produccion (turno_linea_id, turno_id, estado, validado_por, validado_en)
  values (p_turno_linea_id, v_turno_id, 'CONFIRMADO', v_usuario_id, now())
  on conflict (turno_linea_id) do update
    set estado = 'CONFIRMADO',
        paletas = null, cajas_sueltas = null, envases_llenadora = null, litros_consumidos = null,
        lote = null, merma_envases_pct = null, merma_semielaborado_pct = null, nota = null,
        validado_por = v_usuario_id, validado_en = now();
end;
$$;

-- Última versión: migrations\20261062090000_validar_contador2_y_paradas.sql
create or replace function editar_produccion_validada(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer default null,
  p_cajas_sueltas integer default null,
  p_envases_llenadora integer default null,
  p_litros_consumidos numeric default null,
  p_lote text default null,
  p_merma_envases_pct numeric default null,
  p_merma_semielaborado_pct numeric default null,
  p_nota text default null,
  p_envases_buenos integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
  v_antes validacion_produccion;
  v_codigo text;
begin
  if not tiene_permiso(p_usuario, 'VALIDAR') then
    raise exception 'No tienes permiso para validar producción.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select turno_id into v_turno_id from turno_lineas where id = p_turno_linea_id;
  if v_turno_id is null then
    raise exception 'Esa corrida no existe.';
  end if;
  select codigo into v_codigo from turnos where id = v_turno_id;

  if p_envases_buenos is not null and p_envases_buenos < 0 then
    raise exception 'El Contador 2 no puede ser negativo.';
  end if;

  select * into v_antes from validacion_produccion where turno_linea_id = p_turno_linea_id;

  insert into validacion_produccion (
    turno_linea_id, turno_id, estado,
    paletas, cajas_sueltas, envases_llenadora, envases_buenos, litros_consumidos, lote,
    merma_envases_pct, merma_semielaborado_pct, nota,
    validado_por, validado_en
  )
  values (
    p_turno_linea_id, v_turno_id, 'EDITADO',
    p_paletas, p_cajas_sueltas, p_envases_llenadora, p_envases_buenos, p_litros_consumidos, nullif(trim(coalesce(p_lote, '')), ''),
    p_merma_envases_pct, p_merma_semielaborado_pct, nullif(trim(coalesce(p_nota, '')), ''),
    v_usuario_id, now()
  )
  on conflict (turno_linea_id) do update
    set estado = 'EDITADO',
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        envases_llenadora = excluded.envases_llenadora,
        envases_buenos = excluded.envases_buenos,
        litros_consumidos = excluded.litros_consumidos,
        lote = excluded.lote,
        merma_envases_pct = excluded.merma_envases_pct,
        merma_semielaborado_pct = excluded.merma_semielaborado_pct,
        nota = excluded.nota,
        validado_por = v_usuario_id, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_produccion', p_turno_linea_id::text, 'Validar',
    format('Corrigió la producción validada del turno %s', v_codigo),
    case when v_antes.turno_linea_id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'estado', v_antes.estado, 'paletas', v_antes.paletas, 'cajas_sueltas', v_antes.cajas_sueltas,
      'envases_llenadora', v_antes.envases_llenadora, 'envases_buenos', v_antes.envases_buenos,
      'litros_consumidos', v_antes.litros_consumidos, 'lote', v_antes.lote,
      'merma_envases_pct', v_antes.merma_envases_pct, 'merma_semielaborado_pct', v_antes.merma_semielaborado_pct)) end,
    jsonb_strip_nulls(jsonb_build_object(
      'estado', 'EDITADO', 'paletas', p_paletas, 'cajas_sueltas', p_cajas_sueltas,
      'envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
      'litros_consumidos', p_litros_consumidos, 'lote', p_lote,
      'merma_envases_pct', p_merma_envases_pct, 'merma_semielaborado_pct', p_merma_semielaborado_pct,
      'nota', p_nota))
  );
end;
$$;

-- Última versión: migrations\20261066090000_paradas_mantenimiento_sync.sql
create or replace function paradas_de_turnos(p_usuario text, p_codigos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not tiene_permiso(p_usuario, 'VALIDAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_object_agg(x.codigo, x.paradas), '{}'::jsonb)
  into v_result
  from (
    select t.codigo,
           jsonb_agg(jsonb_build_object(
             'linea', l.nombre,
             'clase', e.clase,
             'tipo', e.tipo_nombre,
             'minutos', greatest(0, round(extract(epoch from (coalesce(e.fin, now()) - e.inicio)) / 60)),
             'guia', e.tiempo_guia_min,
             'nota', e.nota,
             'justificacion', e.justificacion_desvio
           ) order by l.nombre, e.inicio) as paradas
    from turnos t
    cross join lateral paradas_efectivas_turno(t.id) e
    join lineas l on l.id = e.linea_id
    where t.codigo = any(p_codigos)
    group by t.codigo
  ) x;

  return v_result;
end;
$$;

-- Última versión: migrations\20261031090000_volumen_vivo_tanque_fuente_unica.sql
create or replace function tanques_de_turnos(p_usuario text, p_codigos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not tiene_permiso(p_usuario, 'VALIDAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_object_agg(t.codigo, jsonb_build_object(
    'turnoCodigo', t.codigo,
    'recibidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', (e ->> 'numero_tanque')::int,
        'condicion', e ->> 'condicion',
        'sabor', e ->> 'sabor_nombre',
        'lote', e ->> 'lote',
        'volumenL', (e ->> 'volumen_l')::numeric
      ) order by (e ->> 'numero_tanque')::int)
      from jsonb_array_elements(coalesce(t.tanques_encontrados, '[]'::jsonb)) e
    ), '[]'::jsonb),
    'dejados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', rt.numero_tanque,
        'condicion', rt.condicion,
        'sabor', sabor_display(s.nombre, f.nombre),
        'lote', rt.lote,
        'volumenL', volumen_vivo_tanque(t.id, rt.numero_tanque)
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto f on f.id = s.familia_id
      where rt.turno_id = t.id
    ), '[]'::jsonb)
  )), '{}'::jsonb)
  into v_result
  from turnos t
  where t.codigo = any(p_codigos);

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- Personal → PERSONAL_GESTIONAR (el rol Super Administrador solo lo da otro Super Administrador)
-- ------------------------------------------------------------

-- Última versión: migrations\20261077090000_fix_listar_personal_ambiguo.sql
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
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);

  if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
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

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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

  if p_rol_codigo = 'SUPERADMINISTRADOR' and not es_superadmin(p_creador_usuario) then
    raise exception 'Solo un Super Administrador puede dar el rol Super Administrador.';
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

-- Última versión: migrations\20261076090000_rework_dos_roles.sql
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

  if p_rol_codigo = 'SUPERADMINISTRADOR' and not es_superadmin(p_creador_usuario) then
    raise exception 'Solo un Super Administrador puede dar el rol Super Administrador.';
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

-- ------------------------------------------------------------
-- Catálogo de Paradas → CATALOGO_PARADAS
-- ------------------------------------------------------------

-- Última versión: migrations\20261069090000_paradas_por_presentacion.sql
create or replace function guardar_parada_tipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_familia text,
  p_equipo_codigo text,
  p_tiempo_guia_min numeric,
  p_prefijo_planilla text,
  p_secuencia_planilla integer,
  p_codigo_con_linea boolean,
  p_lineas jsonb,
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
  v_clase text;
  v_familia text;
  v_equipo_id uuid;
  v_guia numeric;
  v_antes paradas_tipos;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_n integer;
  l jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not tiene_permiso(p_usuario, 'CATALOGO_PARADAS') then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if p_equipo_codigo is not null then
    select id into v_equipo_id from paradas_equipos where codigo = p_equipo_codigo;
    if v_equipo_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
  end if;
  -- La familia agrupa (Suministro, Equipo de Proceso, ...); una falla de equipo sin familia propia es 'EQUIPO'.
  v_familia := coalesce(p_familia, case when p_equipo_codigo is not null then 'EQUIPO' end);
  if v_familia is null then
    raise exception 'Elige la familia del tipo.';
  end if;

  v_clase := case v_familia when 'PROGRAMADA' then 'PROGRAMADA' when 'OCIOSO' then 'OCIOSO' else 'NO_PROGRAMADA' end;

  -- Solo la Programada tiene tiempo guía.
  v_guia := case when v_clase = 'PROGRAMADA' then p_tiempo_guia_min else null end;
  if v_guia is not null and v_guia <= 0 then
    raise exception 'El tiempo guía debe ser mayor que 0.';
  end if;

  if v_clase <> 'OCIOSO' and coalesce(trim(p_prefijo_planilla), '') = '' then
    raise exception 'El prefijo de planilla es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_tipos where codigo = v_codigo) then
      raise exception 'Ya existe un tipo con ese código interno.';
    end if;
    insert into paradas_tipos (codigo, nombre, clase, familia, equipo_id, tiempo_guia_min, prefijo_planilla,
                               secuencia_planilla, codigo_con_linea, orden)
    values (v_codigo, trim(p_nombre), v_clase, v_familia, v_equipo_id, v_guia,
            upper(trim(coalesce(p_prefijo_planilla, ''))), p_secuencia_planilla, coalesce(p_codigo_con_linea, true),
            (select coalesce(max(orden), 0) + 1 from paradas_tipos))
    returning id into v_id;
  else
    select * into v_antes from paradas_tipos where codigo = p_codigo_original;
    if not found then
      raise exception 'No se encontró el tipo de parada.';
    end if;
    v_id := v_antes.id;

    update paradas_tipos
    set nombre = trim(p_nombre),
        clase = v_clase,
        familia = v_familia,
        equipo_id = v_equipo_id,
        tiempo_guia_min = v_guia,
        prefijo_planilla = upper(trim(coalesce(p_prefijo_planilla, ''))),
        secuencia_planilla = p_secuencia_planilla,
        codigo_con_linea = coalesce(p_codigo_con_linea, true),
        updated_at = now()
    where id = v_id;
  end if;

  -- Líneas donde existe el tipo (vacío = todas).
  delete from paradas_tipos_lineas where tipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia, presentaciones)
    select v_id, ln.id, nullif(l ->> 'secuencia', '')::integer, presentaciones_de(l)
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;
  select count(*) into v_n from paradas_tipos_lineas where tipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_tipos', v_id::text, p_pagina,
    format('%s el tipo de parada «%s» (%s)', case when p_codigo_original is null then 'Creó' else 'Editó' end,
           trim(p_nombre), v_clase),
    case when v_antes.id is null then null else
      jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'familia', v_antes.familia,
                         'tiempo_guia_min', v_antes.tiempo_guia_min, 'prefijo_planilla', v_antes.prefijo_planilla,
                         'secuencia_planilla', v_antes.secuencia_planilla, 'codigo_con_linea', v_antes.codigo_con_linea)
    end,
    jsonb_build_object('nombre', trim(p_nombre), 'clase', v_clase, 'familia', v_familia, 'equipo', p_equipo_codigo,
                       'tiempo_guia_min', v_guia, 'prefijo_planilla', upper(trim(coalesce(p_prefijo_planilla, ''))),
                       'secuencia_planilla', p_secuencia_planilla, 'codigo_con_linea', coalesce(p_codigo_con_linea, true),
                       'lineas', v_n)
  );
end;
$$;

-- Última versión: migrations\20261069090000_paradas_por_presentacion.sql
create or replace function guardar_parada_equipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_lineas jsonb,
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
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes jsonb;
  v_n integer;
  l jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not tiene_permiso(p_usuario, 'CATALOGO_PARADAS') then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre del equipo es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_equipos where codigo = v_codigo or nombre = v_nombre) then
      raise exception 'Ya existe un equipo con ese nombre o código.';
    end if;
    insert into paradas_equipos (codigo, nombre, orden)
    values (v_codigo, v_nombre, (select coalesce(max(orden), 0) + 1 from paradas_equipos))
    returning id into v_id;
  else
    select id into v_id from paradas_equipos where codigo = p_codigo_original;
    if v_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
    if exists (select 1 from paradas_equipos where nombre = v_nombre and id <> v_id) then
      raise exception 'Ya existe un equipo con ese nombre.';
    end if;
    select jsonb_build_object('nombre', e.nombre,
             'lineas', (select count(*) from paradas_equipos_lineas x where x.equipo_id = e.id))
    into v_antes from paradas_equipos e where e.id = v_id;
    update paradas_equipos set nombre = v_nombre, updated_at = now() where id = v_id;
  end if;

  delete from paradas_equipos_lineas where equipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_equipos_lineas (equipo_id, linea_id, presentaciones)
    select v_id, ln.id, presentaciones_de(l)
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;

  select count(*) into v_n from paradas_equipos_lineas where equipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_equipos', v_id::text, p_pagina,
    format('%s el equipo «%s» (%s líneas)', case when p_codigo_original is null then 'Creó' else 'Editó' end, v_nombre, v_n),
    v_antes,
    jsonb_build_object('nombre', v_nombre, 'lineas', v_n)
  );
end;
$$;

-- Última versión: migrations\20261061090000_paradas_base.sql
create or replace function cambiar_activo_parada_tipo(
  p_usuario text,
  p_codigo text,
  p_activo boolean,
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
  v_tipo paradas_tipos;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not tiene_permiso(p_usuario, 'CATALOGO_PARADAS') then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_codigo;
  if not found then
    raise exception 'No se encontró el tipo de parada.';
  end if;
  if v_tipo.activo = p_activo then
    return;
  end if;

  update paradas_tipos set activo = p_activo, updated_at = now() where id = v_tipo.id;

  perform registrar_auditoria(
    p_usuario, case when p_activo then 'ACTIVAR' else 'DESACTIVAR' end, 'paradas_tipos', v_tipo.id::text, p_pagina,
    format('%s el tipo de parada «%s»', case when p_activo then 'Activó' else 'Desactivó' end, v_tipo.nombre),
    jsonb_build_object('activo', v_tipo.activo),
    jsonb_build_object('activo', p_activo)
  );
end;
$$;

-- Última versión: migrations\20261063090000_paradas_equipos.sql
create or replace function cambiar_activo_parada_equipo(
  p_usuario text,
  p_codigo text,
  p_activo boolean,
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
  v_equipo paradas_equipos;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not tiene_permiso(p_usuario, 'CATALOGO_PARADAS') then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  select * into v_equipo from paradas_equipos where codigo = p_codigo;
  if not found then
    raise exception 'No se encontró el equipo.';
  end if;
  if v_equipo.activo = p_activo then
    return;
  end if;

  update paradas_equipos set activo = p_activo, updated_at = now() where id = v_equipo.id;

  perform registrar_auditoria(
    p_usuario, case when p_activo then 'ACTIVAR' else 'DESACTIVAR' end, 'paradas_equipos', v_equipo.id::text, p_pagina,
    format('%s el equipo «%s»', case when p_activo then 'Activó' else 'Desactivó' end, v_equipo.nombre),
    jsonb_build_object('activo', v_equipo.activo),
    jsonb_build_object('activo', p_activo)
  );
end;
$$;

-- ------------------------------------------------------------
-- Programación → PROGRAMACION_EDITAR
-- ------------------------------------------------------------

-- Última versión: migrations\20260981090000_auditoria_programacion.sql
create or replace function guardar_programacion_dia(
  p_usuario text,
  p_area_codigo text,
  p_fecha date,
  p_items jsonb,
  p_pagina text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
  v_usuario_id uuid;
  v_diff record;
  v_resumen text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not tiene_permiso(p_usuario, 'PROGRAMACION_EDITAR') then
    raise exception 'Solo el Super Administrador puede editar la programación.';
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_area_id is null then
    raise exception 'Área no encontrada.';
  end if;

  -- Diff (viejo vs. nuevo, clave = sabor + presentación). Un registro
  -- de auditoría por renglón que cambió; los sin cambios no generan nada.
  for v_diff in
    with nuevos as (
      select
        (elem ->> 'sabor_id')::uuid as sabor_id,
        (elem ->> 'presentacion_id')::uuid as presentacion_id,
        greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0) as cajas
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
    ),
    viejos as (
      select sabor_id, presentacion_id, cajas_plan as cajas
      from programacion_dia
      where area_id = v_area_id and fecha = p_fecha
    )
    select
      coalesce(n.sabor_id, v.sabor_id) as sabor_id,
      coalesce(n.presentacion_id, v.presentacion_id) as presentacion_id,
      case
        when v.sabor_id is null then 'CREAR'
        when n.sabor_id is null then 'ELIMINAR'
        else 'EDITAR'
      end as accion,
      v.cajas as cajas_antes,
      n.cajas as cajas_despues
    from nuevos n
    full outer join viejos v
      on v.sabor_id = n.sabor_id and v.presentacion_id = n.presentacion_id
    where v.sabor_id is null
       or n.sabor_id is null
       or n.cajas is distinct from v.cajas
  loop
    v_resumen := format(
      '%s · %s · %s %s ml: %s',
      p_area_codigo,
      p_fecha,
      coalesce((select sabor_display(s.nombre, f.nombre)
                from sabores s left join familias_producto f on f.id = s.familia_id
                where s.id = v_diff.sabor_id), '?'),
      coalesce((select volumen_ml from presentaciones where id = v_diff.presentacion_id)::text, '?'),
      case
        when v_diff.cajas_antes is null then v_diff.cajas_despues || ' cajas'
        when v_diff.cajas_despues is null then 'quitado (eran ' || v_diff.cajas_antes || ' cajas)'
        else v_diff.cajas_antes || ' → ' || v_diff.cajas_despues || ' cajas'
      end
    );

    perform registrar_auditoria(
      p_usuario, v_diff.accion, 'programacion_dia',
      p_area_codigo || '/' || p_fecha::text || '/' || v_diff.sabor_id::text || '/' || v_diff.presentacion_id::text,
      p_pagina,
      v_resumen,
      case when v_diff.cajas_antes is null then null else jsonb_build_object('cajas_plan', v_diff.cajas_antes) end,
      case when v_diff.cajas_despues is null then null else jsonb_build_object('cajas_plan', v_diff.cajas_despues) end
    );
  end loop;

  delete from programacion_dia pd
  where pd.area_id = v_area_id
    and pd.fecha = p_fecha
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
      where (elem ->> 'sabor_id')::uuid = pd.sabor_id
        and (elem ->> 'presentacion_id')::uuid = pd.presentacion_id
    );

  insert into programacion_dia (area_id, fecha, sabor_id, presentacion_id, cajas_plan, actualizada_por, actualizada_en)
  select
    v_area_id,
    p_fecha,
    (elem ->> 'sabor_id')::uuid,
    (elem ->> 'presentacion_id')::uuid,
    greatest(coalesce((elem ->> 'cajas_plan')::int, 0), 0),
    v_usuario_id,
    now()
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) elem
  on conflict (area_id, fecha, sabor_id, presentacion_id) do update
    set cajas_plan = excluded.cajas_plan,
        actualizada_por = excluded.actualizada_por,
        actualizada_en = excluded.actualizada_en;

  return programacion_dia_de(p_area_codigo, p_fecha);
end;
$$;
