-- Prueba de 20261021090000_medir_tanque_y_retira_reactivar_descartar.sql contra la base LOCAL.
--   cat scripts/test-medir-tanque.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.

begin;

\set turno '''dddddddd-2222-2222-2222-000000000001'''
\set lote  '''d1d1d1d1-2222-2222-2222-000000000001'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_MEDIR',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

-- Lote de 5000 L (inicial 8000) liberado en el tanque 1, tanque LISTO.
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0001', 0,
       (select id from usuarios where usuario='jguerrero'), 5000, 8000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 5000, '0001', :lote::uuid,
       (select id from usuarios where usuario='jguerrero');

\echo '=== 1. Medir el tanque 1: real = 4300 (el sistema tenia 5000) ==='
select medir_tanque('jguerrero', :turno::uuid, 1::smallint, 4300::numeric) is not null as ok;

select
  (select volumen_l from preparaciones where id = :lote::uuid) as lote_volumen_esperado_4300,
  (select volumen_inicial_l from preparaciones where id = :lote::uuid) as lote_inicial_esperado_8000_INTACTO,
  (select volumen_l from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_volumen_esperado_4300;

select volumen_teorico, volumen_real, diferencia
from preparaciones_ajuste where lote_id = :lote::uuid;
\echo '(esperado: teorico 5000 · real 4300 · diferencia -700)'

\echo ''
\echo '=== 2. reactivar_lote / descartar_resto_tanque ya no existen ==='
select
  to_regproc('public.reactivar_lote')          as reactivar_esperado_null,
  to_regproc('public.descartar_resto_tanque')  as descartar_esperado_null,
  to_regproc('public.medir_tanque')            as medir_esperado_no_null;

rollback;
