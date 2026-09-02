-- ============================================================
-- REPORTE Fase C — lotes cerrados con volumen_inicial_l sospechoso
-- ============================================================
-- SOLO LECTURA. Correr contra PRODUCCIÓN para que la jefa revise qué
-- lotes históricos hay que corregir a mano (los anteriores al trigger
-- de auditoría no se pueden reconstruir automáticamente).
--
--   psql "<conn prod>" -f scripts/reporte-fase-c-candidatos.sql
-- ============================================================

\echo '== Lotes CERRADOS: inicial guardado vs. tambores x volumen del sabor + PT + faltante =='
with pt as (
  select tl.lote_id, sum(x.litros_producidos) as pt_litros
  from producto_terminado x
  join turno_lineas tl on tl.id = x.turno_linea_id
  group by tl.lote_id
)
select
  t.codigo                              as turno,
  t.fecha,
  p.numero_tanque                       as tanque,
  p.lote,
  s.nombre                              as sabor,
  p.tambores,
  s.volumen                             as vol_unidad,
  case when p.tambores > 0 then p.tambores * s.volumen end as inicial_teorico,
  p.volumen_inicial_l                   as inicial_guardado,
  coalesce(pt.pt_litros, 0)             as pt_litros,
  p.volumen_l                           as volumen_l_final,
  p.volumen_inicial_l - coalesce(pt.pt_litros,0) - coalesce(p.volumen_l,0) as merma_l_implicita,
  round((1 - coalesce(pt.pt_litros,0) / nullif(p.volumen_inicial_l,0)) * 100, 2) as merma_pct_actual,
  case
    when p.volumen_l > p.volumen_inicial_l                                  then 'IMPOSIBLE: final > inicial'
    when coalesce(pt.pt_litros,0) > p.volumen_inicial_l                      then 'IMPOSIBLE: PT > inicial (merma negativa)'
    when p.tambores > 0 and abs(p.volumen_inicial_l - p.tambores*s.volumen) > p.tambores*s.volumen*0.02
                                                                            then 'inicial != tambores x volumen'
    when p.tambores = 0                                                     then 'nacio por Status (tambores=0) — revisar'
    else 'ok?'
  end as veredicto
from preparaciones p
join turnos t on t.id = p.turno_id
left join sabores s on s.id = p.sabor_id
left join pt on pt.lote_id = p.id
where p.cerrado_en is not null
  and p.volumen_inicial_l is not null
order by t.fecha desc, p.numero_tanque;

\echo ''
\echo '== Auditoría: todo cambio de volumen_inicial_l registrado (para recuperar el valor previo) =='
select
  au.ocurrido_en,
  au.usuario,
  au.entidad_id,
  (au.antes  ->> 'lote')               as lote,
  (au.antes  ->> 'volumen_inicial_l')  as inicial_antes,
  (au.despues ->> 'volumen_inicial_l') as inicial_despues,
  (au.antes  ->> 'volumen_l')          as vol_antes,
  (au.despues ->> 'volumen_l')         as vol_despues
from auditoria au
where au.entidad = 'preparaciones'
  and (au.antes ->> 'volumen_inicial_l') is distinct from (au.despues ->> 'volumen_inicial_l')
order by au.entidad_id, au.ocurrido_en;
