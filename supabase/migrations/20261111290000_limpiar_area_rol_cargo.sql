-- ============================================================
-- LIMPIAR ÁREA / ROL / CARGO
-- ============================================================
-- Dueña, 2026-10-20. Cada capa con un solo trabajo:
--   * ÁREA  = dónde trabaja (de qué datos es).
--   * ROL   = todo lo que puede hacer.
--   * CARGO = solo el nombre del puesto: ya no decide nada.
--   * Super Administrador = solo técnicos y la dueña.
--
-- 1. Rol nuevo SERVICIOS_INDUSTRIALES (sin permisos: el rol mismo abre
--    sus dos tarjetas). Antes usaban SUPERVISOR y el área les escondía
--    lo de producción, pero el servidor les dejaba tocar turnos.
-- 2. Jefe de Producción y Analista: el mismo paquete (todos los
--    permisos), salvo VALIDAR, que es solo de la Analista.
-- 3. Mueve a las personas:
--    - Super Admin con cargo Jefe / Analista de Producción (no la dueña)
--      → su rol, en Aséptico.
--    - Quien esté en el área Servicios Industriales → rol Servicios Industriales.
--    - Sistema de Gestión → Solo Vista, y se borra el rol GESTION.
-- 4. Lo que era solo del Super Admin pasa a un permiso: mis_actas (todas
--    con AUDITORIA_VER), guardar_permisos_extra (PERSONAL_GESTIONAR).
--    puede_sincronizar_sheet_mtto ya no mira el área.
-- 5. guardar_indicadores_mes: rol ANALISTA o dueña, sin mirar el cargo.
-- 6. registrar_lectura_servicios_industriales exige el rol (antes nada).
-- 7. Trigger rol ↔ área: Calidad y Servicios Industriales solo con sus
--    roles; Otros solo con Solo Vista.
--
-- Ensayo ANTES de aplicar: scripts/ensayo-20261111290000-area-rol-cargo.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rol Servicios Industriales
-- ------------------------------------------------------------
insert into roles (codigo, nombre) values ('SERVICIOS_INDUSTRIALES', 'Servicios Industriales')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 2. Jefe y Analista: mismo paquete. VALIDAR solo la Analista.
-- ------------------------------------------------------------
insert into rol_permisos (rol_id, permiso_codigo)
select r.id, p.codigo
from roles r
cross join permisos p
where r.codigo in ('JEFE_PRODUCCION', 'ANALISTA')
  and not (r.codigo = 'JEFE_PRODUCCION' and p.codigo = 'VALIDAR')
on conflict do nothing;

delete from rol_permisos
where permiso_codigo = 'VALIDAR'
  and rol_id = (select id from roles where codigo = 'JEFE_PRODUCCION');

-- ------------------------------------------------------------
-- 3. Mover personas (queda en Auditoría)
-- ------------------------------------------------------------
drop table if exists limpiar_rol_cambios;
create temporary table limpiar_rol_cambios as
select u.id as usuario_id, u.nombre,
       r.codigo as rol_antes, a.codigo as area_antes,
       case
         when r.codigo = 'SUPERADMINISTRADOR' and u.cargo = 'JEFE_PRODUCCION' then 'JEFE_PRODUCCION'
         when r.codigo = 'SUPERADMINISTRADOR' and u.cargo = 'ANALISTA_PRODUCCION' then 'ANALISTA'
         when r.codigo = 'GESTION' then 'VISTA'
         else 'SERVICIOS_INDUSTRIALES'
       end as rol_despues,
       case when r.codigo = 'SUPERADMINISTRADOR' then 'ASEPTICO' else a.codigo end as area_despues
from usuarios u
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.rol_id
left join areas a on a.id = ur.area_id
where u.usuario <> 'sistema'
  and (
    (r.codigo = 'SUPERADMINISTRADOR' and not coalesce(u.ve_errores, false)
       and u.cargo in ('JEFE_PRODUCCION', 'ANALISTA_PRODUCCION'))
    or r.codigo = 'GESTION'
    or (a.codigo = 'SERVICIOS_INDUSTRIALES' and r.codigo not in ('SUPERADMINISTRADOR', 'SERVICIOS_INDUSTRIALES'))
  );

update usuario_roles ur
set rol_id = (select id from roles where codigo = c.rol_despues),
    area_id = (select id from areas where codigo = c.area_despues)
from limpiar_rol_cambios c
where ur.usuario_id = c.usuario_id;

insert into auditoria (usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
select (select id from usuarios where usuario = 'sistema'), 'sistema', 'EDITAR', 'personal', c.usuario_id::text,
       'Limpieza de roles (20261111290000)',
       format('Rol de %s: %s → %s', c.nombre, ra.nombre, rd.nombre),
       jsonb_build_object('rol', c.rol_antes, 'area', c.area_antes),
       jsonb_build_object('rol', c.rol_despues, 'area', c.area_despues)
from limpiar_rol_cambios c
join roles ra on ra.codigo = c.rol_antes
join roles rd on rd.codigo = c.rol_despues;

drop table limpiar_rol_cambios;

-- Sistema de Gestión ya no existe (sus rol_permisos se van en cascada).
delete from roles where codigo = 'GESTION';

-- ------------------------------------------------------------
-- 4. De Super Admin a permiso
-- ------------------------------------------------------------
-- Copia de 20261109290000: ve todas quien ve Auditoría (y la dueña).
create or replace function mis_actas(p_usuario text, p_limite integer default 300)
returns table (
  acta_id uuid,
  turno_id uuid,
  codigo text,
  storage_path text,
  generado_en timestamptz,
  turno_codigo text,
  fecha date,
  turno_tipo_codigo text,
  grupo_codigo text,
  supervisor_nombre text,
  area_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_todas boolean := coalesce(tiene_permiso(p_usuario, 'AUDITORIA_VER'), false)
    or coalesce(es_dueno(p_usuario), false);
begin
  return query
  select ac.id, ac.turno_id, ac.codigo, ac.storage_path, ac.generado_en,
         t.codigo, t.fecha, tt.codigo, g.codigo, u.nombre, a.nombre
  from actas ac
  join turnos t on t.id = ac.turno_id
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where (v_todas or u.usuario = lower(p_usuario))
    and ac.estado = 'VIGENTE'
    and a.codigo <> 'PRUEBAS'
  order by ac.generado_en desc
  limit p_limite;
end;
$$;

-- Copia de 20261078090000: quien gestiona personal da permisos extra (no a sí mismo).
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
  if not puede_gestionar_personal(p_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para dar permisos extra a esta persona.';
  end if;

  select id into v_otorgante from usuarios where usuario = lower(p_usuario);
  if v_otorgante = p_usuario_id then
    raise exception 'No puedes cambiar tus propios permisos extra.';
  end if;
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

-- Copia de 20261108490000, sin mirar el área: el rol Mantenimiento ya trae PARADAS_MANTENIMIENTO.
create or replace function puede_sincronizar_sheet_mtto(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'PARADAS_REGISTRAR')
    or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO');
$$;

-- ------------------------------------------------------------
-- 5. Indicadores: rol Analista o dueña (el cargo ya no cuenta)
-- ------------------------------------------------------------
-- Copia de 20261110690000; único cambio, el control de quién puede.
create or replace function guardar_indicadores_mes(p_usuario text, p_area_codigo text, p_mes date, p_modo text, p_datos jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_mes date := date_trunc('month', p_mes)::date;
  v_antes indicadores_mes;
begin
  -- Solo la Analista y la dueña cambian el modo o cargan datos (dueña, 2026-10-14).
  if not (coalesce((select rol_codigo from rol_y_area_de(p_usuario)) = 'ANALISTA', false)
          or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'Solo la analista carga los datos de Indicadores.';
  end if;
  if p_modo not in ('AUTO', 'MANUAL') then
    raise exception 'Modo inválido: %', p_modo;
  end if;
  if p_datos is not null and jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del mes no tienen la forma esperada.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'No se encontró el área %.', p_area_codigo;
  end if;

  select * into v_antes from indicadores_mes where area_id = v_area_id and mes = v_mes;
  insert into indicadores_mes (area_id, mes, modo, datos, actualizado_por, actualizado_en)
  values (v_area_id, v_mes, p_modo, p_datos, (select id from usuarios where usuario = lower(p_usuario)), now())
  on conflict (area_id, mes) do update
    set modo = excluded.modo,
        datos = coalesce(excluded.datos, indicadores_mes.datos),
        actualizado_por = excluded.actualizado_por,
        actualizado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'indicadores_mes', format('%s %s', p_area_codigo, to_char(v_mes, 'YYYY-MM')), 'Indicadores',
    case when p_datos is null then format('%s: modo %s', to_char(v_mes, 'MM/YYYY'), p_modo)
         else format('%s: cargó los datos a mano', to_char(v_mes, 'MM/YYYY')) end,
    case when v_antes.mes is null then null else jsonb_build_object('modo', v_antes.modo, 'datos', v_antes.datos) end,
    jsonb_strip_nulls(jsonb_build_object('modo', p_modo, 'datos', p_datos))
  );
end;
$$;

-- ------------------------------------------------------------
-- 6. Servicios Industriales: solo su rol carga (o Super Admin, o Pruebas)
-- ------------------------------------------------------------
-- Copia de 20261057090000 con el control de quién puede.
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
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if coalesce(v_rol, '') not in ('SERVICIOS_INDUSTRIALES', 'SUPERADMINISTRADOR') and v_area is distinct from 'PRUEBAS' then
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

-- ------------------------------------------------------------
-- 7. Rol ↔ área (mismo criterio que rolPermitidoEnArea en src/lib/catalogos.ts)
-- ------------------------------------------------------------
-- Copia de 20261089090000 + Servicios Industriales y Otros. El trigger
-- trg_rol_area_calidad sigue igual (solo cambia la función).
create or replace function fn_rol_area_calidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select codigo into v_rol from roles where id = new.rol_id;
  select codigo into v_area from areas where id = new.area_id;

  if v_area = 'CALIDAD' and v_rol not in ('CALIDAD', 'SUPERVISOR_CALIDAD') then
    raise exception 'En el área Calidad solo puede haber Analista de Calidad o Supervisor de Calidad.';
  end if;
  if v_rol in ('CALIDAD', 'SUPERVISOR_CALIDAD') and coalesce(v_area, '') not in ('CALIDAD', 'PRUEBAS') then
    raise exception 'El Analista y el Supervisor de Calidad van en el área Calidad (o en Pruebas para probar).';
  end if;
  if v_area = 'SERVICIOS_INDUSTRIALES' and v_rol <> 'SERVICIOS_INDUSTRIALES' then
    raise exception 'En el área Servicios Industriales solo va el rol Servicios Industriales.';
  end if;
  if v_rol = 'SERVICIOS_INDUSTRIALES' and coalesce(v_area, '') not in ('SERVICIOS_INDUSTRIALES', 'PRUEBAS') then
    raise exception 'El rol Servicios Industriales va en su área (o en Pruebas para probar).';
  end if;
  if v_area = 'OTROS' and v_rol <> 'VISTA' then
    raise exception 'En el área Otros solo va Solo Vista.';
  end if;
  return new;
end;
$$;

select * from asegurar_control_usuario();
