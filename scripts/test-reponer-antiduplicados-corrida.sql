-- Prueba de 20261025090000_reponer_antiduplicados_corrida.sql contra la base LOCAL.
--   cat scripts/test-reponer-antiduplicados-corrida.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- Verifica que vuelve a estar la guarda que 20261018 / 20261023
-- dejaron caer:
--   * activar_linea rechaza re-correr una línea sobre un lote que ESA
--     línea ya produjo este turno (PT / lote_terminado_en / entregada_en).
--   * una corrida "stub" (activada, nunca produjo) NO bloquea.
--   * otra línea sobre el mismo lote SÍ puede correr.
--   * continuar_siguiente_lote (camino manual) lleva la misma guarda.

begin;

\set turno '''a5a5a5a5-0000-0000-0000-000000000001'''
\set lote9 '''b9b9b9b9-0000-0000-0000-000000000009'''

insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado)
select :turno::uuid, 'TEST_ANTIDUP',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_3'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO';

-- Lote 0009 (20000 L) liberado en el tanque 1, tanque LISTO.
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote9::uuid, :turno::uuid, 1, (select id from sabores order by nombre limit 1), '0009', 0,
       (select id from usuarios where usuario='jguerrero'), 20000, 20000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 1, (select id from sabores order by nombre limit 1), 'LISTO', 20000, '0009', :lote9::uuid,
       (select id from usuarios where usuario='jguerrero');

\echo '=== 1. Activar Línea 1 sobre el tanque 1 (Lote 0009) ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint) is not null as ok;

\echo ''
\echo '=== 2. Cargar PT de esa corrida (11 paletas) — la corrida se cierra ==='
select registrar_producto_terminado(
  :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_1') and activa),
  'LINEA_1',
  (select sabor_id from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1),
  1000, 11, 0, 'jguerrero'
) is not null as ok;

-- El tanque sigue LISTO con el Lote 0009 (Producción no lo toca — 20261018).
select condicion, lote, volumen_l from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 1;

\echo ''
\echo '=== 3. Re-activar Línea 1 sobre el MISMO tanque/lote -> DEBE RECHAZAR ==='
do $$
begin
  perform activar_linea('jguerrero', 'a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint);
  raise exception 'NO FALLÓ (deberia rechazar: LINEA_1 ya corrio el Lote 0009 este turno)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== 4. OTRA línea (Línea 2) sobre el mismo Lote 0009 -> PERMITIDO ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_2', 1000, 4000, 4000::numeric, 1::smallint) is not null as ok_otra_linea;

\echo ''
\echo '=== 5. Corrida STUB: Línea 3 activada y nunca produjo -> re-activar PERMITIDO ==='
select activar_linea('jguerrero', :turno::uuid, 'LINEA_3', 1000, 4000, 4000::numeric, 1::smallint) is not null as ok_stub_1;
select activar_linea('jguerrero', :turno::uuid, 'LINEA_3', 1000, 4000, 4000::numeric, 1::smallint) is not null as ok_stub_2;

\echo ''
\echo '=== 6. continuar_siguiente_lote (manual) apuntando de nuevo al Lote 0009 ya producido por Línea 1 -> DEBE RECHAZAR ==='
-- Corrida activa de Línea 1 en OTRO lote, para tener un p_turno_linea_id activo.
\set lote10 '''b9b9b9b9-0000-0000-0000-000000000010'''
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select :lote10::uuid, :turno::uuid, 2, (select id from sabores order by nombre limit 1), '0010', 0,
       (select id from usuarios where usuario='jguerrero'), 20000, 20000, now();
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, 2, (select id from sabores order by nombre limit 1), 'LISTO', 20000, '0010', :lote10::uuid,
       (select id from usuarios where usuario='jguerrero');
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 2::smallint) is not null as ok_l1_en_0010;

do $$
begin
  perform continuar_siguiente_lote(
    'jguerrero', 'a5a5a5a5-0000-0000-0000-000000000001'::uuid,
    (select id from turno_lineas where turno_id = 'a5a5a5a5-0000-0000-0000-000000000001'::uuid
       and linea_id = (select id from lineas where codigo='LINEA_1') and activa),
    1::smallint      -- de vuelta al tanque 1 / Lote 0009
  );
  raise exception 'NO FALLÓ (deberia rechazar: Linea 1 ya corrio el Lote 0009)';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

rollback;
