-- Prueba de 20261020090000_iniciar_preparacion_advisory_lock.sql contra la base LOCAL.
--   cat scripts/test-iniciar-preparacion-advisory-lock.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- Este script verifica que iniciar_preparacion sigue funcionando y que la
-- guarda de número de lote repetido sigue cortando. La serialización real
-- (el pg_advisory_xact_lock) solo se observa con DOS sesiones concurrentes
-- y no se puede probar en un solo script; el arreglo es que la 2a llamada
-- espera a la 1a y después ve su fila en el `exists`.

begin;

\set turno '''cccccccc-1111-1111-1111-000000000001'''
insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_ADVLOCK',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';
-- 3 tanques LIMPIO
insert into recepcion_tanques (turno_id, numero_tanque, condicion, actualizada_por)
select :turno::uuid, g, 'LIMPIO', (select id from usuarios where usuario='jguerrero')
from generate_series(1,3) g;

\echo '=== 1. Preparar el lote 0007 en el tanque 1 -> OK ==='
select iniciar_preparacion(
  'jguerrero', :turno::uuid, 1::smallint,
  (select id from sabores order by nombre limit 1),
  '0007', 10, 0, 0, 0
) is not null as ok;

select numero_tanque, lote, cerrado_en is null as abierto
from preparaciones where turno_id = :turno::uuid;

\echo ''
\echo '=== 2. Mismo lote 0007, mismo sabor, otro tanque -> RECHAZO ==='
do $$
begin
  perform iniciar_preparacion(
    'jguerrero', 'cccccccc-1111-1111-1111-000000000001'::uuid, 2::smallint,
    (select id from sabores order by nombre limit 1),
    '0007', 10, 0, 0, 0
  );
  raise exception 'NO FALLÓ (deberia rechazar: lote 0007 ya abierto)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 3. finalizar_lote ya no existe ==='
select to_regproc('public.finalizar_lote') as esperado_null;

rollback;
