-- ============================================================
-- VERIFICACIÓN — Merma de semielaborado (plan §35–§38)
-- ============================================================
-- Todo SOLO LECTURA salvo el bloque final marcado, que va en una
-- transacción con ROLLBACK. Correr contra la base de PRUEBA/rama, no
-- contra producción.
--
-- Uso: psql "<connection string de la rama>" -f scripts/verificar-merma-semielaborado.sql
-- ============================================================

\echo '== 1. Lotes cerrados con la firma inicial == PT + volumen_l (derivado/corregido) =='
select
  p.id,
  p.lote,
  s.nombre                      as sabor,
  p.tambores,
  p.volumen_inicial_l,
  p.volumen_l,
  coalesce(pt.litros, 0)        as pt_litros,
  p.volumen_inicial_l - p.volumen_l                  as inicial_menos_final,
  (p.volumen_inicial_l = coalesce(pt.litros,0) + p.volumen_l) as firma_exacta
from preparaciones p
left join sabores s on s.id = p.sabor_id
left join lateral (
  select sum(x.litros_producidos) as litros
  from producto_terminado x
  join turno_lineas tl on tl.id = x.turno_linea_id
  where tl.lote_id = p.id
) pt on true
where p.cerrado_en is not null
order by p.created_at desc
limit 60;

\echo ''
\echo '== 2. Lotes IMPOSIBLES: volumen_l > volumen_inicial_l =='
select p.id, p.lote, s.nombre as sabor, p.tambores, p.volumen_inicial_l, p.volumen_l
from preparaciones p
left join sabores s on s.id = p.sabor_id
where p.volumen_l is not null
  and p.volumen_inicial_l is not null
  and p.volumen_l > p.volumen_inicial_l
order by (p.volumen_l - p.volumen_inicial_l) desc;

\echo ''
\echo '== 3. Lotes nacidos por Status (tambores = 0) con volumen_inicial_l > 0 =='
select count(*) as lotes_tambores_0_con_inicial,
       sum(case when cerrado_en is not null then 1 else 0 end) as de_esos_cerrados
from preparaciones
where coalesce(tambores,0) = 0 and coalesce(volumen_inicial_l,0) > 0;

\echo ''
\echo '== 4. Reconstrucción teórica posible (tambores > 0 && sabor.volumen) =='
select
  p.id, p.lote, s.nombre as sabor,
  p.tambores, s.volumen                as vol_x_unidad,
  p.tambores * s.volumen               as inicial_teorico,
  p.volumen_inicial_l                  as inicial_guardado,
  p.volumen_inicial_l - p.tambores * s.volumen as brecha
from preparaciones p
join sabores s on s.id = p.sabor_id
where p.cerrado_en is not null
  and coalesce(p.tambores,0) > 0
  and s.volumen is not null
  and p.volumen_inicial_l is distinct from p.tambores * s.volumen
order by abs(p.volumen_inicial_l - p.tambores * s.volumen) desc
limit 40;

\echo ''
\echo '== 5. preparaciones_ajuste (debe estar VACÍA antes de la fase A) =='
select count(*) as filas_ajuste from preparaciones_ajuste;
select a.*, p.lote from preparaciones_ajuste a join preparaciones p on p.id = a.lote_id order by a.creado_en desc limit 20;

\echo ''
\echo '== 6. Auditoría de cambios en volumen_inicial_l (necesita 20260984; puede requerir rol superadmin) =='
-- Ajustar el nombre de la tabla/campos si la auditoría usa otro esquema.
select
  au.ocurrido_en,
  au.usuario,
  au.accion,
  au.entidad_id,
  (au.antes  ->> 'volumen_inicial_l') as inicial_antes,
  (au.despues ->> 'volumen_inicial_l') as inicial_despues,
  (au.antes  ->> 'volumen_l')          as vol_antes,
  (au.despues ->> 'volumen_l')          as vol_despues
from auditoria au
where au.entidad = 'preparaciones'
  and (au.antes ->> 'volumen_inicial_l') is distinct from (au.despues ->> 'volumen_inicial_l')
order by au.ocurrido_en desc
limit 100;

-- ============================================================
-- 7. PRUEBA DE LA FASE A (transacción con ROLLBACK)
-- ============================================================
-- Reemplazar los literales por un turno ABIERTO real de la rama y un
-- tanque suyo en LISTO con un lote que ya tenga PT. Verifica que una
-- "relectura" (mismo sabor + lote, LISTO -> LISTO, volumen distinto):
--   a) NO cambia volumen_inicial_l
--   b) baja volumen_l al valor tipeado
--   c) agrega exactamente una fila a preparaciones_ajuste
-- ============================================================
\echo ''
\echo '== 7. Prueba fase A (ROLLBACK) — completar los :params antes de correr =='
\set turno_id      '00000000-0000-0000-0000-000000000000'
\set numero_tanque 1
\set sabor_id      '00000000-0000-0000-0000-000000000000'
\set lote_txt      '0001'
\set volumen_nuevo 4300

begin;

select id, volumen_inicial_l as inicial_pre, volumen_l as vol_pre
from preparaciones
where turno_id = :'turno_id' and numero_tanque = :numero_tanque and cerrado_en is null;

select count(*) as ajustes_pre from preparaciones_ajuste;

select cambiar_condicion_tanque(
  (select usuario from usuarios u join turnos t on t.supervisor_id = u.id where t.id = :'turno_id'),
  :'turno_id',
  :numero_tanque::smallint,
  'LISTO',
  :'sabor_id',
  :volumen_nuevo::numeric,
  :'lote_txt',
  null,
  null
) is not null as rpc_ok;

select id, volumen_inicial_l as inicial_post, volumen_l as vol_post
from preparaciones
where turno_id = :'turno_id' and numero_tanque = :numero_tanque and cerrado_en is null;

select count(*) as ajustes_post, max(volumen_teorico) as teorico, max(volumen_real) as real, max(diferencia) as dif
from preparaciones_ajuste;

\echo '--> Esperado: inicial_pre == inicial_post ; vol_post == volumen_nuevo ; ajustes_post == ajustes_pre + 1'

rollback;
