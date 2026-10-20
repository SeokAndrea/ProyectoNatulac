-- ============================================================
-- Ensayo de 20261111190000_corridas_entregadas_congeladas.sql
-- Correr DESPUÉS de aplicar la migración. Todo termina en ROLLBACK:
-- no deja cambios.
--
-- Usa la corrida real f4ad3fc0 (Línea 1 del T2 de Fernando del 19/10,
-- entregada a las 22:30). Las tres filas del final deben decir true.
-- ============================================================
begin;

create temporary table ensayo_antes on commit drop as
select lote_id, lote, sabor_id from turno_lineas where id = 'f4ad3fc0-8bbf-4833-b312-074474aa8fb0';

-- 1. Una función "por lote y activa" intenta moverla a otro lote (el 0005 del T1).
update turno_lineas
set lote_id = '1664f1b3-8a11-4342-bbf4-fc3faf680ba1', lote = '0005'
where id = 'f4ad3fc0-8bbf-4833-b312-074474aa8fb0';

select 'entregada no se mueve' as prueba,
       tl.lote_id is not distinct from a.lote_id and tl.lote is not distinct from a.lote as ok
from turno_lineas tl, ensayo_antes a
where tl.id = 'f4ad3fc0-8bbf-4833-b312-074474aa8fb0';

-- 2. Con el permiso de corrección, sí se mueve (lo usa el script de arreglo).
select set_config('natulac.corregir_corrida_entregada', 'on', true);
update turno_lineas
set lote_id = '1664f1b3-8a11-4342-bbf4-fc3faf680ba1', lote = '0005'
where id = 'f4ad3fc0-8bbf-4833-b312-074474aa8fb0';

select 'corrección a mano sí la mueve' as prueba, lote = '0005' as ok
from turno_lineas where id = 'f4ad3fc0-8bbf-4833-b312-074474aa8fb0';

-- 3. Las funciones nuevas quedaron con sus revisiones.
-- (string_agg: puede haber versiones viejas con otros parámetros)
select 'funciones con las revisiones nuevas' as prueba,
       position('entregada_en is null' in (select string_agg(pg_get_functiondef(oid), '') from pg_proc where proname = 'revisar_cierre_de_lote')) > 0
   and position('v_turno_dup' in (select string_agg(pg_get_functiondef(oid), '') from pg_proc where proname = 'registrar_contador')) > 0
   and position('v_turno_dup' in (select string_agg(pg_get_functiondef(oid), '') from pg_proc where proname = 'registrar_producto_terminado')) > 0
   and position('continuación del tuyo' in (select string_agg(pg_get_functiondef(oid), '') from pg_proc where proname = 'finalizar_turno')) > 0 as ok;

rollback;
