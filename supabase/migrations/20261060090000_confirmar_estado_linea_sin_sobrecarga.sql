-- ============================================================
-- confirmar_estado_linea: quitar la sobrecarga vieja de 3 argumentos
-- ============================================================
-- 20261040090000 creó confirmar_estado_linea(text, uuid, uuid, text) con
-- p_momento default 'INICIO', pero la versión de 3 argumentos de
-- 20260933090000 nunca se borró. Al llamar con 3 argumentos (como hace la
-- app), PostgREST no puede elegir entre las dos y devuelve "Could not
-- choose the best candidate function" — Confirmar línea no funcionaba
-- (Javier Bello y Deivis Pérez, 2026-09-17/18). La versión de 4
-- argumentos cubre las llamadas de 3 gracias al default.
-- ============================================================

drop function if exists confirmar_estado_linea(text, uuid, uuid);
