-- Prueba de 20261028090000_finalizar_turno_exige_resolver_corrida_activa.sql contra la base LOCAL.
--   cat scripts/test-finalizar-turno-corrida-activa.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- Case 6: finalizar_turno
--   * con corrida ACTIVA sin entregar        -> rechaza (nombra la línea).
--   * después de Entregar línea               -> deja finalizar.
--   * (rama alternativa) después de Terminar + PT -> deja finalizar.

begin;

\set turno '''eeeeeeee-0000-0000-0000-000000000001'''
\set lote  '''eeeeeeee-0000-0000-0000-000000000015'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_CASE6',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_2'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0015', 0,
       (select id from usuarios where usuario='jguerrero'), 6000, 6000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 6000, '0015', :lote::uuid,
       (select id from usuarios where usuario='jguerrero');

select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 500, 4000, 4000::numeric, 1::smallint) is not null as ok;

\echo '=== 1. Finalizar con LINEA_1 activa sin entregar -> RECHAZA ==='
do $$
begin
  perform finalizar_turno('eeeeeeee-0000-0000-0000-000000000001'::uuid, current_date, current_time);
  raise exception 'NO FALLÓ (deberia rechazar: LINEA_1 sigue activa)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 2. Cargar PT 0/0 del tramo + Entregar línea -> deja finalizar ==='
select registrar_producto_terminado(
  :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa),
  'LINEA_1',
  (select sabor_id from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1),
  500, 0, 0, 'jguerrero'
) is not null as ok_pt;

select entregar_corrida('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa)
) is not null as ok_entregar;

select finalizar_turno(:turno::uuid, current_date, current_time);
select estado from turnos where id = :turno::uuid;   -- esperado: CERRADO

rollback;
