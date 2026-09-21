-- Corrección puntual del dato histórico: Turno 2 de Javier, 2026-09-15
-- (A20260915_T2G1), tanque 3 / lote 0002 (aea3ca6b-33f8-42f7-8ce8-c97866cc3ef4).
--
-- El cierre forzado (relevo sin finalizar, Deivis arrancó su turno a
-- las 22:30:12) congeló volumenes_lote_cierre con 2.960 L — el valor
-- que tenía el tanque 98 segundos ANTES de que Deivis lo corrigiera a
-- 2.000 L (el real). Con el fix de 20261039 esto ya no vuelve a pasar
-- hacia adelante, pero ese registro específico ya quedó guardado mal
-- y no se corrige solo. Esto es la MISMA operación que medir_tanque
-- hace ahora automáticamente, aplicada a mano una sola vez.
--
-- Esto es un UPDATE directo sobre la única base que hay (no existe un
-- Supabase de pruebas separado — el "servidor de pruebas" en :4035 es
-- solo el front hablándole a este mismo proyecto). Corré los 3 pasos
-- de abajo COMO EJECUCIONES SEPARADAS en el SQL Editor del Dashboard
-- (https://supabase.com/dashboard/project/ssylfbryvpwdwscngjnn/sql/new)
-- — cada "Run" en ese editor confirma su propia sentencia sola, así
-- que no hace falta (ni conviene) envolver esto en BEGIN/COMMIT.

-- ------------------------------------------------------------
-- PASO 1 — mirar el valor de hoy (de solo lectura, no cambia nada).
-- Tiene que dar 2960.
-- ------------------------------------------------------------
select codigo, volumenes_lote_cierre -> 'aea3ca6b-33f8-42f7-8ce8-c97866cc3ef4' as lote_0002
from turnos
where codigo = 'A20260915_T2G1';

-- ------------------------------------------------------------
-- PASO 2 — la corrección. Correr SOLO después de confirmar el Paso 1.
-- ------------------------------------------------------------
update turnos
set volumenes_lote_cierre = jsonb_set(
      volumenes_lote_cierre,
      array['aea3ca6b-33f8-42f7-8ce8-c97866cc3ef4'],
      '2000'::jsonb
    )
where codigo = 'A20260915_T2G1';

-- ------------------------------------------------------------
-- PASO 3 — repetir el Paso 1 para confirmar. Tiene que dar 2000.
-- (El "inicio" que Deivis ve en su turno se lee en vivo de este mismo
-- campo, así que se autocorrige solo — no hace falta tocar su turno.)
-- ------------------------------------------------------------
select codigo, volumenes_lote_cierre -> 'aea3ca6b-33f8-42f7-8ce8-c97866cc3ef4' as lote_0002
from turnos
where codigo = 'A20260915_T2G1';
