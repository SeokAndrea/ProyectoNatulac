-- ============================================================
-- CORREGIR DATOS REALES: 2 lotes que "Iniciar Preparación" armó mal
-- ============================================================
-- Antes de 20260952090000_preparar_sobre_standby_suma_resto.sql,
-- iniciar_preparacion() no sumaba el resto de un tanque en Standby al
-- preparar encima — ya pasó 2 veces con cargas REALES (no se puede
-- rehacer el proceso físico), hay que corregir los registros a mano:
--
-- 1. Tanque 3, Durazno: lote '0001' (id 4eeaddd0-1016-4856-a145-
--    80ec3faddedd) cerró en Standby con 2598 L. 6 minutos después se
--    preparó encima (lote '0002', id 10a36720-5169-42e3-8407-
--    49f83f6e3665) con volumen_l = 5958 (solo los tambores nuevos, sin
--    los 2598) — YA LIBERADO y con una corrida activa tomando de ahí,
--    así que hay que corregir preparaciones Y recepcion_tanques.
--    Correcto: 5958 + 2598 = 8556.
--
-- 2. Tanque 1, Pera: lote (id ae83b164-c6c3-4ac0-81e1-3b2c9d747341)
--    cerró en Standby con 2160 L. ~1.5 minutos después se preparó
--    encima (id 68811e36-826f-4de9-8c1e-dc484c584c4a) con
--    volumen_l = 16260 (solo tambores nuevos) — TODAVÍA NO liberado
--    (recepcion_tanques.volumen_l sigue en null, condición
--    EN_PREPARACION), así que alcanza con corregir preparaciones; al
--    liberar copia el valor ya corregido. Correcto: 16260 + 2160 = 18420.
--
-- volumen_inicial_l se corrige igual que volumen_l en los dos casos —
-- nada se había consumido todavía de ninguno de los dos lotes nuevos
-- en el momento de esta migración, así que no hay ningún % histórico
-- que quede desalineado.
-- ============================================================

update preparaciones
set volumen_l = 5958.00 + 2598.00,
    volumen_inicial_l = 5958.00 + 2598.00
where id = '10a36720-5169-42e3-8407-49f83f6e3665' and volumen_l = 5958.00;

update recepcion_tanques
set volumen_l = 5958.00 + 2598.00
where lote_id = '10a36720-5169-42e3-8407-49f83f6e3665' and volumen_l = 5958.00;

update preparaciones
set volumen_l = 16260.00 + 2160.00,
    volumen_inicial_l = 16260.00 + 2160.00
where id = '68811e36-826f-4de9-8c1e-dc484c584c4a' and volumen_l = 16260.00;
