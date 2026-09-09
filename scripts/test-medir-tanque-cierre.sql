-- Prueba de 20261026090000_medir_tanque_revisa_cierre.sql contra la base LOCAL.
--   cat scripts/test-medir-tanque-cierre.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- Verifica que medir_tanque, además de corregir volumen_l y dejar el
-- ajuste, revisa el cierre del lote:
--   * medir a un resto > 0  -> lote SIGUE abierto, tanque SIGUE LISTO, hay fila en preparaciones_ajuste.
--   * medir a 0             -> lote se cierra, tanque pasa a SUCIO.
--   * una corrida activa sobre el lote bloquea el cierre aunque se mida 0.

begin;

\set turno '''cececece-0000-0000-0000-000000000001'''
\set lote  '''cececece-0000-0000-0000-000000000009'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_MEDIR_CIERRE',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0009', 0,
       (select id from usuarios where usuario='jguerrero'), 6000, 6000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 6000, '0009', :lote::uuid,
       (select id from usuarios where usuario='jguerrero');

\echo '=== 1. Medir a 500 (resto > 0) -> lote abierto, tanque LISTO, ajuste registrado ==='
select medir_tanque('jguerrero', :turno::uuid, 1::smallint, 500::numeric) is not null as ok;
select
  (select condicion from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_esperado_LISTO,
  (select volumen_l from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_vol_esperado_500,
  (select cerrado_en is null from preparaciones where id = :lote::uuid) as lote_abierto_esperado_true,
  (select count(*) from preparaciones_ajuste where lote_id = :lote::uuid) as ajustes_esperado_1;

\echo ''
\echo '=== 2. Con una corrida ACTIVA sobre el lote, medir a 0 NO cierra ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint) is not null as ok;
select medir_tanque('jguerrero', :turno::uuid, 1::smallint, 0::numeric) is not null as ok;
select
  (select condicion from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_esperado_LISTO,
  (select cerrado_en is null from preparaciones where id = :lote::uuid) as lote_abierto_esperado_true;

\echo ''
\echo '=== 3. Sin corrida activa, medir a 0 -> lote cerrado, tanque SUCIO ==='
select terminar_linea('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa)
) is not null as ok;
-- terminar_linea deja la corrida en ESPERANDO_PT (activa=false). Cerrarla para que el lote no tenga corridas colgando.
select cerrar_corrida_si_esperando(:turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1)
);
select medir_tanque('jguerrero', :turno::uuid, 1::smallint, 0::numeric) is not null as ok;
select
  (select condicion from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_esperado_SUCIO,
  (select cerrado_en is not null from preparaciones where id = :lote::uuid) as lote_cerrado_esperado_true;

rollback;
