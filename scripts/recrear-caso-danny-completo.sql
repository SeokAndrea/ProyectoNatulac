-- Caso de Danny COMPLETO: turno 1 (Danny) + turno 2 (Deivis), como
-- pasó en la vida real, para ver cómo se desarrolla la merma turno a
-- turno y cuál es la pérdida final.
--   cat scripts/recrear-caso-danny-completo.sql | docker exec -i supabase_db_PROYECTO psql -U postgres -v ON_ERROR_STOP=1
-- Transacción con ROLLBACK.

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
  (select id from turno_tipos where codigo='TURNO_1') as tt1,
  (select id from turno_tipos where codigo='TURNO_2') as tt2,
  (select id from grupos where codigo='GRUPO_1') as g;

-- ================= TURNO 1 (Danny) =================
insert into turnos (id,codigo,area_id,supervisor_id,turno_tipo_id,grupo_id,estado,fecha,hora_inicio,hora_fin)
select '0da00000-0000-0000-0000-000000000001','T1-DANNY',area,usr,tt1,g,'ABIERTO',current_date,'13:39','15:11' from _d;

insert into preparaciones (id,turno_id,numero_tanque,sabor_id,lote,tambores,usuario_id,volumen_l,volumen_inicial_l,liberado_en)
select '0da00000-0000-0000-0000-0000000000aa','0da00000-0000-0000-0000-000000000001',1,sabor,'0001',0,usr,7364,18380,now() from _d;

insert into recepcion_tanques (turno_id,numero_tanque,sabor_id,condicion,volumen_l,lote,lote_id,actualizada_por)
select '0da00000-0000-0000-0000-000000000001',1,sabor,'LISTO',7364,'0001','0da00000-0000-0000-0000-0000000000aa',usr from _d;

insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '0da00000-0000-0000-0000-0000000000c1','0da00000-0000-0000-0000-000000000001',l1,p1000,sabor,'0001','0da00000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _d;
insert into turno_lineas (id,turno_id,linea_id,presentacion_id,sabor_id,lote,lote_id,envases_hora,litros_hora,activa,activada_por,activada_en)
select '0da00000-0000-0000-0000-0000000000c2','0da00000-0000-0000-0000-000000000001',l2,p250,sabor,'0001','0da00000-0000-0000-0000-0000000000aa',6000,6000,true,usr,now() from _d;

insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '0da00000-0000-0000-0000-000000000001','0da00000-0000-0000-0000-0000000000c1',l1,sabor,p1000,8,0,85,12,usr from _d;   -- 8160 L
insert into producto_terminado (turno_id,turno_linea_id,linea_id,sabor_id,presentacion_id,paletas,cajas_sueltas,cajas_x_paleta,litros_x_caja,usuario_id)
select '0da00000-0000-0000-0000-000000000001','0da00000-0000-0000-0000-0000000000c2',l2,sabor,p250,3,56,140,6,usr from _d;     -- 2856 L

-- corrección: se mide y se tipea 4700 (rama v_mismo_lote -> Fase A)
select cambiar_condicion_tanque('jguerrero','0da00000-0000-0000-0000-000000000001',1::smallint,'LISTO',
  (select sabor from _d), 4700::numeric, '0001', null, null) is not null as t1_correccion_ok;

-- Danny termina el lote y cierra el turno (dispara el snapshot)
update preparaciones set cerrado_en = now() where id='0da00000-0000-0000-0000-0000000000aa';
update turnos set estado='CERRADO', fecha_fin=current_date where id='0da00000-0000-0000-0000-000000000001';

-- ================= TURNO 2 (Deivis) =================
-- En la vida real Deivis creó un lote NUEVO 0001 con los 4700 L que
-- quedaron, no produjo nada de él, y mandó el tanque a SUCIO (limpieza).
insert into turnos (id,codigo,area_id,supervisor_id,turno_tipo_id,grupo_id,estado,fecha,hora_inicio,hora_fin)
select '0da00000-0000-0000-0000-000000000002','T2-DEIVIS',area,usr,tt2,g,'ABIERTO',current_date,'15:11','20:00' from _d;

insert into preparaciones (id,turno_id,numero_tanque,sabor_id,lote,tambores,usuario_id,volumen_l,volumen_inicial_l,liberado_en,cerrado_en)
select '0da00000-0000-0000-0000-0000000000bb','0da00000-0000-0000-0000-000000000002',1,sabor,'0001',0,usr,4700,4700,now(),now() from _d;

insert into recepcion_tanques (turno_id,numero_tanque,sabor_id,condicion,volumen_l,lote,lote_id,ultimo_lote,actualizada_por)
select '0da00000-0000-0000-0000-000000000002',1,null,'SUCIO',null,null,null,'0001',usr from _d;

update turnos set estado='CERRADO', fecha_fin=current_date where id='0da00000-0000-0000-0000-000000000002';

\echo ''
\echo '=====================  CÓMO SE DESARROLLA  ====================='
with
t1 as (
  select
    (select volumen_inicial_l from preparaciones where id='0da00000-0000-0000-0000-0000000000aa') as inicio,
    (select volumen_l         from preparaciones where id='0da00000-0000-0000-0000-0000000000aa') as fin,
    (select sum(litros_producidos) from producto_terminado where turno_id='0da00000-0000-0000-0000-000000000001') as pt
),
t2 as (
  select
    (select volumen_inicial_l from preparaciones where id='0da00000-0000-0000-0000-0000000000bb') as inicio,
    (select volumen_l         from preparaciones where id='0da00000-0000-0000-0000-0000000000bb') as fin,
    coalesce((select sum(litros_producidos) from producto_terminado where turno_id='0da00000-0000-0000-0000-000000000002'),0) as pt
)
select 'T1 (Danny)'  as turno, inicio as "inicio (L)", fin as "fin (L)", (inicio-fin) as "consumo (L)", pt as "PT (L)",
       (inicio-fin-pt) as "merma tramo (L)",
       round((1 - pt/nullif(inicio-fin,0))*100,2) as "merma %"
from t1
union all
select 'T2 (Deivis)', inicio, fin, (inicio-fin), pt, (inicio-fin-pt),
       round((1 - pt/nullif(inicio-fin,0))*100,2)
from t2;

\echo ''
\echo '=====================  LA PÉRDIDA REAL  ====================='
select
  18380                       as "preparado (L)",
  11016                       as "llegó a Producto Terminado (L)",
  4700                        as "quedó en el tanque al cerrar (L)",
  18380 - 11016 - 4700        as "merma medida en T1 (L)",
  4700                        as "residuo de T2 (tanque → SUCIO, sin producir)",
  18380 - 11016               as "PÉRDIDA TOTAL si el residuo se descartó (L)",
  round((1 - 11016::numeric/18380)*100,2) as "  = merma %",
  round((11016::numeric/18380)*100,2)     as "  rendimiento %";

\echo ''
\echo 'El modelo por turno mide T1 = 2.664 L de merma (lo que se perdió'
\echo 'MIENTRAS Danny producía). Los 4.700 L que quedaron y después se'
\echo 'descartaron en T2 son pérdida también, pero HOY el modelo no los'
\echo 'agarra: T2 cerró el lote sin producir y sin transferir. Ver abajo.'

rollback;
