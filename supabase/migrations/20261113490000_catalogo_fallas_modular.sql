-- ============================================================
-- CATÁLOGO DE FALLAS MODULAR: Equipo › Sistema › Subsistema › Falla
-- ============================================================
-- Spec: docs/superpowers/specs/2026-10-31-catalogo-fallas-modular-design.md
-- Un solo vocabulario para las fallas MECÁNICAS (familias EQUIPO y
-- EQUIPO_PROCESO), el mismo para Producción y Mantenimiento. Las demás
-- familias (PP, LNPE, OP, S…) siguen en paradas_tipos.
--
-- Cada nivel tiene un id fijo y un SUFIJO editable. El código de una falla
-- (CF-SUP-CAM-01) no se guarda: se arma al leer, así un cambio de sufijo se ve
-- en todos los reportes, viejos y nuevos. El número de falla es el siguiente
-- libre de su subsistema y nunca se reutiliza.
--
-- Esta migración NO cambia nada de lo que se usa hoy: solo crea el catálogo y
-- deja en paradas las dos columnas que usará la fase 2 (detrás del switch).
-- Editan: permiso CATALOGO_PARADAS (ya existía, sin dueño) → Jefe de
-- Producción; al jefe de Mantenimiento se le da por persona. Y la dueña.
-- Nada se borra, solo se desactiva; todo cambio va a la auditoría.
-- ============================================================

create table catalogo_equipos (
  id uuid primary key default gen_random_uuid(),
  sufijo text not null unique,
  nombre text not null,
  -- LINEA: está en ciertas líneas. SERVICIOS: generadores, calderas… aparecen en todas.
  tipo text not null default 'LINEA' check (tipo in ('LINEA', 'SERVICIOS')),
  activo boolean not null default true,
  creado_por uuid references usuarios (id),
  creado_en timestamptz not null default now(),
  editado_por uuid references usuarios (id),
  editado_en timestamptz
);

create table catalogo_equipos_lineas (
  equipo_id uuid not null references catalogo_equipos (id),
  linea_id uuid not null references lineas (id),
  primary key (equipo_id, linea_id)
);

create table catalogo_sistemas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references catalogo_equipos (id),
  sufijo text not null,
  nombre text not null,
  activo boolean not null default true,
  creado_por uuid references usuarios (id),
  creado_en timestamptz not null default now(),
  editado_por uuid references usuarios (id),
  editado_en timestamptz,
  unique (equipo_id, sufijo)
);

create table catalogo_subsistemas (
  id uuid primary key default gen_random_uuid(),
  sistema_id uuid not null references catalogo_sistemas (id),
  sufijo text not null,
  nombre text not null,
  -- Código viejo del Sheet de Mantenimiento (ej. A3CF-AIR-05): solo referencia y búsqueda.
  codigo_sheet text,
  activo boolean not null default true,
  creado_por uuid references usuarios (id),
  creado_en timestamptz not null default now(),
  editado_por uuid references usuarios (id),
  editado_en timestamptz,
  unique (sistema_id, sufijo)
);

create table catalogo_fallas (
  id uuid primary key default gen_random_uuid(),
  subsistema_id uuid not null references catalogo_subsistemas (id),
  numero integer not null check (numero > 0),
  nombre text not null,
  clase text not null default 'NO_PROGRAMADA' check (clase in ('PROGRAMADA', 'NO_PROGRAMADA', 'OCIOSO')),
  activo boolean not null default true,
  creado_por uuid references usuarios (id),
  creado_en timestamptz not null default now(),
  editado_por uuid references usuarios (id),
  editado_en timestamptz,
  unique (subsistema_id, numero)
);

alter table catalogo_equipos enable row level security;
alter table catalogo_equipos_lineas enable row level security;
alter table catalogo_sistemas enable row level security;
alter table catalogo_subsistemas enable row level security;
alter table catalogo_fallas enable row level security;

comment on table catalogo_fallas is 'Fallas mecánicas: Equipo › Sistema › Subsistema › Falla. El código se arma con codigo_falla() (20261113490000).';

create or replace function catalogo_no_borrar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El catálogo de paradas no se borra: se desactiva.';
end;
$$;
create trigger catalogo_equipos_no_borrar before delete on catalogo_equipos for each row execute function catalogo_no_borrar();
create trigger catalogo_sistemas_no_borrar before delete on catalogo_sistemas for each row execute function catalogo_no_borrar();
create trigger catalogo_subsistemas_no_borrar before delete on catalogo_subsistemas for each row execute function catalogo_no_borrar();
create trigger catalogo_fallas_no_borrar before delete on catalogo_fallas for each row execute function catalogo_no_borrar();

-- Lo que usará la fase 2: la falla que dijo Producción y la que confirmó Mantenimiento.
alter table paradas add column if not exists falla_produccion_id uuid references catalogo_fallas (id);
alter table paradas add column if not exists falla_final_id uuid references catalogo_fallas (id);
comment on column paradas.falla_produccion_id is 'Falla del catálogo modular que eligió Producción (20261113490000).';
comment on column paradas.falla_final_id is 'Falla que confirmó Mantenimiento; reportes, conteos y SIF usan esta (20261113490000).';

-- El permiso ya existía sin ningún rol: pasa al Jefe de Producción.
insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'CATALOGO_PARADAS' from roles r where r.codigo = 'JEFE_PRODUCCION'
on conflict do nothing;

-- ------------------------------------------------------------
-- Ayudantes
-- ------------------------------------------------------------
create or replace function exigir_editor_catalogo(p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := (select id from usuarios where usuario = lower(p_usuario) and activo);
begin
  if v_uid is null or not (tiene_permiso(p_usuario, 'CATALOGO_PARADAS') or es_dueno(p_usuario)) then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;
  return v_uid;
end;
$$;
revoke execute on function exigir_editor_catalogo(text) from public, anon, authenticated;

-- 'cam ' → 'CAM'. De 2 a 6 letras o números.
create or replace function catalogo_sufijo(p_sufijo text)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(btrim(coalesce(p_sufijo, '')));
begin
  if v !~ '^[A-Z0-9]{2,6}$' then
    raise exception 'El sufijo lleva de 2 a 6 letras o números (sin espacios ni acentos).';
  end if;
  return v;
end;
$$;

create or replace function catalogo_nombre(p_nombre text, p_que text)
returns text
language plpgsql
immutable
as $$
declare
  v text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), '');
begin
  if v is null then
    raise exception 'Escribe el nombre del %.', p_que;
  end if;
  return left(v, 120);
end;
$$;

-- El código de una falla, armado con los sufijos de hoy: CF-SUP-CAM-01.
create or replace function codigo_falla(p_falla_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select e.sufijo || '-' || s.sufijo || '-' || u.sufijo || '-' || lpad(f.numero::text, 2, '0')
  from catalogo_fallas f
  join catalogo_subsistemas u on u.id = f.subsistema_id
  join catalogo_sistemas s on s.id = u.sistema_id
  join catalogo_equipos e on e.id = s.equipo_id
  where f.id = p_falla_id;
$$;
grant execute on function codigo_falla(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Lectura: todo el catálogo de una vez (activos e inactivos; la app filtra).
-- ------------------------------------------------------------
create or replace function listar_catalogo_fallas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'sufijo', e.sufijo, 'nombre', e.nombre, 'tipo', e.tipo, 'activo', e.activo,
        'lineas', coalesce((select jsonb_agg(el.linea_id) from catalogo_equipos_lineas el where el.equipo_id = e.id), '[]'::jsonb)
      ) order by e.nombre)
      from catalogo_equipos e), '[]'::jsonb),
    'sistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'equipo_id', s.equipo_id, 'sufijo', s.sufijo, 'nombre', s.nombre, 'activo', s.activo) order by s.nombre)
      from catalogo_sistemas s), '[]'::jsonb),
    'subsistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'sistema_id', u.sistema_id, 'sufijo', u.sufijo, 'nombre', u.nombre,
                                          'codigo_sheet', u.codigo_sheet, 'activo', u.activo) order by u.nombre)
      from catalogo_subsistemas u), '[]'::jsonb),
    'fallas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'subsistema_id', f.subsistema_id, 'numero', f.numero, 'nombre', f.nombre, 'clase', f.clase, 'activo', f.activo,
        'codigo', e.sufijo || '-' || s.sufijo || '-' || u.sufijo || '-' || lpad(f.numero::text, 2, '0')
      ) order by f.subsistema_id, f.numero)
      from catalogo_fallas f
      join catalogo_subsistemas u on u.id = f.subsistema_id
      join catalogo_sistemas s on s.id = u.sistema_id
      join catalogo_equipos e on e.id = s.equipo_id), '[]'::jsonb)
  );
$$;
grant execute on function listar_catalogo_fallas() to anon, authenticated;

-- Cuántas paradas usan una falla de ese nivel (para el aviso antes de cambiar un sufijo).
create or replace function contar_paradas_catalogo(p_nivel text, p_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with fallas as (
    select f.id
    from catalogo_fallas f
    join catalogo_subsistemas u on u.id = f.subsistema_id
    join catalogo_sistemas s on s.id = u.sistema_id
    where case p_nivel
      when 'EQUIPO' then s.equipo_id = p_id
      when 'SISTEMA' then s.id = p_id
      when 'SUBSISTEMA' then u.id = p_id
      else f.id = p_id
    end
  )
  select count(*)::integer from paradas p
  where p.falla_produccion_id in (select id from fallas) or p.falla_final_id in (select id from fallas);
$$;
grant execute on function contar_paradas_catalogo(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Escritura. Sin p_id: crea. Con p_id: edita (el padre no cambia).
-- ------------------------------------------------------------
create or replace function guardar_catalogo_equipo(
  p_usuario text,
  p_id uuid,
  p_sufijo text,
  p_nombre text,
  p_tipo text default 'LINEA',
  p_lineas uuid[] default '{}',
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_sufijo text := catalogo_sufijo(p_sufijo);
  v_nombre text := catalogo_nombre(p_nombre, 'equipo');
  v_tipo text := coalesce(p_tipo, 'LINEA');
  v_antes catalogo_equipos;
  v_id uuid := p_id;
begin
  if v_tipo not in ('LINEA', 'SERVICIOS') then
    raise exception 'Elige si el equipo es de línea o de servicios.';
  end if;
  if exists (select 1 from catalogo_equipos where sufijo = v_sufijo and id is distinct from p_id) then
    raise exception 'Ya hay un equipo con el sufijo %.', v_sufijo;
  end if;

  if p_id is null then
    insert into catalogo_equipos (sufijo, nombre, tipo, activo, creado_por)
    values (v_sufijo, v_nombre, v_tipo, coalesce(p_activo, true), v_uid)
    returning id into v_id;
    perform registrar_auditoria(p_usuario, 'CREAR', 'catalogo_equipos', v_id::text, 'Catálogo de Paradas',
      format('Agregó el equipo %s (%s)', v_nombre, v_sufijo), null,
      jsonb_build_object('sufijo', v_sufijo, 'nombre', v_nombre, 'tipo', v_tipo));
  else
    select * into v_antes from catalogo_equipos where id = p_id for update;
    if not found then
      raise exception 'No se encontró el equipo.';
    end if;
    update catalogo_equipos
    set sufijo = v_sufijo, nombre = v_nombre, tipo = v_tipo, activo = coalesce(p_activo, true), editado_por = v_uid, editado_en = now()
    where id = p_id;
    perform registrar_auditoria(p_usuario, 'EDITAR', 'catalogo_equipos', p_id::text, 'Catálogo de Paradas',
      format('Editó el equipo %s (%s)', v_nombre, v_sufijo),
      jsonb_build_object('sufijo', v_antes.sufijo, 'nombre', v_antes.nombre, 'tipo', v_antes.tipo, 'activo', v_antes.activo),
      jsonb_build_object('sufijo', v_sufijo, 'nombre', v_nombre, 'tipo', v_tipo, 'activo', coalesce(p_activo, true)));
  end if;

  -- Los de servicios aparecen en todas las líneas: no guardan líneas.
  delete from catalogo_equipos_lineas where equipo_id = v_id;
  if v_tipo = 'LINEA' then
    insert into catalogo_equipos_lineas (equipo_id, linea_id)
    select v_id, l.id from lineas l where l.id = any (coalesce(p_lineas, '{}'));
  end if;
  return v_id;
end;
$$;
grant execute on function guardar_catalogo_equipo(text, uuid, text, text, text, uuid[], boolean) to anon, authenticated;

create or replace function guardar_catalogo_sistema(
  p_usuario text,
  p_id uuid,
  p_equipo_id uuid,
  p_sufijo text,
  p_nombre text,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_sufijo text := catalogo_sufijo(p_sufijo);
  v_nombre text := catalogo_nombre(p_nombre, 'sistema');
  v_antes catalogo_sistemas;
  v_equipo uuid := p_equipo_id;
  v_id uuid := p_id;
begin
  if p_id is not null then
    select * into v_antes from catalogo_sistemas where id = p_id for update;
    if not found then
      raise exception 'No se encontró el sistema.';
    end if;
    v_equipo := v_antes.equipo_id;
  elsif not exists (select 1 from catalogo_equipos where id = p_equipo_id) then
    raise exception 'Elige el equipo.';
  end if;
  if exists (select 1 from catalogo_sistemas where equipo_id = v_equipo and sufijo = v_sufijo and id is distinct from p_id) then
    raise exception 'Ese equipo ya tiene un sistema con el sufijo %.', v_sufijo;
  end if;

  if p_id is null then
    insert into catalogo_sistemas (equipo_id, sufijo, nombre, activo, creado_por)
    values (v_equipo, v_sufijo, v_nombre, coalesce(p_activo, true), v_uid)
    returning id into v_id;
    perform registrar_auditoria(p_usuario, 'CREAR', 'catalogo_sistemas', v_id::text, 'Catálogo de Paradas',
      format('Agregó el sistema %s (%s)', v_nombre, v_sufijo), null,
      jsonb_build_object('equipo_id', v_equipo, 'sufijo', v_sufijo, 'nombre', v_nombre));
  else
    update catalogo_sistemas
    set sufijo = v_sufijo, nombre = v_nombre, activo = coalesce(p_activo, true), editado_por = v_uid, editado_en = now()
    where id = p_id;
    perform registrar_auditoria(p_usuario, 'EDITAR', 'catalogo_sistemas', p_id::text, 'Catálogo de Paradas',
      format('Editó el sistema %s (%s)', v_nombre, v_sufijo),
      jsonb_build_object('sufijo', v_antes.sufijo, 'nombre', v_antes.nombre, 'activo', v_antes.activo),
      jsonb_build_object('sufijo', v_sufijo, 'nombre', v_nombre, 'activo', coalesce(p_activo, true)));
  end if;
  return v_id;
end;
$$;
grant execute on function guardar_catalogo_sistema(text, uuid, uuid, text, text, boolean) to anon, authenticated;

create or replace function guardar_catalogo_subsistema(
  p_usuario text,
  p_id uuid,
  p_sistema_id uuid,
  p_sufijo text,
  p_nombre text,
  p_codigo_sheet text default null,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_sufijo text := catalogo_sufijo(p_sufijo);
  v_nombre text := catalogo_nombre(p_nombre, 'subsistema');
  v_sheet text := upper(nullif(btrim(coalesce(p_codigo_sheet, '')), ''));
  v_antes catalogo_subsistemas;
  v_sistema uuid := p_sistema_id;
  v_id uuid := p_id;
begin
  if p_id is not null then
    select * into v_antes from catalogo_subsistemas where id = p_id for update;
    if not found then
      raise exception 'No se encontró el subsistema.';
    end if;
    v_sistema := v_antes.sistema_id;
  elsif not exists (select 1 from catalogo_sistemas where id = p_sistema_id) then
    raise exception 'Elige el sistema.';
  end if;
  if exists (select 1 from catalogo_subsistemas where sistema_id = v_sistema and sufijo = v_sufijo and id is distinct from p_id) then
    raise exception 'Ese sistema ya tiene un subsistema con el sufijo %.', v_sufijo;
  end if;

  if p_id is null then
    insert into catalogo_subsistemas (sistema_id, sufijo, nombre, codigo_sheet, activo, creado_por)
    values (v_sistema, v_sufijo, v_nombre, left(v_sheet, 40), coalesce(p_activo, true), v_uid)
    returning id into v_id;
    perform registrar_auditoria(p_usuario, 'CREAR', 'catalogo_subsistemas', v_id::text, 'Catálogo de Paradas',
      format('Agregó el subsistema %s (%s)', v_nombre, v_sufijo), null,
      jsonb_build_object('sistema_id', v_sistema, 'sufijo', v_sufijo, 'nombre', v_nombre, 'codigo_sheet', v_sheet));
  else
    update catalogo_subsistemas
    set sufijo = v_sufijo, nombre = v_nombre, codigo_sheet = left(v_sheet, 40), activo = coalesce(p_activo, true),
        editado_por = v_uid, editado_en = now()
    where id = p_id;
    perform registrar_auditoria(p_usuario, 'EDITAR', 'catalogo_subsistemas', p_id::text, 'Catálogo de Paradas',
      format('Editó el subsistema %s (%s)', v_nombre, v_sufijo),
      jsonb_build_object('sufijo', v_antes.sufijo, 'nombre', v_antes.nombre, 'codigo_sheet', v_antes.codigo_sheet, 'activo', v_antes.activo),
      jsonb_build_object('sufijo', v_sufijo, 'nombre', v_nombre, 'codigo_sheet', v_sheet, 'activo', coalesce(p_activo, true)));
  end if;
  return v_id;
end;
$$;
grant execute on function guardar_catalogo_subsistema(text, uuid, uuid, text, text, text, boolean) to anon, authenticated;

-- Una o varias fallas nuevas (lo pegado del Excel). Las que ya existen en el
-- subsistema (mismo nombre, sin importar mayúsculas) se saltan y se devuelven.
create or replace function agregar_catalogo_fallas(
  p_usuario text,
  p_subsistema_id uuid,
  p_nombres text[],
  p_clase text default 'NO_PROGRAMADA'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_clase text := coalesce(p_clase, 'NO_PROGRAMADA');
  v_numero integer;
  v_nombre text;
  v_crudo text;
  v_id uuid;
  v_creadas jsonb := '[]'::jsonb;
  v_repetidas jsonb := '[]'::jsonb;
begin
  if v_clase not in ('PROGRAMADA', 'NO_PROGRAMADA', 'OCIOSO') then
    raise exception 'Elige la clase de la falla.';
  end if;
  -- Bloquea el subsistema: dos personas agregando a la vez no sacan el mismo número.
  perform 1 from catalogo_subsistemas where id = p_subsistema_id for update;
  if not found then
    raise exception 'Elige el subsistema.';
  end if;
  select coalesce(max(numero), 0) into v_numero from catalogo_fallas where subsistema_id = p_subsistema_id;

  foreach v_crudo in array coalesce(p_nombres, '{}') loop
    v_nombre := left(nullif(btrim(regexp_replace(coalesce(v_crudo, ''), '\s+', ' ', 'g')), ''), 120);
    continue when v_nombre is null;
    if exists (select 1 from catalogo_fallas where subsistema_id = p_subsistema_id and lower(nombre) = lower(v_nombre)) then
      v_repetidas := v_repetidas || to_jsonb(v_nombre);
      continue;
    end if;
    v_numero := v_numero + 1;
    insert into catalogo_fallas (subsistema_id, numero, nombre, clase, creado_por)
    values (p_subsistema_id, v_numero, v_nombre, v_clase, v_uid)
    returning id into v_id;
    v_creadas := v_creadas || jsonb_build_object('id', v_id, 'nombre', v_nombre, 'codigo', codigo_falla(v_id));
  end loop;

  if jsonb_array_length(v_creadas) = 0 and jsonb_array_length(v_repetidas) = 0 then
    raise exception 'Escribe el nombre de la falla.';
  end if;
  if jsonb_array_length(v_creadas) > 0 then
    perform registrar_auditoria(p_usuario, 'CREAR', 'catalogo_fallas', p_subsistema_id::text, 'Catálogo de Paradas',
      format('Agregó %s falla(s) al subsistema', jsonb_array_length(v_creadas)), null,
      jsonb_build_object('clase', v_clase, 'fallas', v_creadas));
  end if;
  return jsonb_build_object('creadas', v_creadas, 'repetidas', v_repetidas);
end;
$$;
grant execute on function agregar_catalogo_fallas(text, uuid, text[], text) to anon, authenticated;

create or replace function guardar_catalogo_falla(
  p_usuario text,
  p_id uuid,
  p_nombre text,
  p_clase text,
  p_activo boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_nombre text := catalogo_nombre(p_nombre, 'falla');
  v_antes catalogo_fallas;
begin
  if p_clase not in ('PROGRAMADA', 'NO_PROGRAMADA', 'OCIOSO') then
    raise exception 'Elige la clase de la falla.';
  end if;
  select * into v_antes from catalogo_fallas where id = p_id for update;
  if not found then
    raise exception 'No se encontró la falla.';
  end if;
  if exists (select 1 from catalogo_fallas where subsistema_id = v_antes.subsistema_id and lower(nombre) = lower(v_nombre) and id <> p_id) then
    raise exception 'Ese subsistema ya tiene una falla llamada «%».', v_nombre;
  end if;
  update catalogo_fallas
  set nombre = v_nombre, clase = p_clase, activo = coalesce(p_activo, true), editado_por = v_uid, editado_en = now()
  where id = p_id;
  perform registrar_auditoria(p_usuario, 'EDITAR', 'catalogo_fallas', p_id::text, 'Catálogo de Paradas',
    format('Editó la falla %s (%s)', v_nombre, codigo_falla(p_id)),
    jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'activo', v_antes.activo),
    jsonb_build_object('nombre', v_nombre, 'clase', p_clase, 'activo', coalesce(p_activo, true)));
end;
$$;
grant execute on function guardar_catalogo_falla(text, uuid, text, text, boolean) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
