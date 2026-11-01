-- Personal por Áreas y Puestos, paso 1: la estructura en la base.
-- Áreas con tipo y orden, permisos con tema, y los puestos con sus permisos.
-- Aún no toca a las personas: eso lo hace 20261114090000.

-- Áreas: tipo y orden de aparición
alter table areas add column if not exists tipo text not null default 'APOYO';
alter table areas add column if not exists orden int not null default 0;
do $$ begin
  alter table areas add constraint areas_tipo_check check (tipo in ('PRODUCCION', 'APOYO'));
exception when duplicate_object then null; end $$;

-- Las cuatro de apoyo de siempre; cualquier otra (Aséptico, Pruebas, Vacío…) produce,
-- como hacía esAreaDeApoyo antes de leer el tipo de la base.
update areas set tipo = case when codigo in ('MANTENIMIENTO', 'SERVICIOS_INDUSTRIALES', 'CALIDAD', 'OTROS')
                             then 'APOYO' else 'PRODUCCION' end;
update areas set activo = false where codigo = 'CALIDAD';
update areas a set orden = v.orden
  from (values ('ASEPTICO', 1), ('MANTENIMIENTO', 2), ('SERVICIOS_INDUSTRIALES', 3),
               ('OTROS', 4), ('PRUEBAS', 5), ('CALIDAD', 6), ('VACIO', 7)) as v(codigo, orden)
 where a.codigo = v.codigo;

-- Permisos nuevos
insert into permisos (codigo, nombre) values
  ('ESTRUCTURA_GESTIONAR', 'Administrar áreas y puestos'),
  ('LECTURAS_SI', 'Cargar lecturas de Servicios Industriales'),
  ('CODIGOS_MTTO_EDITAR', 'Editar Códigos de Mantenimiento'),
  ('REPORTES_PARADAS_VER', 'Ver Reportes de paradas')
on conflict do nothing;

-- Permisos: tema para agruparlos en pantalla
alter table permisos add column if not exists tema text not null default 'DATOS';
do $$ begin
  alter table permisos add constraint permisos_tema_check
    check (tema in ('TURNOS', 'PARADAS', 'MANTENIMIENTO', 'DATOS', 'PERSONAS', 'ADMINISTRACION'));
exception when duplicate_object then null; end $$;

update permisos set tema = case
  when codigo = 'PERSONAL_GESTIONAR' then 'PERSONAS'
  when codigo = 'ESTRUCTURA_GESTIONAR' then 'ADMINISTRACION'
  when codigo in ('SIF_GESTIONAR', 'CODIGOS_MTTO_EDITAR', 'PARADAS_MANTENIMIENTO') then 'MANTENIMIENTO'
  when codigo in ('CATALOGO_PARADAS', 'CATALOGO_PARADAS_VER', 'PARADAS_REGISTRAR', 'REPORTES_PARADAS_VER') then 'PARADAS'
  when codigo like 'TURNO\_%' or codigo in ('ESQUEMA_TURNOS', 'VALIDAR', 'LOTE_LIBERAR') then 'TURNOS'
  else 'DATOS' end;

-- Puestos
create table if not exists puestos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  area_id uuid references areas (id),
  nivel smallint check (nivel between 1 and 4),
  todos_los_permisos boolean not null default false,
  rol_equivalente_id uuid not null references roles (id),
  activo boolean not null default true,
  created_at timestamptz default now(),
  check ((area_id is null) = (nivel is null) or todos_los_permisos)
);
comment on table puestos is 'Puestos por área, con nivel (1 Jefatura, 2 Coordinación, 3 Operación, 4 Apoyo) y permisos (20261113990000).';

create table if not exists puesto_permisos (
  puesto_id uuid references puestos (id) on delete cascade,
  permiso_codigo text references permisos (codigo),
  primary key (puesto_id, permiso_codigo)
);

alter table puestos enable row level security;
alter table puesto_permisos enable row level security;

-- Un puesto no se borra: se desactiva.
create or replace function puestos_no_borrar()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un puesto no se borra: se desactiva.';
end;
$$;
drop trigger if exists puestos_no_borrar on puestos;
create trigger puestos_no_borrar before delete on puestos for each row execute function puestos_no_borrar();

-- Un puesto no cambia de área.
create or replace function puestos_area_fija()
returns trigger
language plpgsql
as $$
begin
  if new.area_id is distinct from old.area_id then
    raise exception 'Un puesto no cambia de área.';
  end if;
  return new;
end;
$$;
drop trigger if exists puestos_area_fija on puestos;
create trigger puestos_area_fija before update on puestos for each row execute function puestos_area_fija();

-- Semilla de puestos
insert into puestos (codigo, nombre, area_id, nivel, todos_los_permisos, rol_equivalente_id, activo)
select v.codigo, v.nombre, a.id, v.nivel, v.todos, r.id, v.activo
  from (values
    ('JEFE_PRODUCCION', 'Jefe de Producción', 'ASEPTICO', 1, false, 'JEFE_PRODUCCION', true),
    ('COORDINADOR_PRODUCCION', 'Coordinador de Producción', 'ASEPTICO', 2, false, 'ANALISTA', true),
    ('SUPERVISOR', 'Supervisor', 'ASEPTICO', 3, false, 'SUPERVISOR', true),
    ('PASANTE', 'Pasante', 'ASEPTICO', 4, false, 'SUPERVISOR', true),
    ('JEFE_MANTENIMIENTO', 'Jefe de Mantenimiento', 'MANTENIMIENTO', 1, false, 'MANTENIMIENTO', true),
    ('SUPERVISOR_MANTENIMIENTO', 'Supervisor de Mantenimiento', 'MANTENIMIENTO', 2, false, 'MANTENIMIENTO', true),
    ('TECNICO_MANTENIMIENTO', 'Técnico de Mantenimiento', 'MANTENIMIENTO', 3, false, 'MANTENIMIENTO', true),
    ('SERVICIOS_INDUSTRIALES', 'Servicios Industriales', 'SERVICIOS_INDUSTRIALES', 3, false, 'SERVICIOS_INDUSTRIALES', true),
    ('SOLO_VISTA', 'Solo Vista', 'OTROS', 4, false, 'VISTA', true),
    ('JEFE_CALIDAD', 'Jefe de Calidad', 'CALIDAD', 1, false, 'CALIDAD', false),
    ('SUPERVISOR_CALIDAD', 'Supervisor de Calidad', 'CALIDAD', 2, false, 'SUPERVISOR_CALIDAD', false),
    ('ANALISTA_CALIDAD', 'Analista de Calidad', 'CALIDAD', 3, false, 'CALIDAD', false),
    ('PROBADOR', 'Probador', 'PRUEBAS', null, true, 'SUPERVISOR', true),
    ('SUPERADMINISTRADOR', 'Super Administrador', null, null, true, 'SUPERADMINISTRADOR', true)
  ) as v(codigo, nombre, area, nivel, todos, rol, activo)
  join roles r on r.codigo = v.rol
  left join areas a on a.codigo = v.area
on conflict (codigo) do nothing;

-- Permisos de cada puesto
-- Jefe y Coordinador de Producción: los de ANALISTA, JEFE_PRODUCCION, VALIDAR y REPORTES_PARADAS_VER.
insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, x.permiso_codigo
  from puestos p
  cross join (
    select rp.permiso_codigo from rol_permisos rp join roles r on r.id = rp.rol_id where r.codigo in ('ANALISTA', 'JEFE_PRODUCCION')
    union select 'VALIDAR' union select 'REPORTES_PARADAS_VER'
  ) x
 where p.codigo in ('JEFE_PRODUCCION', 'COORDINADOR_PRODUCCION')
on conflict do nothing;

-- Supervisor y los tres de Calidad: los de hoy de su rol.
insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, rp.permiso_codigo
  from puestos p
  join rol_permisos rp on rp.rol_id = p.rol_equivalente_id
 where p.codigo in ('SUPERVISOR', 'JEFE_CALIDAD', 'SUPERVISOR_CALIDAD', 'ANALISTA_CALIDAD')
on conflict do nothing;

-- Mantenimiento, Servicios Industriales y Solo Vista: según la tabla del diseño.
insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, v.permiso
  from (values
    ('JEFE_MANTENIMIENTO', 'PARADAS_MANTENIMIENTO'), ('JEFE_MANTENIMIENTO', 'SIF_GESTIONAR'),
    ('JEFE_MANTENIMIENTO', 'CODIGOS_MTTO_EDITAR'), ('JEFE_MANTENIMIENTO', 'REPORTES_PARADAS_VER'),
    ('JEFE_MANTENIMIENTO', 'CATALOGO_PARADAS_VER'), ('JEFE_MANTENIMIENTO', 'CATALOGO_PARADAS'),
    ('JEFE_MANTENIMIENTO', 'PERSONAL_GESTIONAR'),
    ('SUPERVISOR_MANTENIMIENTO', 'PARADAS_MANTENIMIENTO'), ('SUPERVISOR_MANTENIMIENTO', 'SIF_GESTIONAR'),
    ('SUPERVISOR_MANTENIMIENTO', 'CODIGOS_MTTO_EDITAR'), ('SUPERVISOR_MANTENIMIENTO', 'REPORTES_PARADAS_VER'),
    ('SUPERVISOR_MANTENIMIENTO', 'CATALOGO_PARADAS_VER'),
    ('TECNICO_MANTENIMIENTO', 'PARADAS_MANTENIMIENTO'), ('TECNICO_MANTENIMIENTO', 'SIF_GESTIONAR'),
    ('TECNICO_MANTENIMIENTO', 'CODIGOS_MTTO_EDITAR'), ('TECNICO_MANTENIMIENTO', 'REPORTES_PARADAS_VER'),
    ('TECNICO_MANTENIMIENTO', 'CATALOGO_PARADAS_VER'),
    ('SERVICIOS_INDUSTRIALES', 'LECTURAS_SI'), ('SERVICIOS_INDUSTRIALES', 'CATALOGO_PARADAS_VER'),
    ('SOLO_VISTA', 'CATALOGO_PARADAS_VER')
  ) as v(puesto, permiso)
  join puestos p on p.codigo = v.puesto
on conflict do nothing;
