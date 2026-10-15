-- ============================================================
-- CORRECCIÓN PUNTUAL: contadores cargados dos veces — 2026-10-15
-- ============================================================
-- Turno A20261015_T1G1 (jbello). turno_id: 0d7b7da8-24cb-4d20-973b-8b9f5e30f82f
--
-- Producto Terminado, después de cerrar una corrida, seguía mostrando la
-- tarjeta "esperando su PT" con el contador vacío (el PT cerraba la corrida
-- en la base pero la pantalla no se enteraba). Javier volvió a escribir el
-- contador y, como el contador SUMA, quedó doble. Se arregla en la app
-- (FilaProductoTerminado refresca las corridas al guardar).
--
-- Se borra la carga repetida de cada corrida:
--   Línea 1 lote 0002:  1356 / 1215  x2  -> queda una
--   Línea 3 lote 0002:  2696 / 2613  x2  -> queda una
--   Línea 1 lote 0003: 15185 / 14768 + 18547 / 17546 -> queda 15185
--   Línea 3 lote 0003: 18547 / 17546 x2  -> queda una
--
-- Plano, sin comandos de psql: pegar en el SQL editor de Supabase.
-- ============================================================


-- 0. DIAGNÓSTICO (solo lectura): tienen que salir 8 filas.
select c.id, l.codigo as linea, c.envases_llenadora, c.envases_buenos, c.created_at
from contadores c
join lineas l on l.id = c.linea_id
where c.turno_id = '0d7b7da8-24cb-4d20-973b-8b9f5e30f82f'
order by l.codigo, c.created_at;


-- 1. BORRAR las 4 repetidas.
delete from contadores
where turno_id = '0d7b7da8-24cb-4d20-973b-8b9f5e30f82f'
  and id in (
    '1151d3d8-b151-453b-b45f-3e142331d7e2',  -- Línea 1 lote 0002, 1356 (la 2.ª)
    'f26a1c57-e912-46a6-858d-4e6a545b704d',  -- Línea 3 lote 0002, 2696 (la 2.ª)
    'b0f14c31-be7c-4410-91bf-55d48708e589',  -- Línea 1 lote 0003, 18547 (sobra; queda 15185)
    '60b697ad-e3a7-4a4c-bf51-717be7ee12a3'   -- Línea 3 lote 0003, 18547 (la 2.ª)
  );
-- Tiene que decir: DELETE 4


-- 2. VERIFICAR: una fila por corrida.
--    Línea 1: 1356 y 15185 · Línea 3: 2696 y 18547
select l.codigo as linea, c.turno_linea_id, sum(c.envases_llenadora) as llenadora, sum(c.envases_buenos) as buenos, count(*) as filas
from contadores c
join lineas l on l.id = c.linea_id
where c.turno_id = '0d7b7da8-24cb-4d20-973b-8b9f5e30f82f'
group by l.codigo, c.turno_linea_id
order by l.codigo;
