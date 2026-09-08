-- Prueba de 20261016090000_transferencias_log.sql contra la base LOCAL.
--   cat scripts/test-transferencias-log.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo dentro de una transacción con ROLLBACK: no deja nada.
--
-- Verifica que cada transferencia deja UNA fila en `transferencias` con
-- el motivo pasado, el modo correcto (null si el destino estaba Limpio)
-- y los litros movidos; y que un motivo inválido se rechaza.

begin;

\set turno '''eeeeeeee-0000-0000-0000-000000000001'''
\set lote_o '''e0e0e0e0-0000-0000-0000-000000000001'''
\set lote_d '''e1e1e1e1-0000-0000-0000-000000000001'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_TRANSF_LOG',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

-- Origen T1 (LISTO 4000 L) + Destino T2 (LISTO 2000 L, mismo sabor) -> modo LIQUIDO
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_o::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0001', 0,
       (select id from usuarios where usuario='jguerrero'), 4000, 6000, now();
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_d::uuid, :turno::uuid, 2, (select id from sabores order by nombre limit 1), '0002', 0,
       (select id from usuarios where usuario='jguerrero'), 2000, 3000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 4000, '0001', :lote_o::uuid,
       (select id from usuarios where usuario='jguerrero');
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 2, (select id from sabores order by nombre limit 1), 'LISTO', 2000, '0002', :lote_d::uuid,
       (select id from usuarios where usuario='jguerrero');
insert into recepcion_tanques (turno_id, numero_tanque, condicion, actualizada_por)
select :turno::uuid, 3, 'LIMPIO', (select id from usuarios where usuario='jguerrero');

\echo '=== A. Transferencia LIQUIDO con motivo ENRUTAR_MANIFOLD ==='
select transferir_tanque('jguerrero', :turno::uuid, 1::smallint, 2::smallint, 'LIQUIDO', 'ENRUTAR_MANIFOLD') is not null as rpc_ok;

select tanque_origen, tanque_destino, litros, modo, motivo
from transferencias where turno_id = :turno::uuid;
\echo '(esperado: 1  2  4000.00  LIQUIDO  ENRUTAR_MANIFOLD)'

\echo ''
\echo '=== B. Transferencia a tanque LIMPIO: modo debe quedar NULL ==='
-- ahora T2 quedó con 6000 L; lo mando al T3 (Limpio) con CONSOLIDAR_RESTOS
select transferir_tanque('jguerrero', :turno::uuid, 2::smallint, 3::smallint, 'LOTE', 'CONSOLIDAR_RESTOS') is not null as rpc_ok;

select tanque_origen, tanque_destino, litros, modo, motivo
from transferencias where turno_id = :turno::uuid and tanque_origen = 2;
\echo '(esperado: 2  3  6000.00  <null>  CONSOLIDAR_RESTOS)'

\echo ''
\echo '=== C. Total de filas registradas para el turno ==='
select count(*) as filas_esperado_2 from transferencias where turno_id = :turno::uuid;

\echo ''
\echo '=== D. Motivo inválido -> error ==='
do $$
begin
  perform transferir_tanque('jguerrero', 'eeeeeeee-0000-0000-0000-000000000001'::uuid, 3::smallint, 1::smallint, 'LIQUIDO', 'LIBERAR_LOTE');
  raise exception 'NO FALLÓ (deberia haber rechazado el motivo)';
exception when others then
  raise notice 'OK: rechazado -> %', sqlerrm;
end $$;

rollback;
