-- Smoke test de 20261015090000_renombrar_desvase.sql contra la base LOCAL.
--   cat scripts/test-renombrar-desvase.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- No escribe nada persistente (todo en una transacción con ROLLBACK).

begin;

\echo '=== 1. Los nombres viejos ya no existen ==='
select
  to_regclass('public.reservas_tobos')                      as tabla_reservas_tobos_esperado_null,
  to_regproc('public.envasar_tanque')                       as fn_envasar_tanque_esperado_null,
  to_regproc('public.listar_reservas_tobos')                as fn_listar_reservas_tobos_esperado_null;

\echo ''
\echo '=== 2. Los nombres nuevos existen ==='
select
  to_regclass('public.desvases')                            as tabla_desvases_esperado_no_null,
  to_regproc('public.desvasar_tanque')                      as fn_desvasar_tanque_esperado_no_null,
  to_regproc('public.listar_desvases')                      as fn_listar_desvases_esperado_no_null;

\echo ''
\echo '=== 3. iniciar_preparacion quedó con el parámetro p_desvase_id ==='
select p.proname, pg_get_function_arguments(p.oid) as args
from pg_proc p
where p.proname = 'iniciar_preparacion';
\echo '(la lista de args debe terminar en "p_desvase_id uuid DEFAULT NULL", no "p_reserva_id")'

\echo ''
\echo '=== 4. El trigger de auditoría se llama auditar_desvases y apunta a desvases ==='
select tgname, tgrelid::regclass as tabla
from pg_trigger
where tgname like 'auditar_desvas%' or tgname like 'auditar_reservas_tobo%';

\echo ''
\echo '=== 5. desvasar_tanque() corre de punta a punta ==='
insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select '33333333-3333-3333-3333-333333333333', 'TEST_DESVASE',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 1,
       (select id from sabores order by nombre limit 1), '9001', 0,
       (select id from usuarios where usuario='jguerrero'), 1200, 8000, now();

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select '33333333-3333-3333-3333-333333333333', 1,
       (select id from sabores order by nombre limit 1), 'LISTO', 1200, '9001',
       '44444444-4444-4444-4444-444444444444',
       (select id from usuarios where usuario='jguerrero');

select desvasar_tanque('jguerrero', '33333333-3333-3333-3333-333333333333', 1::smallint) is not null as rpc_ok;

\echo ''
\echo 'Resultado del desvase:'
select
  (select count(*) from desvases where turno_id_origen = '33333333-3333-3333-3333-333333333333') as filas_desvase_esperado_1,
  (select litros   from desvases where turno_id_origen = '33333333-3333-3333-3333-333333333333') as litros_esperado_1200,
  (select cerrado_en is not null from preparaciones where id = '44444444-4444-4444-4444-444444444444') as lote_cerrado_esperado_true,
  (select condicion from recepcion_tanques where turno_id = '33333333-3333-3333-3333-333333333333' and numero_tanque = 1) as tanque_esperado_SUCIO;

rollback;
