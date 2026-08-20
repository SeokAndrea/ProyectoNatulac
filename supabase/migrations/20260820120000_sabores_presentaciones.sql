-- ============================================================
-- SABORES Y PRESENTACIONES — Zumo / Portal de Planta (Natulac)
-- ============================================================
-- Datos reales pasados por el analista de Aséptico (planilla de
-- presentaciones y sabores por familia de producto).
--
-- OJO:
--   1. "velocidad_llenadora" en esta tabla queda NULL a propósito:
--      resultó que la velocidad depende de (línea, presentación), no
--      solo de la presentación — ver la tabla velocidades_llenadora
--      en 20260821090000_velocidades_llenadora.sql, que trae el dato
--      real. Esta columna queda como referencia/futuro pero no se usa.
--   2. "volumen" en sabores es para las preparaciones (fórmulas de
--      mezcla) — confirmado, es para más adelante, no se usa todavía
--      en ningún cálculo.
-- ============================================================

-- ------------------------------------------------------------
-- PRESENTACIONES: tamaño de envase (ml) y su empaque tabulado.
-- cajas_x_paleta viene tal cual de la planilla (no se recalcula
-- como cajas_x_camada * cant_camada porque en la fila de 500 ml no
-- da exacto — así está en el original, probablemente por una
-- restricción física del paletizado).
-- ------------------------------------------------------------
create table presentaciones (
  id uuid primary key default gen_random_uuid(),
  volumen_ml integer unique not null,
  cajas_x_camada integer not null,
  cant_camada integer not null,
  cajas_x_paleta integer not null,
  litros_x_caja numeric(6, 2) not null,
  envases_x_caja integer not null,
  velocidad_llenadora numeric(10, 2),
  activo boolean not null default true
);

insert into presentaciones (volumen_ml, cajas_x_camada, cant_camada, cajas_x_paleta, litros_x_caja, envases_x_caja) values
  (1000, 17, 5, 85, 12, 12),
  (500, 17, 8, 120, 6, 12),
  (330, 15, 10, 150, 5.94, 18),
  (250, 14, 10, 140, 6, 24),
  (200, 14, 10, 140, 4.8, 24);

-- ------------------------------------------------------------
-- FAMILIAS_PRODUCTO: la gama/línea comercial del producto
-- (Clásicos, Premium, Especiales, Selecto, Jucosa). NO confundir
-- con "lineas" (las líneas físicas de llenado, Línea 1/2/3, ya
-- creadas en 20260819120000_core_schema.sql).
-- ------------------------------------------------------------
create table familias_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null
);

insert into familias_producto (nombre) values
  ('Clasicos'), ('Premium'), ('Especiales'), ('Selecto'), ('Jucosa');

-- ------------------------------------------------------------
-- SABORES: un mismo nombre de sabor (ej. "Pera") puede repetirse en
-- varias familias con un "volumen" propio en cada una, por eso la
-- clave es (familia_id, nombre) y no el nombre solo.
-- ------------------------------------------------------------
create table sabores (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias_producto (id),
  nombre text not null,
  volumen numeric(12, 2),
  activo boolean not null default true,
  unique (familia_id, nombre)
);

insert into sabores (familia_id, nombre, volumen)
select f.id, v.nombre, v.volumen
from familias_producto f
join (
  values
    ('Clasicos', 'Pera', 2710),
    ('Clasicos', 'Manzana', 2810),
    ('Clasicos', 'Durazno', 2979),
    ('Clasicos', 'Naranja', 4500),
    ('Premium', 'Manzana Clarificado', 1735),
    ('Premium', 'Agua de Coco', 170),
    ('Premium', 'Naranja 100%', 2870),
    ('Especiales', 'Coctel', 8200),
    ('Especiales', 'Mango', 2590),
    ('Especiales', 'Té de Durazno', 4883),
    ('Especiales', 'Te de Limón', 4883),
    ('Selecto', 'Manzana', 3676),
    ('Selecto', 'Pera', 3522),
    ('Selecto', 'Durazno', 3750),
    ('Jucosa', 'Pera', 7583),
    ('Jucosa', 'Manzana', 7889),
    ('Jucosa', 'Naranja', 17300),
    ('Jucosa', 'Durazno', 7676)
) as v (familia, nombre, volumen) on f.nombre = v.familia;

alter table presentaciones enable row level security;
alter table familias_producto enable row level security;
alter table sabores enable row level security;
