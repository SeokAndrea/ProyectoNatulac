-- Prueba de 20261014090000_transferir_cierra_lote_origen_parejo.sql contra
-- la base LOCAL de supabase.
--   cat scripts/test-transferir-cierre-lote.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo dentro de una transacción con ROLLBACK: no deja nada.
--
-- Verifica que en cada modo se cierra (cerrado_en) el lote correcto:
--   LIMPIO   -> cierra el lote ORIGEN            (era el bug: quedaba abierto)
--   LIQUIDO  -> cierra el lote ORIGEN            (lo absorbe el destino)
--   LOTE     -> cierra el lote VIEJO del DESTINO; el ORIGEN sobrevive abierto

begin;

\set turno_a '''aaaaaaaa-0000-0000-0000-000000000001'''
\set turno_b '''bbbbbbbb-0000-0000-0000-000000000002'''
\set turno_c '''cccccccc-0000-0000-0000-000000000003'''
\set lote_a1 '''a1a1a1a1-0000-0000-0000-000000000001'''
\set lote_b1 '''b1b1b1b1-0000-0000-0000-000000000001'''
\set lote_b2 '''b2b2b2b2-0000-0000-0000-000000000002'''
\set lote_c1 '''c1c1c1c1-0000-0000-0000-000000000001'''
\set lote_c2 '''c2c2c2c2-0000-0000-0000-000000000002'''

-- ------------------------------------------------------------------
-- helpers de setup (misma forma que scripts/test-fase-a.sql)
-- ------------------------------------------------------------------
\echo ''
\echo '########## ESCENARIO A — destino LIMPIO ##########'
\echo 'Origen T1: lote LISTO 5000 L (inicial 8000). Destino T2: LIMPIO.'

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno_a::uuid, 'TEST_TRANSF_A',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_a1::uuid, :turno_a::uuid, 1,
       (select id from sabores order by nombre limit 1), '0001', 0,
       (select id from usuarios where usuario='jguerrero'), 5000, 8000, now();

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_a::uuid, 1,
       (select id from sabores order by nombre limit 1), 'LISTO', 5000, '0001', :lote_a1::uuid,
       (select id from usuarios where usuario='jguerrero');

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_a::uuid, 2, null, 'LIMPIO', null, null, null,
       (select id from usuarios where usuario='jguerrero');

select transferir_tanque('jguerrero', :turno_a::uuid, 1::smallint, 2::smallint, 'LIQUIDO') is not null as rpc_ok;

\echo ''
\echo 'RESULTADO A:'
select
  (select cerrado_en is not null from preparaciones where id = :lote_a1::uuid) as origen_cerrado_esperado_true,
  (select condicion from recepcion_tanques where turno_id = :turno_a::uuid and numero_tanque = 2) as destino_condicion_esperado_LISTO,
  (select cerrado_en is null
     from preparaciones
     where turno_id = :turno_a::uuid and numero_tanque = 2 and id <> :lote_a1::uuid) as lote_nuevo_destino_abierto_esperado_true;

-- ------------------------------------------------------------------
\echo ''
\echo '########## ESCENARIO B — modo LIQUIDO (destino con lote) ##########'
\echo 'Origen T1: lote 5000 L (inicial 8000). Destino T2: lote 3000 L (inicial 6000), mismo sabor.'

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno_b::uuid, 'TEST_TRANSF_B',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_b1::uuid, :turno_b::uuid, 1,
       (select id from sabores order by nombre limit 1), '0002', 0,
       (select id from usuarios where usuario='jguerrero'), 5000, 8000, now();

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_b2::uuid, :turno_b::uuid, 2,
       (select id from sabores order by nombre limit 1), '0003', 0,
       (select id from usuarios where usuario='jguerrero'), 3000, 6000, now();

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_b::uuid, 1,
       (select id from sabores order by nombre limit 1), 'LISTO', 5000, '0002', :lote_b1::uuid,
       (select id from usuarios where usuario='jguerrero');

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_b::uuid, 2,
       (select id from sabores order by nombre limit 1), 'LISTO', 3000, '0003', :lote_b2::uuid,
       (select id from usuarios where usuario='jguerrero');

select transferir_tanque('jguerrero', :turno_b::uuid, 1::smallint, 2::smallint, 'LIQUIDO') is not null as rpc_ok;

\echo ''
\echo 'RESULTADO B:'
select
  (select cerrado_en is not null from preparaciones where id = :lote_b1::uuid) as origen_cerrado_esperado_true,
  (select cerrado_en is null     from preparaciones where id = :lote_b2::uuid) as destino_sobrevive_esperado_true,
  (select volumen_inicial_l from preparaciones where id = :lote_b2::uuid) as destino_inicial_esperado_11000;

-- ------------------------------------------------------------------
\echo ''
\echo '########## ESCENARIO C — modo LOTE (identidad del origen gana) ##########'
\echo 'Origen T1: lote 5000 L (inicial 8000). Destino T2: lote 3000 L (inicial 6000), mismo sabor.'

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno_c::uuid, 'TEST_TRANSF_C',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_c1::uuid, :turno_c::uuid, 1,
       (select id from sabores order by nombre limit 1), '0004', 0,
       (select id from usuarios where usuario='jguerrero'), 5000, 8000, now();

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote_c2::uuid, :turno_c::uuid, 2,
       (select id from sabores order by nombre limit 1), '0005', 0,
       (select id from usuarios where usuario='jguerrero'), 3000, 6000, now();

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_c::uuid, 1,
       (select id from sabores order by nombre limit 1), 'LISTO', 5000, '0004', :lote_c1::uuid,
       (select id from usuarios where usuario='jguerrero');

insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno_c::uuid, 2,
       (select id from sabores order by nombre limit 1), 'LISTO', 3000, '0005', :lote_c2::uuid,
       (select id from usuarios where usuario='jguerrero');

select transferir_tanque('jguerrero', :turno_c::uuid, 1::smallint, 2::smallint, 'LOTE') is not null as rpc_ok;

\echo ''
\echo 'RESULTADO C:'
select
  (select cerrado_en is null     from preparaciones where id = :lote_c1::uuid) as origen_sobrevive_esperado_true,
  (select numero_tanque          from preparaciones where id = :lote_c1::uuid) as origen_ahora_en_tanque_esperado_2,
  (select cerrado_en is not null from preparaciones where id = :lote_c2::uuid) as destino_viejo_cerrado_esperado_true,
  (select lote_id = :lote_c1::uuid from recepcion_tanques where turno_id = :turno_c::uuid and numero_tanque = 2) as destino_apunta_al_lote_origen_esperado_true;

\echo ''
\echo '=== ESPERADO ==='
\echo 'A: origen_cerrado = t | destino_condicion = LISTO | lote_nuevo_destino_abierto = t'
\echo 'B: origen_cerrado = t | destino_sobrevive = t | destino_inicial = 11000'
\echo 'C: origen_sobrevive = t | origen_ahora_en_tanque = 2 | destino_viejo_cerrado = t | destino_apunta_al_lote_origen = t'

rollback;
