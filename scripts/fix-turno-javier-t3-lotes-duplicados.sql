-- ============================================================
-- CORRECCIÓN PUNTUAL: Turno 3 de Javier — Lote 0009 corrido 7 veces
-- ============================================================
-- Turno A20260908_T3G1 (jbello, 2026-09-08 -> 09).
-- turno_id: 618a9d9b-bf11-4f1e-bb43-306c111f3cb9
--
-- Línea 1 se activó 7 veces sobre el mismo lote (0009 / lote_id
-- 4e5fd387-3971-4263-aff4-74d80dcdc57d). 6 de esas corridas tienen su
-- propio Producto Terminado -> ~100.980 L cargados contra un lote de
-- ~14.000 L. Hay que dejar UNA sola corrida con la producción real y
-- borrar las otras (con su PT, sus contadores y sus parciales).
--
-- La causa (guarda antiduplicados caída en 20261018) se arregla en la
-- migración 20261025090000_reponer_antiduplicados_corrida.sql — subir
-- esa ANTES o junto con esta limpieza, si no el turno se vuelve a
-- ensuciar.
--
-- Plano, sin comandos de psql: pegar en el SQL editor de Supabase.
-- Correr bloque por bloque.
-- ============================================================


-- ------------------------------------------------------------
-- 0. DIAGNÓSTICO (solo lectura). Revisar las 7 corridas de Línea 1
--    sobre el Lote 0009, su PT y sus contadores. Definir cuál corrida
--    es la BUENA y cuántas paletas/cajas reales lleva (dato de Javier /
--    del papel). Las llenadoras rondan 11.853 envases en TODAS -> es el
--    mismo contador releído: la producción real es UNA corrida de
--    ~11 paletas de 1000 ml.
-- ------------------------------------------------------------
select
  tl.id            as corrida_id,
  tl.activada_en,
  tl.finalizada_en,
  tl.activa,
  tl.lote_terminado_en,
  pt.id            as pt_id,
  pt.paletas,
  pt.cajas_sueltas,
  pt.litros_producidos,
  pt.tiene_parciales,
  (select count(*) from producto_terminado_parciales x where x.turno_linea_id = tl.id) as parciales,
  (select count(*) from contadores c where c.turno_linea_id = tl.id)                   as contadores,
  (select max(c.envases_llenadora) from contadores c where c.turno_linea_id = tl.id)   as llenadora_max
from turno_lineas tl
left join producto_terminado pt on pt.turno_linea_id = tl.id
where tl.turno_id = '618a9d9b-bf11-4f1e-bb43-306c111f3cb9'
  and tl.linea_id = (select id from lineas where codigo = 'LINEA_1')
  and normalizar_lote(tl.lote) = normalizar_lote('0009')
order by tl.activada_en;

-- El lote y el tanque (el lote es de OTRO turno — turno de Danny — y
-- ya lo cerró un turno posterior; esta limpieza NO lo toca, ver §3).
select id, turno_id, numero_tanque, lote, volumen_l, volumen_inicial_l, cerrado_en
from preparaciones where id = '4e5fd387-3971-4263-aff4-74d80dcdc57d';

select numero_tanque, condicion, lote, lote_id, volumen_l, volumen_inicial_l
from recepcion_tanques
where turno_id = '618a9d9b-bf11-4f1e-bb43-306c111f3cb9' and numero_tanque = 1;


-- ------------------------------------------------------------
-- 1. APLICAR. Reemplazar 'PEGAR-CORRIDA-BUENA' por el corrida_id que se
--    queda (del paso 0), y NN_PALETAS / NN_CAJAS por la producción
--    real de esa corrida. Corre dentro de una transacción y termina en
--    ROLLBACK: muestra el ANTES/DESPUÉS sin tocar nada. Si el DESPUÉS
--    está bien, cambiar `rollback;` por `commit;` y volver a correr.
-- ------------------------------------------------------------
begin;

-- 1a. Corridas de Línea 1 / Lote 0009 de este turno que NO se quedan.
create temporary table _dups on commit drop as
select tl.id
from turno_lineas tl
where tl.turno_id = '618a9d9b-bf11-4f1e-bb43-306c111f3cb9'
  and tl.linea_id = (select id from lineas where codigo = 'LINEA_1')
  and normalizar_lote(tl.lote) = normalizar_lote('0009')
  and tl.id <> 'PEGAR-CORRIDA-BUENA';

-- 1b. Borrar lo que cuelga de esas corridas (FK sin cascade: PT y
--     contadores hay que borrarlos a mano; parciales y validación
--     caen solas, pero se listan por claridad).
delete from producto_terminado_parciales where turno_linea_id in (select id from _dups);
delete from producto_terminado         where turno_linea_id in (select id from _dups);
delete from contadores                 where turno_linea_id in (select id from _dups);   -- contadores_historial cae por cascade
delete from validacion_produccion      where turno_linea_id in (select id from _dups);
delete from turno_lineas               where id in (select id from _dups);

-- 1c. La corrida que se queda: cerrarla y fijar su PT a lo real.
update turno_lineas
set activa = false,
    finalizada_en = coalesce(finalizada_en, now()),
    lote_terminado_en = coalesce(lote_terminado_en, now())
where id = 'PEGAR-CORRIDA-BUENA';

update producto_terminado
set paletas = NN_PALETAS,
    cajas_sueltas = NN_CAJAS,
    updated_at = now()
where turno_linea_id = 'PEGAR-CORRIDA-BUENA';

-- 1d. ANTES/DESPUÉS: las corridas de Línea 1 del turno y su PT.
select tl.id as corrida_id, tl.activada_en, tl.activa, tl.finalizada_en, tl.lote_terminado_en,
       tl.lote, pt.paletas, pt.cajas_sueltas, pt.litros_producidos
from turno_lineas tl
left join producto_terminado pt on pt.turno_linea_id = tl.id
where tl.turno_id = '618a9d9b-bf11-4f1e-bb43-306c111f3cb9'
  and tl.linea_id = (select id from lineas where codigo = 'LINEA_1')
order by tl.activada_en;

-- Suma de PT de Línea 1 en el turno (debería ser ~11.220 L, no ~100.980).
select coalesce(sum(pt.litros_producidos), 0) as pt_linea1_total
from turno_lineas tl
join producto_terminado pt on pt.turno_linea_id = tl.id
where tl.turno_id = '618a9d9b-bf11-4f1e-bb43-306c111f3cb9'
  and tl.linea_id = (select id from lineas where codigo = 'LINEA_1');

rollback;   -- <-- cambiar a commit; cuando el DESPUÉS esté bien


-- ------------------------------------------------------------
-- 2. Después del commit: revisar en Auditoría que "Lote 0009" ya no
--    aparezca multiplicado, y que las estadísticas de merma de
--    semielaborado del turno den un número sensato.
-- ------------------------------------------------------------


-- ============================================================
-- 3. OPCIONAL — ajustar el volumen del lote / tanque
-- ============================================================
-- El lote 4e5fd387 (nº 0009) es del turno de Danny (05824345-…), no
-- del de Javier, y un turno POSTERIOR ya lo cerró
-- (cerrado_en = 2026-09-09 12:13). Su volumen_l quedó en 5.200 y su
-- volumen_inicial_l en 16.860 tras muchas ediciones cruzadas de dos
-- turnos a la vez. NO se toca a ciegas: si hace falta corregirlo, se
-- necesita la medición física real del tanque a esa hora y conviene
-- hacerlo desde el módulo Validar (para eso está) en vez de un UPDATE
-- suelto acá.
