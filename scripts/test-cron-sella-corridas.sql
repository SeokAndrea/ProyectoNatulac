-- Prueba de 20261030090000_cron_sella_corridas_sin_resolver.sql contra la base LOCAL.
--   cat scripts/test-cron-sella-corridas.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Todo en una transacción con ROLLBACK.
--
-- cerrar_turnos_vencidos():
--   * corrida ACTIVA sin entregar  -> sellada (activa=false, finalizada_en puesto).
--   * corrida en ESPERANDO_PT       -> sellada.
--   * corrida ENTREGADA             -> NO se toca (sigue activa, la hereda el turno siguiente).
--   * el turno queda CERRADO con cierre_automatico=true.
--   * listar_validacion_produccion muestra las corridas selladas con sin_pt=true.

begin;

\set turno '''ffffffff-0000-0000-0000-000000000001'''

-- Turno vencido: fecha 2 días atrás -> siempre pasa el corte de "30 min después del fin".
insert into turnos (id, codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, estado, fecha, hora_inicio)
select :turno::uuid, 'TEST_CRON_SELLA',
       (select id from areas where codigo='ASEPTICO'),
       (select id from usuarios where usuario='jguerrero'),
       (select id from turno_tipos where codigo='TURNO_1'),
       (select id from grupos where codigo='GRUPO_1'),
       'ABIERTO', current_date - 2, time '07:00';

-- 3 lotes liberados, uno por tanque.
insert into preparaciones (id, turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l, liberado_en)
select ('ffffffff-0000-0000-0000-00000000001' || g)::uuid, :turno::uuid, g,
       (select id from sabores order by nombre limit 1), lpad(g::text, 4, '0'), 0,
       (select id from usuarios where usuario='jguerrero'), 6000, 6000, now()
from generate_series(1,3) g;
insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, actualizada_por)
select :turno::uuid, g, (select id from sabores order by nombre limit 1), 'LISTO', 6000, lpad(g::text, 4, '0'),
       ('ffffffff-0000-0000-0000-00000000001' || g)::uuid, (select id from usuarios where usuario='jguerrero')
from generate_series(1,3) g;

-- LINEA_1: activa sin entregar. LINEA_2: ESPERANDO_PT. LINEA_3: entregada.
select activar_linea('jguerrero', :turno::uuid, 'LINEA_1', 1000, 8000, 8000::numeric, 1::smallint) is not null as ok1;
select activar_linea('jguerrero', :turno::uuid, 'LINEA_2', 1000, 8000, 8000::numeric, 2::smallint) is not null as ok2;
select activar_linea('jguerrero', :turno::uuid, 'LINEA_3', 1000, 8000, 8000::numeric, 3::smallint) is not null as ok3;

select terminar_linea('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_2') and activa)
) is not null as ok_esperando;

-- Cargar PT del tramo de LINEA_3 y entregarla.
select registrar_producto_terminado(:turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_3') and activa),
  'LINEA_3', (select sabor_id from recepcion_tanques where turno_id = :turno::uuid and numero_tanque = 3),
  1000, 1, 0, 'jguerrero') is not null as ok_pt3;
select entregar_corrida('jguerrero', :turno::uuid,
  (select id from turno_lineas where turno_id = :turno::uuid and linea_id = (select id from lineas where codigo='LINEA_3') and activa)
) is not null as ok_entregar3;

\echo '=== Correr el cron ==='
select cerrar_turnos_vencidos();

\echo ''
\echo '=== Turno cerrado por el cron ==='
select estado, cierre_automatico from turnos where id = :turno::uuid;

\echo ''
\echo '=== Corridas: L1 y L2 selladas (activa=false, finalizada_en no nulo); L3 intacta (activa=true) ==='
select ln.codigo, tl.activa, (tl.finalizada_en is not null) as finalizada, (tl.entregada_en is not null) as entregada
from turno_lineas tl join lineas ln on ln.id = tl.linea_id
where tl.turno_id = :turno::uuid
order by ln.codigo;

\echo ''
\echo '=== VALIDAR muestra L1 y L2 con sin_pt=true; L3 con sin_pt=false ==='
select e ->> 'linea' as linea, e ->> 'sin_pt' as sin_pt, e ->> 'cierre_automatico' as cierre_automatico, e -> 'supervisor' ->> 'paletas' as paletas
from jsonb_array_elements(listar_validacion_produccion('jguerrero', current_date - 3, current_date)) e
where e ->> 'turno_codigo' = 'TEST_CRON_SELLA'
order by 1;

rollback;
