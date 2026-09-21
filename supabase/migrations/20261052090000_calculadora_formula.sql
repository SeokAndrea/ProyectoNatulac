-- ============================================================
-- CALCULADORA DE FÓRMULA — insumos de materia prima por variante
-- ============================================================
-- "Voy a preparar 60 tambores de Pera, ¿cuánto pido de cada micro?"
-- Fuente: hojas " MATERIA PRIMA CLASICA ", "PREMIUM" y "TE" del Excel
-- "Control de Existencias" — únicas 3 con datos completos y sin
-- errores (las otras 4 hojas equivalentes del Excel tienen columnas
-- vacías o fórmulas #REF! rotas, quedan fuera por ahora).
-- ============================================================

create table formula_variantes (
  id uuid primary key default gen_random_uuid(),
  familia text not null check (familia in ('CLASICOS', 'PREMIUM', 'TE')),
  nombre text not null,
  unidad_base text not null check (unidad_base in ('tambor', 'kit')),
  activo boolean not null default true,
  unique (familia, nombre)
);

create table formula_insumos (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references formula_variantes (id),
  insumo text not null,
  cantidad numeric not null,
  unidad text not null check (unidad in ('kg', 'L')),
  unique (variante_id, insumo)
);

alter table formula_variantes enable row level security;
alter table formula_insumos enable row level security;

-- ------------------------------------------------------------
-- Seed: valores leídos celda por celda del Excel (no los valores
-- mostrados en pantalla, que a veces redondean).
-- ------------------------------------------------------------

insert into formula_variantes (familia, nombre, unidad_base) values
  ('CLASICOS', 'Durazno Nacional', 'tambor'),
  ('CLASICOS', 'Pera', 'tambor'),
  ('CLASICOS', 'Manzana', 'tambor'),
  ('CLASICOS', 'Naranja', 'tambor'),
  ('CLASICOS', 'Durazno Importado', 'tambor'),
  ('CLASICOS', 'Mango', 'tambor'),
  ('CLASICOS', 'Coctel', 'tambor'),
  ('CLASICOS', 'Manzana/Pera', 'tambor'),
  ('CLASICOS', 'Clarificado', 'tambor'),
  ('CLASICOS', 'Guayaba', 'tambor'),
  ('PREMIUM', 'Naranja 100%', 'tambor'),
  ('PREMIUM', 'Clarificado', 'tambor'),
  ('PREMIUM', 'Agua de Coco', 'tambor'),
  ('PREMIUM', 'Piña 100%', 'tambor'),
  ('TE', 'Té de Limón', 'kit'),
  ('TE', 'Té de Durazno', 'kit');

-- CLASICOS: Azúcar, CMC, Goma, Ácido Cítrico, Ácido Ascórbico, Aroma,
-- Sucralosa, Acesulfame, Antiespumante, Agua — tabla completa, 10x10.
insert into formula_insumos (variante_id, insumo, cantidad, unidad)
select v.id, i.insumo, i.cantidad, i.unidad
from formula_variantes v
join (
  values
    ('Durazno Nacional', 'Azúcar', 150, 'kg'), ('Durazno Nacional', 'CMC', 1.8, 'kg'), ('Durazno Nacional', 'Goma', 2.2, 'kg'),
    ('Durazno Nacional', 'Ácido Cítrico', 4.3, 'kg'), ('Durazno Nacional', 'Ácido Ascórbico', 1.23, 'kg'), ('Durazno Nacional', 'Aroma', 0.14, 'L'),
    ('Durazno Nacional', 'Sucralosa', 0.079, 'kg'), ('Durazno Nacional', 'Acesulfame', 0.086, 'kg'), ('Durazno Nacional', 'Antiespumante', 0.05, 'L'),
    ('Durazno Nacional', 'Agua', 2150, 'L'),

    ('Pera', 'Azúcar', 100, 'kg'), ('Pera', 'CMC', 2.6, 'kg'), ('Pera', 'Goma', 3.2, 'kg'),
    ('Pera', 'Ácido Cítrico', 5, 'kg'), ('Pera', 'Ácido Ascórbico', 1.15, 'kg'), ('Pera', 'Aroma', 0.74, 'L'),
    ('Pera', 'Sucralosa', 0.144, 'kg'), ('Pera', 'Acesulfame', 0.165, 'kg'), ('Pera', 'Antiespumante', 0, 'L'),
    ('Pera', 'Agua', 2430, 'L'),

    ('Manzana', 'Azúcar', 100, 'kg'), ('Manzana', 'CMC', 3.1, 'kg'), ('Manzana', 'Goma', 2.6, 'kg'),
    ('Manzana', 'Ácido Cítrico', 5, 'kg'), ('Manzana', 'Ácido Ascórbico', 1.09, 'kg'), ('Manzana', 'Aroma', 0.66, 'L'),
    ('Manzana', 'Sucralosa', 0.129, 'kg'), ('Manzana', 'Acesulfame', 0.129, 'kg'), ('Manzana', 'Antiespumante', 0, 'L'),
    ('Manzana', 'Agua', 2540, 'L'),

    ('Naranja', 'Azúcar', 200, 'kg'), ('Naranja', 'CMC', 1.6, 'kg'), ('Naranja', 'Goma', 2.3, 'kg'),
    ('Naranja', 'Ácido Cítrico', 9, 'kg'), ('Naranja', 'Ácido Ascórbico', 1.8, 'kg'), ('Naranja', 'Aroma', 1.4, 'L'),
    ('Naranja', 'Sucralosa', 0.21, 'kg'), ('Naranja', 'Acesulfame', 0.21, 'kg'), ('Naranja', 'Antiespumante', 0.08, 'L'),
    ('Naranja', 'Agua', 4170, 'L'),

    ('Durazno Importado', 'Azúcar', 150, 'kg'), ('Durazno Importado', 'CMC', 1.8, 'kg'), ('Durazno Importado', 'Goma', 2.2, 'kg'),
    ('Durazno Importado', 'Ácido Cítrico', 4, 'kg'), ('Durazno Importado', 'Ácido Ascórbico', 1.3, 'kg'), ('Durazno Importado', 'Aroma', 0.14, 'L'),
    ('Durazno Importado', 'Sucralosa', 0.079, 'kg'), ('Durazno Importado', 'Acesulfame', 0.086, 'kg'), ('Durazno Importado', 'Antiespumante', 0.05, 'L'),
    ('Durazno Importado', 'Agua', 2640, 'L'),

    ('Mango', 'Azúcar', 100, 'kg'), ('Mango', 'CMC', 2.4, 'kg'), ('Mango', 'Goma', 2.4, 'kg'),
    ('Mango', 'Ácido Cítrico', 5.1, 'kg'), ('Mango', 'Ácido Ascórbico', 1.09, 'kg'), ('Mango', 'Aroma', 0.5, 'L'),
    ('Mango', 'Sucralosa', 0.113, 'kg'), ('Mango', 'Acesulfame', 0.124, 'kg'), ('Mango', 'Antiespumante', 0.05, 'L'),
    ('Mango', 'Agua', 1840, 'L'),

    ('Coctel', 'Azúcar', 475, 'kg'), ('Coctel', 'CMC', 3.1, 'kg'), ('Coctel', 'Goma', 4.4, 'kg'),
    ('Coctel', 'Ácido Cítrico', 10, 'kg'), ('Coctel', 'Ácido Ascórbico', 3.4, 'kg'), ('Coctel', 'Aroma', 0, 'L'),
    ('Coctel', 'Sucralosa', 0.216, 'kg'), ('Coctel', 'Acesulfame', 0.238, 'kg'), ('Coctel', 'Antiespumante', 0.13, 'L'),
    ('Coctel', 'Agua', 7350, 'L'),

    ('Manzana/Pera', 'Azúcar', 100, 'kg'), ('Manzana/Pera', 'CMC', 3.1, 'kg'), ('Manzana/Pera', 'Goma', 2.6, 'kg'),
    ('Manzana/Pera', 'Ácido Cítrico', 5, 'kg'), ('Manzana/Pera', 'Ácido Ascórbico', 1.09, 'kg'), ('Manzana/Pera', 'Aroma', 0.8, 'L'),
    ('Manzana/Pera', 'Sucralosa', 0.129, 'kg'), ('Manzana/Pera', 'Acesulfame', 0.129, 'kg'), ('Manzana/Pera', 'Antiespumante', 0, 'L'),
    ('Manzana/Pera', 'Agua', 2540, 'L'),

    ('Clarificado', 'Azúcar', 0, 'kg'), ('Clarificado', 'CMC', 0, 'kg'), ('Clarificado', 'Goma', 0, 'kg'),
    ('Clarificado', 'Ácido Cítrico', 1, 'kg'), ('Clarificado', 'Ácido Ascórbico', 0.78, 'kg'), ('Clarificado', 'Aroma', 0.75, 'L'),
    ('Clarificado', 'Sucralosa', 0, 'kg'), ('Clarificado', 'Acesulfame', 0, 'kg'), ('Clarificado', 'Antiespumante', 0, 'L'),
    ('Clarificado', 'Agua', 1500, 'L'),

    ('Guayaba', 'Azúcar', 100, 'kg'), ('Guayaba', 'CMC', 0.09, 'kg'), ('Guayaba', 'Goma', 1.9, 'kg'),
    ('Guayaba', 'Ácido Cítrico', 3.4, 'kg'), ('Guayaba', 'Ácido Ascórbico', 1.2, 'kg'), ('Guayaba', 'Aroma', 1.36, 'L'),
    ('Guayaba', 'Sucralosa', 0.118, 'kg'), ('Guayaba', 'Acesulfame', 0.129, 'kg'), ('Guayaba', 'Antiespumante', 0.05, 'L'),
    ('Guayaba', 'Agua', 2100, 'L')
) as i (variante, insumo, cantidad, unidad) on v.familia = 'CLASICOS' and v.nombre = i.variante;

-- PREMIUM: algunas variantes usan menos insumos (ej. Agua de Coco solo
-- lleva Pectina y Ácido Ascórbico) — es real, no un hueco de datos.
insert into formula_insumos (variante_id, insumo, cantidad, unidad)
select v.id, i.insumo, i.cantidad, i.unidad
from formula_variantes v
join (
  values
    ('Naranja 100%', 'Pectina', 0, 'kg'), ('Naranja 100%', 'Ácido Cítrico', 0, 'kg'), ('Naranja 100%', 'Ácido Ascórbico', 1.2, 'kg'),
    ('Naranja 100%', 'Aroma', 1, 'L'), ('Naranja 100%', 'Sucralosa', 0, 'kg'), ('Naranja 100%', 'Acesulfame', 0, 'kg'),
    ('Naranja 100%', 'Antiespumante', 0.06, 'L'), ('Naranja 100%', 'Agua', 2460, 'L'),

    ('Clarificado', 'Pectina', 0, 'kg'), ('Clarificado', 'Ácido Cítrico', 1, 'kg'), ('Clarificado', 'Ácido Ascórbico', 0.78, 'kg'),
    ('Clarificado', 'Aroma', 0.75, 'L'), ('Clarificado', 'Sucralosa', 0, 'kg'), ('Clarificado', 'Acesulfame', 0, 'kg'),
    ('Clarificado', 'Antiespumante', 0, 'L'), ('Clarificado', 'Agua', 1500, 'L'),

    ('Agua de Coco', 'Pectina', 0, 'kg'), ('Agua de Coco', 'Ácido Ascórbico', 0.017, 'kg'),

    ('Piña 100%', 'Pectina', 6, 'kg'), ('Piña 100%', 'Ácido Cítrico', 0, 'kg'), ('Piña 100%', 'Ácido Ascórbico', 0.6, 'kg'),
    ('Piña 100%', 'Aroma', 0, 'L'), ('Piña 100%', 'Sucralosa', 0, 'kg'), ('Piña 100%', 'Acesulfame', 0, 'kg'),
    ('Piña 100%', 'Antiespumante', 0.08, 'L'), ('Piña 100%', 'Agua', 2180, 'L')
) as i (variante, insumo, cantidad, unidad) on v.familia = 'PREMIUM' and v.nombre = i.variante;

-- TE: unidad base "kit" en vez de "tambor".
insert into formula_insumos (variante_id, insumo, cantidad, unidad)
select v.id, i.insumo, i.cantidad, i.unidad
from formula_variantes v
join (
  values
    ('Té de Limón', 'Extracto de té 270CWS', 12.5, 'kg'), ('Té de Limón', 'Extracto de té 2850CWS', 2.7, 'kg'), ('Té de Limón', 'Azúcar', 250, 'kg'),
    ('Té de Limón', 'Ácido Cítrico', 12.5, 'kg'), ('Té de Limón', 'Ácido Ascórbico', 2, 'kg'), ('Té de Limón', 'Sucralosa', 0.335, 'kg'),
    ('Té de Limón', 'Acesulfame', 0.37, 'kg'), ('Té de Limón', 'Aroma', 1.8, 'L'), ('Té de Limón', 'Antiespumante', 0.1, 'L'),

    ('Té de Durazno', 'Extracto de té 270CWS', 12.5, 'kg'), ('Té de Durazno', 'Extracto de té 2850CWS', 2.7, 'kg'), ('Té de Durazno', 'Azúcar', 250, 'kg'),
    ('Té de Durazno', 'Ácido Cítrico', 12.5, 'kg'), ('Té de Durazno', 'Ácido Ascórbico', 2, 'kg'), ('Té de Durazno', 'Sucralosa', 0.335, 'kg'),
    ('Té de Durazno', 'Acesulfame', 0.37, 'kg'), ('Té de Durazno', 'Aroma', 1.6, 'L'), ('Té de Durazno', 'Antiespumante', 0.1, 'L')
) as i (variante, insumo, cantidad, unidad) on v.familia = 'TE' and v.nombre = i.variante;

create or replace function listar_formulas()
returns table (
  variante_id uuid,
  familia text,
  variante text,
  unidad_base text,
  activo boolean,
  insumo text,
  cantidad numeric,
  unidad text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.id, v.familia, v.nombre, v.unidad_base, v.activo, i.insumo, i.cantidad, i.unidad
  from formula_variantes v
  join formula_insumos i on i.variante_id = v.id
  order by v.familia, v.nombre, i.insumo;
end;
$$;

grant execute on function listar_formulas() to anon, authenticated;

-- ============================================================
-- CALCULADORA DE CONTEO POR PESO — pitillos y tapas
-- ============================================================
-- Mismo espíritu que Calculadora de Bobina pero con balanza: se pesa
-- una caja de pitillos o tapas y da cuántas unidades quedan.
-- Fuente: hoja "Cálculos", bloques "CAJA DE PITILLOS ...", "PITILLO
-- ARCEVID", "TAPAS TBA 1000", "TAPAS TPA 330".
--
-- unidades = REDONDEAR((peso_actual_kg - peso_vacio_kg) / peso_unidad_g * 1000)
--
-- Pitillos redondean hacia abajo (conservador); tapas hacia arriba.
-- La tapa TPA-330 corrige un bug real del Excel: la fórmula original
-- usaba por error el peso de la tapa TBA-1000 (3.8 g) en vez del
-- propio (3.6 g, confirmado con el usuario), que ya estaba tabulado
-- al lado sin usarse.
-- ============================================================

create table tipos_conteo_peso (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  peso_vacio_kg numeric not null,
  peso_unidad_g numeric not null,
  redondeo text not null check (redondeo in ('ARRIBA', 'ABAJO')),
  activo boolean not null default true
);

insert into tipos_conteo_peso (nombre, peso_vacio_kg, peso_unidad_g, redondeo) values
  ('Pitillo Selva/Fantasti (caja 25.000u)', 1.1, 0.4, 'ABAJO'),
  ('Pitillo MegaBox (caja 32.000u)', 2.5, 0.5, 'ABAJO'),
  ('Pitillo Arcevid', 2.0, 0.46, 'ABAJO'),
  ('Tapa Helicap TBA-1000', 0.8, 3.8, 'ARRIBA'),
  ('Tapa TPA-330', 0.8, 3.6, 'ARRIBA');

alter table tipos_conteo_peso enable row level security;

create or replace function listar_tipos_conteo_peso()
returns table (
  tipo_id uuid,
  nombre text,
  peso_vacio_kg numeric,
  peso_unidad_g numeric,
  redondeo text,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select t.id, t.nombre, t.peso_vacio_kg, t.peso_unidad_g, t.redondeo, t.activo
  from tipos_conteo_peso t
  order by t.nombre;
end;
$$;

grant execute on function listar_tipos_conteo_peso() to anon, authenticated;

create trigger auditar_formula_variantes after insert or update or delete on formula_variantes for each row execute function auditar_cambio();
create trigger auditar_formula_insumos after insert or update or delete on formula_insumos for each row execute function auditar_cambio();
create trigger auditar_tipos_conteo_peso after insert or update or delete on tipos_conteo_peso for each row execute function auditar_cambio();
