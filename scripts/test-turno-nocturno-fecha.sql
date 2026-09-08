-- Prueba de 20261019090000_turno_nocturno_fecha_operativa.sql contra la base LOCAL.
--   cat scripts/test-turno-nocturno-fecha.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- turno_tipos seed: TURNO_1/TURNO_2 no cruzan medianoche; TURNO_3 = 22:30 → 07:00.

begin;

\echo '=== 1. T3 activado 00:30 del 08 -> fecha operativa = 07, codigo con 07 ==='
select iniciar_turno('jguerrero', 'ASEPTICO', 'TURNO_3', 'GRUPO_1', date '2026-09-08', time '00:30') is not null as ok;
select codigo, fecha, hora_inicio
from turnos
where supervisor_id = (select id from usuarios where usuario='jguerrero')
order by created_at desc limit 1;
\echo '(esperado: codigo A20260907_T3G1 · fecha 2026-09-07 · hora 00:30)'

\echo ''
\echo '=== 2. T3 activado 22:45 del 09 (normal) -> fecha 09, sin correr ==='
select iniciar_turno('jguerrero', 'ASEPTICO', 'TURNO_3', 'GRUPO_2', date '2026-09-09', time '22:45') is not null as ok;
select codigo, fecha, hora_inicio
from turnos
where supervisor_id = (select id from usuarios where usuario='jguerrero')
order by created_at desc limit 1;
\echo '(esperado: codigo A20260909_T3G2 · fecha 2026-09-09 · hora 22:45)'

\echo ''
\echo '=== 3. T1 activado 06:30 del 10 -> fecha 10, sin correr (T1 no cruza medianoche) ==='
select iniciar_turno('jguerrero', 'ASEPTICO', 'TURNO_1', 'GRUPO_3', date '2026-09-10', time '06:30') is not null as ok;
select codigo, fecha, hora_inicio
from turnos
where supervisor_id = (select id from usuarios where usuario='jguerrero')
order by created_at desc limit 1;
\echo '(esperado: codigo A20260910_T1G3 · fecha 2026-09-10 · hora 06:30)'

rollback;
