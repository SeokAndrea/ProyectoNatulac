-- Recrea el caso real de Danny (turno A20260901_T1G1, lote 0001) sobre
-- la base LOCAL con las 4 migraciones aplicadas, y muestra qué número
-- da AHORA vs. lo que daba ANTES.
--   cat scripts/recrear-caso-danny.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Transacción con ROLLBACK — no deja nada.

begin;

create temporary table _d on commit drop as
select
  (select id from sabores where volumen is not null limit 1) as sabor,
  (select id from usuarios where usuario='jguerrero') as usr,
  (select id from areas where codigo='ASEPTICO') as area,
  (select id from lineas where codigo='LINEA_1' limit 1) as l1,
  (select id from lineas where codigo='LINEA_2' limit 1) as l2,
  (select id from presentaciones where volumen_ml=1000 limit 1) as p1000,
  (select id from presentaciones where volumen_ml=250 limit 1) as p250,
  (select id from turno_tipos where codigo='TURNO_1') as tt,
  (select id from grupos where codigo='GRUPO_1') as g;

-- turno + tanque 1 LISTO con lote 0001, nace tipeado en 18380
insert into turnos (id,codigo,area_id,supervisor_id,turno_tipo_id,grupo_id,estado,fecha,hora_inicio)
select '0da00000-0000-0000-0000-000000000001','DANNY',area,usr,tt,g,'ABIERTO',current_date,'13:39' from _d;

insert into preparaciones (id,turno_id,numero_tanque,sabor_id,lote,tambores,usuario_id,volumen_l,volumen_inicial_l,liberado_en)
select '0da00000-0000-0000-0000-0000000000aa','0da00000-0000-0000-0000-000000000001',1,sabor,'0001',0,usr,7364,18380,now() from _d;
-- volumen_l = 7364 = 18380 - 11016 (lo que el sistema tenía antes de la corrección)

insert into recepcion_tanques (turno_id,numero_tanque,sabor_id,condicion,volumen_l,lote,lote_id,actualizada_por)
select '0da00000-0000-0000-0000-000000000001',1,sabor,'LISTO',7364,'0001','0da00000-0000-0000-0000-0000000000aa',usr from _d;

-- dos corridas sobre el lote 0001
insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '0da00000-0000-0000-0000-0000000000c1','0da00000-0000-0000-0000-000000000001',l1,p1000,sabor,'0001','0da00000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _d;
insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '0da00000-0000-0000-0000-0000000000c2','0da00000-0000-0000-0000-000000000001',l2,p250,sabor,'0001','0da00000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _d;

-- PT: LÍNEA_1 8160 L (8 paletas x 85 x 12) ; LÍNEA_2 2856 L (3 x 140 + 56 = 476 cajas x 6)
insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '0da00000-0000-0000-0000-000000000001','0da00000-0000-0000-0000-0000000000c1',l1,sabor,p1000,8,0,85,12,usr from _d;
insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '0da00000-0000-0000-0000-000000000001','0da00000-0000-0000-0000-0000000000c2',l2,sabor,p250,3,56,140,6,usr from _d;

\echo ''
\echo '--- ANTES de la corrección: volumen_inicial_l = 18380, volumen_l = 7364 ---'
select volumen_inicial_l, volumen_l from preparaciones where id='0da00000-0000-0000-0000-0000000000aa';

-- >>> LA CORRECCIÓN: el supervisor mide el tanque y tipea 4700 <<<
select cambiar_condicion_tanque('jguerrero','0da00000-0000-0000-0000-000000000001',1::smallint,'LISTO',
  (select sabor from _d), 4700::numeric, '0001', null, null) is not null as correccion_ok;

-- cierra el lote (tanque drenado / terminó sabor)
update preparaciones set cerrado_en = now() where id='0da00000-0000-0000-0000-0000000000aa';

\echo ''
\echo '--- DESPUÉS de la corrección (con FASE A) ---'
select volumen_inicial_l as "inicial (intacto)", volumen_l as "final (medido)" from preparaciones where id='0da00000-0000-0000-0000-0000000000aa';
select volumen_teorico, volumen_real, diferencia from preparaciones_ajuste where lote_id='0da00000-0000-0000-0000-0000000000aa';

\echo ''
\echo '--- turno_json: lo que ve el frontend ---'
select p->>'lote' lote, p->>'volumen_inicial_l' inicial, p->>'volumen_l_inicio' inicio_turno, p->>'volumen_l' final
from jsonb_array_elements(turno_json('0da00000-0000-0000-0000-000000000001')->'preparaciones') p
where p->>'lote' = '0001';

\echo ''
\echo '======================  EL NÚMERO  ======================'
with pt as (select sum(litros_producidos) l from producto_terminado where turno_id='0da00000-0000-0000-0000-000000000001'),
     lote as (select volumen_inicial_l vi, volumen_l vf from preparaciones where id='0da00000-0000-0000-0000-0000000000aa')
select
  (select l from pt)                                    as "PT del turno (L)",
  (select vi from lote)                                 as "preparado (L)",
  (select vf from lote)                                 as "quedó en tanque (L)",
  (select vi from lote) - (select vf from lote)         as "consumo del turno (L)",
  round((1 - (select l from pt) / ((select vi from lote) - (select vf from lote))) * 100, 2) as "MERMA % (modelo nuevo, b)",
  round((100 - (1 - (select l from pt) / ((select vi from lote) - (select vf from lote))) * 100)::numeric, 2) as "RENDIMIENTO % (nuevo)",
  round((1 - (select l from pt) / 15716) * 100, 2)      as "merma % que mostraba ANTES";
\echo '========================================================'
\echo 'Nota: el modelo (b) NO cuenta como pérdida los 4.700 L que quedaron'
\echo 'en el tanque — por eso el rendimiento del turno da ~80%, no ~59%.'
\echo 'Los 4.700 L son "producto que quedó", no "merma", salvo que se'
\echo 'confirme que se tiraron.'

rollback;
