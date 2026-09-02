-- Valida turno_json.volumen_l_inicio / turno_id (migración 20260992) y
-- el modelo repartido por turno, con un lote compartido entre 2 turnos.
--   cat scripts/test-modelo-repartido.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Transacción con ROLLBACK.

begin;

-- helpers
create temporary table _ids on commit drop as
select
  (select id from sabores where volumen is not null limit 1) as sabor,
  (select id from usuarios where usuario = 'jguerrero') as usr,
  (select id from areas where codigo = 'ASEPTICO') as area,
  (select id from lineas where codigo = 'LINEA_1' limit 1) as linea,
  (select id from presentaciones limit 1) as pres,
  (select id from turno_tipos where codigo = 'TURNO_1') as tt1,
  (select id from turno_tipos where codigo = 'TURNO_2') as tt2,
  (select id from grupos where codigo = 'GRUPO_1') as grupo;

-- ===== TURNO 1: lote de 9000, produce 6000, cierra dejando 3000 =====
insert into turnos (id,codigo,area_id,supervisor_id,turno_tipo_id,grupo_id,estado,fecha,hora_inicio,hora_fin)
select '10000000-0000-0000-0000-000000000001','T1',area,usr,tt1,grupo,'ABIERTO',current_date,'06:00','14:00' from _ids;

insert into preparaciones (id,turno_id,numero_tanque,sabor_id,lote,tambores,usuario_id,volumen_l,volumen_inicial_l,liberado_en)
select '20000000-0000-0000-0000-0000000000aa','10000000-0000-0000-0000-000000000001',1,sabor,'0009',0,usr,3000,9000,now() from _ids;

insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '30000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001',linea,pres,sabor,'0009','20000000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _ids;

insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-0000000000a1',linea,sabor,pres,7,20,140,6,usr from _ids;  -- (7*140+20)=1000 cajas * 6 = 6000 L

update turnos set estado='CERRADO', fecha_fin=current_date where id='10000000-0000-0000-0000-000000000001';

-- ===== TURNO 2: hereda el lote, produce 2500, lo termina; se mide 500 =====
insert into turnos (id,codigo,area_id,supervisor_id,turno_tipo_id,grupo_id,estado,fecha,hora_inicio)
select '10000000-0000-0000-0000-000000000002','T2',area,usr,tt2,grupo,'ABIERTO',current_date,'14:00' from _ids;

insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '30000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000002',linea,pres,sabor,'0009','20000000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _ids;

insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000a2',linea,sabor,pres,3,0,140,6,usr from _ids;  -- 420 cajas * 6 = 2520 L

update preparaciones set volumen_l=480, cerrado_en=now() where id='20000000-0000-0000-0000-0000000000aa';

\echo ''
\echo '=== turno_json(T1).preparaciones — ESPERADO inicio=9000 (nacio aca), fin=3000 (snapshot) ==='
select p->>'lote' lote, p->>'turno_id' turno_prep, p->>'volumen_inicial_l' inicial, p->>'volumen_l_inicio' inicio, p->>'volumen_l' fin
from jsonb_array_elements(turno_json('10000000-0000-0000-0000-000000000001')->'preparaciones') p;

\echo ''
\echo '=== turno_json(T2).preparaciones — ESPERADO inicio=3000 (snapshot de T1), fin=500 (medido) ==='
select p->>'lote' lote, p->>'turno_id' turno_prep, p->>'volumen_inicial_l' inicial, p->>'volumen_l_inicio' inicio, p->>'volumen_l' fin
from jsonb_array_elements(turno_json('10000000-0000-0000-0000-000000000002')->'preparaciones') p;

\echo ''
\echo 'Modelo repartido:  T1 consumo=9000-3000=6000, PT=6000 -> merma 0 %.'
\echo '                   T2 consumo=3000-480 =2520, PT=2520 -> merma 0 %.'
\echo 'ANTES del arreglo: T1 => 1-6000/9000 = 33 %,  T2 => "—" (lote heredado y cerrado, fuera del JSON).'

rollback;
