-- ============================================================
-- ACTUALIZACIÓN COMPLETA DE VELOCIDADES DE LLENADORA
-- ============================================================
-- Reemplaza los datos anteriores por los correctos, confirmados por
-- el usuario:
--   - Línea 1 = TB (Tetra Brik): 500 ml y 1000 ml.
--   - Línea 2 y Línea 3 = TP (Tetra Prisma): 250/200/330 ml, mismos
--     números para las dos líneas (hoy Línea 2 está fija en 250, pero
--     podría pasar a 200/330 más adelante).
--
-- No se borran las filas viejas (podrían estar referenciadas desde
-- turno_lineas de turnos ya cerrados) — se desactivan (activo =
-- false) y se cargan estas como las nuevas activas. "maquina" pasa a
-- guardar "TB"/"TP" en vez del nombre de fábrica (A3Flex / A3
-- CompactFlex), que es como el usuario las identifica.
-- ============================================================

update velocidades_llenadora set activo = false;

insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora)
select l.id, p.id, v.maquina, v.envases_hora, v.litros_hora
from (
  values
    ('LINEA_1', 1000, 'TB', 6000, 6000),
    ('LINEA_1', 1000, 'TB', 7000, 7000),
    ('LINEA_1', 1000, 'TB', 8000, 8000),
    ('LINEA_1', 500, 'TB', 3000, 3000),
    ('LINEA_1', 500, 'TB', 3500, 3500),
    ('LINEA_1', 500, 'TB', 4000, 4000),
    ('LINEA_2', 250, 'TP', 7500, 1875),
    ('LINEA_2', 250, 'TP', 9000, 2970),
    ('LINEA_2', 200, 'TP', 7500, 1500),
    ('LINEA_2', 200, 'TP', 9000, 1800),
    ('LINEA_2', 330, 'TP', 7500, 2250),
    ('LINEA_2', 330, 'TP', 9000, 2970),
    ('LINEA_3', 250, 'TP', 7500, 1875),
    ('LINEA_3', 250, 'TP', 9000, 2970),
    ('LINEA_3', 200, 'TP', 7500, 1500),
    ('LINEA_3', 200, 'TP', 9000, 1800),
    ('LINEA_3', 330, 'TP', 7500, 2250),
    ('LINEA_3', 330, 'TP', 9000, 2970)
) as v (linea_codigo, volumen_ml, maquina, envases_hora, litros_hora)
join lineas l on l.codigo = v.linea_codigo
join presentaciones p on p.volumen_ml = v.volumen_ml
on conflict (linea_id, presentacion_id, envases_hora) do update
  set maquina = excluded.maquina, litros_hora = excluded.litros_hora, activo = true;
