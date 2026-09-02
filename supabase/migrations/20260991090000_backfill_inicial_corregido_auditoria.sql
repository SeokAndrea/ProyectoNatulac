-- ============================================================
-- MERMA DE SEMIELABORADO — FASE C: restaurar volumen_inicial_l corrompido
-- ============================================================
-- La Fase A frena la corrupción hacia adelante. Esta migración repara
-- los lotes YA afectados cuyo valor original se puede recuperar del
-- registro de auditoría (tabla auditoria, entidad 'preparaciones',
-- disponible desde 20260984090000).
--
-- ÚNICO caso con valor original confiable en la auditoría
-- (ver plan-debug-merma-semielaborado.md §40):
--
--   lote 0001 · tanque 1 · turno A20260901_T1G1 (Danny Fernandez)
--   id: b11c1bad-e873-4571-99a5-902ebb1180ac
--     17:46  nace                     volumen_inicial_l = 18380
--     18:59  PT LÍNEA_2 (2856 L)      volumen_inicial_l = 18380 (intacto)
--     19:12  PT LÍNEA_1 (8160 L)      volumen_inicial_l = 18380 (intacto)
--     19:13  corrección: se tipea 4700  volumen_inicial_l -> 15716  ❌
--            (15716 = 18380 + (4700 - 7364))
--   Se restaura a 18380. Guarda condicionado al valor corrupto exacto:
--   si algo ya lo tocó, no hace nada.
--
-- El resto de los turnos afectados son ANTERIORES al trigger de
-- auditoría (fin de agosto) y su volumen_inicial_l original NO quedó
-- registrado en ningún lado. `tambores × sabor.volumen` no los
-- reconstruye limpio (hay restos de STANDBY / transferencias / correcciones
-- viejas mezclados). Se dejan para revisión manual con la jefa —
-- ver scripts/reporte-fase-c-candidatos.sql. NO se tocan acá.
-- ============================================================

update preparaciones
set volumen_inicial_l = 18380.00
where id = 'b11c1bad-e873-4571-99a5-902ebb1180ac'
  and volumen_inicial_l = 15716.00;
