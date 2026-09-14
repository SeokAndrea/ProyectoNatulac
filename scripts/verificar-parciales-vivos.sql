-- ============================================================
-- PRE-CHEQUEO §2.9 — ¿queda algo vivo que dependa de "parciales"?
-- ============================================================
-- Solo lectura. Plano para el SQL editor de Supabase. Correr ANTES de
-- aplicar la migración de teardown (dropear producto_terminado_parciales +
-- columnas {tiene_parciales, producto_retenido, cajas_retenidas,
-- editado_por, editado_en} + contadores.parcial).
--
-- El frontend ya no puede CREAR una entrega parcial (`ced6b2e`, 2.9), pero
-- las corridas que ya tenían parciales ANTES de ese deploy siguen
-- renderizando en modo incremental para poder cerrarse (plan §2.9). Si
-- alguna de esas corridas sigue sin cerrar, dropear ahora la rompe a mitad
-- de camino. Los 3 chequeos de abajo tienen que dar TODOS en 0 filas antes
-- de aplicar el teardown.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Corridas con parciales que TODAVÍA no cerraron (activa=true o
--    ESPERANDO_PT). Si esto da filas, esas corridas dependen hoy de
--    tiene_parciales/producto_terminado_parciales para poder cerrarse.
-- ------------------------------------------------------------
select
  t.codigo as turno_codigo,
  l.codigo as linea_codigo,
  tl.id as turno_linea_id,
  tl.lote,
  tl.activa,
  tl.finalizada_en,
  pt.tiene_parciales,
  pt.paletas,
  pt.cajas_sueltas,
  (select count(*) from producto_terminado_parciales ptp where ptp.turno_linea_id = tl.id) as cantidad_parciales
from producto_terminado pt
join turno_lineas tl on tl.id = pt.turno_linea_id
join turnos t on t.id = tl.turno_id
join lineas l on l.id = tl.linea_id
where pt.tiene_parciales
  and (tl.activa or tl.finalizada_en is null)
order by t.fecha desc;

-- ------------------------------------------------------------
-- 2. Total histórico de corridas que alguna vez tuvieron parciales
--    (referencia — esto se pierde como detalle de auditoría al dropear
--    producto_terminado_parciales; confirmar que no hace falta conservarlo).
-- ------------------------------------------------------------
select count(*) as corridas_con_parciales_historicas
from producto_terminado
where tiene_parciales;

select count(*) as filas_producto_terminado_parciales
from producto_terminado_parciales;

-- ------------------------------------------------------------
-- 3a. Lecturas de contador marcadas parcial=true en un turno todavía
--     ABIERTO — si esto da filas, ese turno tiene una corrida a mitad de
--     una entrega parcial sin cerrar. BLOQUEANTE si da filas.
-- ------------------------------------------------------------
select
  t.codigo as turno_codigo,
  l.codigo as linea_codigo,
  c.turno_linea_id,
  c.envases_llenadora,
  c.created_at
from contadores c
join turnos t on t.id = c.turno_id
join lineas l on l.id = c.linea_id
where c.parcial and t.estado = 'ABIERTO'
order by c.created_at desc;

-- ------------------------------------------------------------
-- 3b. TODAS las lecturas parcial=true, sin importar el estado del turno
--     (histórico). Estas son checkpoints de referencia — la lectura FINAL
--     no-parcial de la misma corrida ya trae el valor acumulado del mismo
--     contador físico, así que se pueden borrar sin perder el total real.
--     Solo informativo: confirma cuántas filas se van a borrar junto con
--     la columna.
-- ------------------------------------------------------------
select count(*) as lecturas_parciales_historicas,
       count(distinct c.turno_id) as turnos_afectados
from contadores c
where c.parcial;

-- ------------------------------------------------------------
-- 4. producto_retenido / cajas_retenidas: confirmar que ya nadie los usa
--    (se ocultaron de la UI en plan-validar-produccion.md §2, pero las
--    columnas siguen ahí). Si esto da filas con producto_retenido = true,
--    es dato histórico real que se pierde al dropear la columna.
-- ------------------------------------------------------------
select count(*) as filas_con_producto_retenido
from producto_terminado
where producto_retenido;

-- ------------------------------------------------------------
-- 5. editado_por / editado_en: cuántas filas tienen esto seteado (todas
--    deberían venir de corregir_producto_terminado_auditoria, que el plan
--    ya marca como código muerto — confirmar que no queda ningún llamador).
-- ------------------------------------------------------------
select count(*) as filas_editadas_por_auditoria
from producto_terminado
where editado_por is not null;
