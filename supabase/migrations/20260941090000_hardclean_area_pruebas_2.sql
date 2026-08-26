-- ============================================================
-- HARDCLEAN #2: borrar todos los turnos del área de PRUEBAS
-- ============================================================
-- Mismo parche que 20260938090000_hardclean_area_pruebas.sql — se
-- volvió a ensuciar el área de Pruebas probando el fix de litros
-- (lotes "DIAGFIX", "ENTREGA-TEST", etc.). Se repite tal cual para
-- dejarla en cero de nuevo antes de armar el flujo de CIP.
-- ============================================================

delete from turnos
where area_id = (select id from areas where codigo = 'PRUEBAS');
