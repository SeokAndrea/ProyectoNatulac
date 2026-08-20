-- ============================================================
-- VELOCIDADES DE LLENADORA por línea + presentación
-- ============================================================
-- Dato real pasado por el analista de Aséptico. A diferencia de lo
-- que se había asumido al principio, la velocidad NO depende solo
-- de la presentación: depende de la combinación (línea, presentación),
-- y cada combinación tiene varias velocidades válidas para elegir
-- (no una sola). Por eso esto es una tabla aparte en vez de una
-- columna en "presentaciones".
--
-- litros_hora = envases_hora × (volumen_ml de la presentación / 1000).
-- Se guarda explícito (no calculado) porque así vino en la planilla
-- y evita tener que hacer el join solo para mostrarlo.
--
-- PENDIENTE: no hay dato de velocidad para la presentación de 500 ml
-- en ninguna línea todavía.
-- ============================================================

create table velocidades_llenadora (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references lineas (id),
  presentacion_id uuid not null references presentaciones (id),
  maquina text not null,
  envases_hora integer not null,
  litros_hora numeric(10, 2) not null,
  activo boolean not null default true,
  unique (linea_id, presentacion_id, envases_hora)
);

alter table velocidades_llenadora enable row level security;

insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora)
select l.id, p.id, v.maquina, v.envases_hora, v.litros_hora
from (
  values
    ('Línea 1', 1000, 'A3Flex', 6000, 6000),
    ('Línea 1', 1000, 'A3Flex', 7000, 7000),
    ('Línea 1', 1000, 'A3Flex', 8000, 8000),
    ('Línea 2', 250, 'A3 CompactFlex', 7500, 1875),
    ('Línea 2', 250, 'A3 CompactFlex', 9000, 2250),
    ('Línea 3', 250, 'A3 CompactFlex', 7500, 1875),
    ('Línea 3', 250, 'A3 CompactFlex', 9000, 2250),
    ('Línea 3', 330, 'A3 CompactFlex', 9000, 2970),
    ('Línea 3', 200, 'A3 CompactFlex', 9000, 1800)
) as v (linea_nombre, volumen_ml, maquina, envases_hora, litros_hora)
join lineas l on l.nombre = v.linea_nombre
join presentaciones p on p.volumen_ml = v.volumen_ml;
