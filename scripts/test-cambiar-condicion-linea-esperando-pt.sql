-- Prueba de 20261027090000_cambiar_condicion_linea_bloquea_esperando_pt.sql contra la base LOCAL.
--   cat scripts/test-cambiar-condicion-linea-esperando-pt.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- cambiar_condicion_linea:
--   * con corrida ACTIVA        -> rechaza (guarda vieja).
--   * con corrida ESPERANDO_PT  -> rechaza (guarda nueva).
--   * sin ninguna de las dos    -> deja cambiar el estado.

begin;

\set turno '''dddddddd-0000-0000-0000-000000000001'''
\set lote  '''dddddddd-0000-0000-0000-000000000009'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_COND_LINEA',
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

\echo '=== 1. Corrida ACTIVA -> cambiar_condicion_linea rechaza ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint) is not null as ok;
do $$
begin
  perform cambiar_condicion_linea('jguerrero', 'dddddddd-0000-0000-0000-000000000001'::uuid, 'LINEA_1', 'CIP');
  raise exception 'NO FALLÓ (deberia rechazar: corrida activa)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 2. Corrida ESPERANDO_PT -> cambiar_condicion_linea rechaza ==='
select terminar_linea('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa)
) is not null as ok;
-- ahora la corrida quedó activa=false, finalizada_en NULL (ESPERANDO_PT)
do $$
begin
  perform cambiar_condicion_linea('jguerrero', 'dddddddd-0000-0000-0000-000000000001'::uuid, 'LINEA_1', 'SIN_PROGRAMACION');
  raise exception 'NO FALLÓ (deberia rechazar: corrida esperando PT)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 3. Sin corrida activa ni esperando PT -> deja cambiar ==='
select cerrar_corrida_si_esperando(:turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1)
);
select cambiar_condicion_linea('jguerrero', :turno::uuid, 'LINEA_1', 'CAMBIO_PRESENTACION') is not null as ok;
select condicion from lineas_estado
where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1');

rollback;
