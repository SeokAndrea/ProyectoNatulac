-- Prueba de la Fase A contra la base LOCAL de supabase.
--   cat scripts/test-fase-a.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo dentro de una transacción con ROLLBACK: no deja nada.

begin;

\echo '=== SETUP: lote de 18000 L, ya produjo 11000 (volumen_l = 7000), tanque LISTO ==='

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select '11111111-1111-1111-1111-111111111111', 'TEST_FASE_A',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1,
       'cae14d5a-6f73-48a9-bc96-f81487b327cd'::uuid, '0001', 0,
       (select id from usuarios where usuario='jguerrero'),
       7000, 18000, now();

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select '11111111-1111-1111-1111-111111111111', 1,
       'cae14d5a-6f73-48a9-bc96-f81487b327cd'::uuid, 'LISTO', 7000, '0001',
       '22222222-2222-2222-2222-222222222222',
       (select id from usuarios where usuario='jguerrero');

\echo ''
\echo 'ANTES de la relectura:'
select volumen_inicial_l, volumen_l from preparaciones where id='22222222-2222-2222-2222-222222222222';
select count(*) as filas_ajuste from preparaciones_ajuste where lote_id='22222222-2222-2222-2222-222222222222';

\echo ''
\echo '=== RELECTURA: el supervisor mide el tanque y tipea 4300 (mismo sabor+lote, LISTO->LISTO) ==='
select cambiar_condicion_tanque(
  'jguerrero',
  '11111111-1111-1111-1111-111111111111',
  1::smallint,
  'LISTO',
  'cae14d5a-6f73-48a9-bc96-f81487b327cd'::uuid,
  4300::numeric,
  '0001',
  null,
  null
) is not null as rpc_ok;

\echo ''
\echo 'DESPUES de la relectura:'
select volumen_inicial_l, volumen_l from preparaciones where id='22222222-2222-2222-2222-222222222222';
select volumen_teorico, volumen_real, diferencia
from preparaciones_ajuste where lote_id='22222222-2222-2222-2222-222222222222';

\echo ''
\echo '=== ESPERADO (Fase A) ==='
\echo 'volumen_inicial_l = 18000  (INTACTO — antes del arreglo daba 15300 = 18000 + 4300 - 7000)'
\echo 'volumen_l         = 4300'
\echo 'preparaciones_ajuste: 1 fila  teorico=7000  real=4300  diferencia=-2700'

rollback;
