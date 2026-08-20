-- ============================================================
-- ESQUEMA CENTRAL — Zumo / Portal de Planta
-- ============================================================
-- Este es un PRIMER BORRADOR. Cubre lo que ya está confirmado:
-- áreas, roles, usuarios, líneas, turnos (con auditoría de cambios)
-- y contadores de producto terminado / merma por línea (también
-- auditados). Todavía falta por definir (ver conversación):
--   - sabores / presentaciones / parámetros por combinación
-- Se va a agregar en una migración aparte una vez confirmados los
-- datos, para no tener que reescribir esta base.
--
-- Cómo aplicar esto a un proyecto real de Supabase:
--   1. npx supabase login
--   2. npx supabase link --project-ref <tu-project-ref>
--   3. npx supabase db push
-- ============================================================

create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ------------------------------------------------------------
-- ÁREAS: Producción Aséptico, Producción Vacío, Servicios
-- Industriales, Mantenimiento. Se arranca cargando solo Aséptico.
-- ------------------------------------------------------------
create table areas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  activo boolean not null default true
);

-- ------------------------------------------------------------
-- ROLES: catálogo fijo. SUPERVISOR y ADMINISTRADOR_AREA están
-- acotados a un área (ver usuario_roles.area_id); SUPERADMINISTRADOR
-- no tiene área asignada porque ve y edita todas.
-- ------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null, -- 'SUPERVISOR' | 'ADMINISTRADOR_AREA' | 'SUPERADMINISTRADOR'
  nombre text not null
);

-- ------------------------------------------------------------
-- USUARIOS: extiende auth.users (tabla interna de Supabase Auth)
-- con los datos propios del negocio.
-- ------------------------------------------------------------
create table usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  apellido text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un usuario puede tener más de un rol/área (ej: alguien que en el
-- futuro sea supervisor en un área y administrador en otra).
-- area_id nulo = el rol aplica a todas las áreas (caso SuperAdmin).
create table usuario_roles (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  rol_id uuid not null references roles (id),
  area_id uuid references areas (id),
  unique (usuario_id, rol_id, area_id)
);

-- ------------------------------------------------------------
-- LÍNEAS de producción, por área (en Aséptico son 3).
-- ------------------------------------------------------------
create table lineas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  nombre text not null,
  activo boolean not null default true,
  unique (area_id, nombre)
);

-- ------------------------------------------------------------
-- Catálogos de turno y grupo. Se modelan como tablas (no como
-- valores fijos en código) para poder agregar variantes sin tocar
-- el esquema ni el código. El supervisor elige, al empezar el
-- turno, cuál de estos tipos aplica ese día (los fijos Turno 1/2/3,
-- o el esquema alternativo "12x12"). hora_inicio/hora_fin son
-- informativas (para mostrar el horario en la interfaz); no se
-- usan para validar nada todavía.
-- ------------------------------------------------------------
create table turno_tipos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  hora_inicio time,
  hora_fin time
);

-- Equipo de operarios a cargo del supervisor durante el turno. Rota
-- de forma independiente del turno_tipo (el mismo supervisor puede
-- tener distinto grupo en distintos turnos, según la rotación de la
-- planta), por eso es un campo aparte y no una relación fija.
create table grupos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null
);

-- ------------------------------------------------------------
-- TURNOS: se crea uno al presionar "Empezar Turno" y se cierra
-- al presionar "Finalizar Turno". Todas las demás gestiones del
-- supervisor durante el turno se van a asociar a este registro
-- mediante turno_id (por eso "codigo" existe: para ubicarlo
-- fácilmente en "Mis Turnos").
-- ------------------------------------------------------------
create table turnos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  area_id uuid not null references areas (id),
  supervisor_id uuid not null references usuarios (id),
  fecha date not null default current_date,
  hora_inicio time not null default current_time,
  turno_tipo_id uuid not null references turno_tipos (id),
  grupo_id uuid not null references grupos (id),
  -- presentacion_id uuid references presentaciones (id), -- se agrega
  -- cuando exista la tabla "presentaciones" (pendiente: ver MAPA.md).
  -- El supervisor ya NO tipea la velocidad a mano: se copia acá desde
  -- presentaciones.velocidad_llenadora al momento de crear el turno,
  -- para que quede un valor histórico fijo aunque la tabla cambie
  -- más adelante.
  velocidad_llenadora numeric(10, 2),
  estado text not null default 'ABIERTO' check (estado in ('ABIERTO', 'CERRADO')),
  fecha_fin date,
  hora_fin time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Líneas usadas en el turno (0 a 3 filas; 0 filas = "Ninguna").
create table turno_lineas (
  turno_id uuid not null references turnos (id) on delete cascade,
  linea_id uuid not null references lineas (id),
  primary key (turno_id, linea_id)
);

-- ------------------------------------------------------------
-- AUDITORÍA de turnos: cada UPDATE queda registrado acá con el
-- estado anterior y nuevo completos (en JSON) y quién lo hizo.
-- Esto es lo que permite mostrar el historial de cambios en
-- "Mis Turnos" cuando un supervisor corrige un error.
-- ------------------------------------------------------------
create table turnos_historial (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  usuario_id uuid references usuarios (id),
  valores_anteriores jsonb not null,
  valores_nuevos jsonb not null,
  changed_at timestamptz not null default now()
);

create or replace function fn_turnos_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into turnos_historial (turno_id, usuario_id, valores_anteriores, valores_nuevos)
  values (old.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_turnos_auditar
before update on turnos
for each row execute function fn_turnos_auditar();

-- ------------------------------------------------------------
-- CONTADORES: registro de "Producto Terminado" por línea dentro de
-- un turno. La merma teórica es desechados / envases_llenadora y no
-- debería superar el 3%; si lo supera, "justificacion" es
-- obligatoria (queda como respaldo para el acta). merma_pct y
-- requiere_justificacion se calculan solos (columnas "generated
-- always"): no hay que mantenerlos a mano ni desde la app.
-- ------------------------------------------------------------
create table contadores (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  linea_id uuid not null references lineas (id),
  envases_llenadora integer not null check (envases_llenadora >= 0),
  envases_buenos integer not null check (envases_buenos >= 0),
  envases_desechados integer not null check (envases_desechados >= 0),
  merma_pct numeric(5, 2) generated always as (
    case
      when envases_llenadora = 0 then 0
      else round((envases_desechados::numeric / envases_llenadora) * 100, 2)
    end
  ) stored,
  requiere_justificacion boolean generated always as (
    envases_llenadora > 0
    and (envases_desechados::numeric / envases_llenadora) > 0.03
  ) stored,
  justificacion text,
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Todo envase que sale de la llenadora es bueno o desechado, sin
  -- excepción. Si en la práctica esto no cierra siempre exacto,
  -- avisame y lo relajamos.
  check (envases_buenos + envases_desechados = envases_llenadora)
);

-- Auditoría de contadores: mismo patrón que turnos_historial. Clave
-- para justificar mermas >3% en el acta si alguien corrige un conteo
-- después de cargado.
create table contadores_historial (
  id uuid primary key default gen_random_uuid(),
  contador_id uuid not null references contadores (id) on delete cascade,
  usuario_id uuid references usuarios (id),
  valores_anteriores jsonb not null,
  valores_nuevos jsonb not null,
  changed_at timestamptz not null default now()
);

create or replace function fn_contadores_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into contadores_historial (contador_id, usuario_id, valores_anteriores, valores_nuevos)
  values (old.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_contadores_auditar
before update on contadores
for each row execute function fn_contadores_auditar();

-- ------------------------------------------------------------
-- Row Level Security: se activa acá para que quede prohibido por
-- defecto, pero las políticas (quién puede leer/escribir qué según
-- su rol y área) se escriben en una migración aparte una vez que
-- los roles estén conectados a Supabase Auth — hacerlo bien
-- requiere tener resueltas las preguntas de roles pendientes.
-- ------------------------------------------------------------
alter table areas enable row level security;
alter table roles enable row level security;
alter table usuarios enable row level security;
alter table usuario_roles enable row level security;
alter table lineas enable row level security;
alter table turno_tipos enable row level security;
alter table grupos enable row level security;
alter table turnos enable row level security;
alter table turno_lineas enable row level security;
alter table turnos_historial enable row level security;
alter table contadores enable row level security;
alter table contadores_historial enable row level security;

-- ------------------------------------------------------------
-- Datos iniciales (catálogos conocidos).
-- ------------------------------------------------------------
insert into areas (codigo, nombre) values
  ('ASEPTICO', 'Producción Aséptico'),
  ('VACIO', 'Producción Vacío'),
  ('SERVICIOS_INDUSTRIALES', 'Servicios Industriales'),
  ('MANTENIMIENTO', 'Mantenimiento');

insert into roles (codigo, nombre) values
  ('SUPERVISOR', 'Supervisor'),
  ('ADMINISTRADOR_AREA', 'Administrador de Área'),
  ('SUPERADMINISTRADOR', 'Super Administrador');

insert into lineas (area_id, nombre)
select id, linea
from areas, unnest(array['Línea 1', 'Línea 2', 'Línea 3']) as linea
where areas.codigo = 'ASEPTICO';

-- Turno 3 cruza medianoche (22:30 → 07:00): son horas de reloj, no
-- una duración, así que no hace falta modelar el cruce de día acá.
insert into turno_tipos (codigo, nombre, hora_inicio, hora_fin) values
  ('TURNO_1', 'Turno 1', '07:00', '15:00'),
  ('TURNO_2', 'Turno 2', '15:00', '22:30'),
  ('TURNO_3', 'Turno 3', '22:30', '07:00'),
  ('12X12', '12x12', null, null);

insert into grupos (codigo, nombre) values
  ('GRUPO_1', 'Grupo 1'),
  ('GRUPO_2', 'Grupo 2'),
  ('GRUPO_3', 'Grupo 3');
