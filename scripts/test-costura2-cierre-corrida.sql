-- Prueba de 20261018090000_costura2_cierre_corrida_en_dos_pasos.sql contra la base LOCAL.
--   cat scripts/test-costura2-cierre-corrida.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- Verifica el modelo de dos estados:
--   Detener línea  -> corrida en ESPERANDO_PT (activa=false, finalizada_en NULL), tanque INTACTO
--   Cargar PT      -> corrida cerrada; si el lote quedó en 0 -> lote cerrado + tanque SUCIO
--   finalizar_turno -> rechaza mientras haya una corrida en ESPERANDO_PT

begin;

\set turno '''f0f0f0f0-0000-0000-0000-000000000001'''
\set lote  '''f1f1f1f1-0000-0000-0000-000000000001'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_COSTURA2',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

-- Lote de 6000 L liberado en el tanque 1, tanque LISTO.
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0001', 0,
       (select id from usuarios where usuario='jguerrero'), 6000, 6000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 6000, '0001', :lote::uuid,
       (select id from usuarios where usuario='jguerrero');

\echo '=== 1. Activar la Línea 1 sobre el tanque 1 ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint) is not null as ok;

\echo ''
\echo '=== 2. No se puede activar OTRA corrida en la Línea 1 (ya tiene una) ==='
do $$
begin
  perform activar_linea('jguerrero', 'f0f0f0f0-0000-0000-0000-000000000001'::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint);
  raise exception 'NO FALLÓ (deberia rechazar: la linea ya tiene corrida)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 3. Detener línea -> ESPERANDO_PT, tanque intacto ==='
select terminar_linea('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa)
) is not null as ok;

select
  (select activa from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1) as activa_esperado_false,
  (select finalizada_en is null from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1) as sin_finalizar_esperado_true,
  (select condicion from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_esperado_LISTO,
  (select cerrado_en is null from preparaciones where id = :lote::uuid) as lote_abierto_esperado_true;

\echo ''
\echo '=== 4. finalizar_turno rechaza con una corrida en ESPERANDO_PT ==='
do $$
begin
  perform finalizar_turno('f0f0f0f0-0000-0000-0000-000000000001'::uuid, current_date, current_time);
  raise exception 'NO FALLÓ (deberia rechazar: hay corrida esperando PT)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 5. Cargar el PT (≈6000 L) -> corrida cerrada, lote cerrado, tanque SUCIO ==='
select registrar_producto_terminado(
  :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1),
  'LINEA_1',
  (select id from sabores order by nombre limit 1),
  1000,                         -- presentacion_ml (tiene que existir en presentaciones)
  9999, 0,                      -- paletas grandes para vaciar el lote
  'jguerrero'
) is not null as ok;

select
  (select finalizada_en is not null from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') order by activada_en desc limit 1) as corrida_cerrada_esperado_true,
  (select volumen_l from preparaciones where id = :lote::uuid) as lote_volumen,
  (select cerrado_en is not null from preparaciones where id = :lote::uuid) as lote_cerrado_esperado_true,
  (select condicion from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1) as tanque_esperado_SUCIO;

\echo ''
\echo '=== 6. Ahora sí finaliza el turno ==='
select finalizar_turno('f0f0f0f0-0000-0000-0000-000000000001'::uuid, current_date, current_time);
select estado from turnos where id = :turno::uuid;

\echo ''
\echo '=== ESPERADO ==='
\echo '2: OK rechazado | 3: activa=f, sin_finalizar=t, tanque=LISTO, lote_abierto=t'
\echo '4: OK rechazado | 5: corrida_cerrada=t, lote_volumen=0, lote_cerrado=t, tanque=SUCIO'
\echo '6: estado=CERRADO'

rollback;
