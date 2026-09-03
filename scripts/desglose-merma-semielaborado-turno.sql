-- ============================================================
-- DESGLOSE — merma de semielaborado de UN turno, lote por lote
-- ============================================================
-- SOLO LECTURA. Replica lo que hace mermaSemielaboradoTurno()
-- (src/lib/panelProduccion.ts) usando la MISMA fuente que el frontend:
-- turno_json(). Sirve para ver de dónde sale el %.
--
-- Uso:
--   psql "<conn prod>" -v codigo="'A20260903_T1G2'" -f scripts/desglose-merma-semielaborado-turno.sql
--   (poné el código del turno entre comillas simples DENTRO de las dobles)
--
-- Modelo (repartido por turno):
--   por lote:  tramo = volumen_l_inicio - volumen_l   (inicio - fin)
--              pt_litros = Σ litros_producidos de las corridas de ESE lote
--   lote MEDIBLE  <=>  inicio no es null  Y  tramo > 0  Y  pt_litros <= VI * 1.05
--   consumo   = Σ tramo       (solo lotes medibles)
--   producido = Σ pt_litros   (solo lotes medibles)
--   merma %   = 1 - producido / consumo
--   lo que queda afuera -> litros_sin_contraste ; el % es PARCIAL
-- ============================================================

\set ON_ERROR_STOP on

select t.id as turno_id, t.codigo, u.nombre as supervisor, t.fecha, t.estado
from turnos t join usuarios u on u.id = t.supervisor_id
where t.codigo = :codigo \gset

\echo ''
\echo '== Turno' :codigo '=='

with tj as (
  select turno_json(:'turno_id'::uuid) as j
),
lin as (  -- turno_linea_id -> lote_id
  select l->>'id' as tl_id, nullif(l->>'lote_id','') as lote_id
  from tj, jsonb_array_elements(j->'lineas') l
),
pt as (   -- litros de PT por lote
  select ln.lote_id, sum((p->>'litros_producidos')::numeric) as pt_litros, count(*) as filas_pt
  from tj, jsonb_array_elements(j->'producto_terminado') p
  join lin ln on ln.tl_id = p->>'turno_linea_id'
  where ln.lote_id is not null
  group by ln.lote_id
),
prep as (  -- inicio / fin de cada lote que el turno tocó (de turno_json)
  select
    pr->>'id'                                as lote_id,
    pr->>'lote'                              as lote,
    pr->>'sabor_nombre'                      as sabor,
    (pr->>'volumen_l_inicio')::numeric       as inicio,
    (pr->>'volumen_l')::numeric              as fin,
    p.volumen_inicial_l                      as vi
  from tj, jsonb_array_elements(j->'preparaciones') pr
  left join preparaciones p on p.id = (pr->>'id')::uuid
)
select
  x.lote,
  x.sabor,
  x.inicio,
  x.fin,
  (x.inicio - x.fin)                                        as tramo,
  coalesce(pt.pt_litros, 0)                                 as pt_litros,
  x.vi,
  case
    when x.inicio is null                                   then 'no: sin inicio'
    when (x.inicio - x.fin) <= 0                            then 'no: fin >= inicio'
    when x.vi is not null and x.vi > 0
         and coalesce(pt.pt_litros,0) > x.vi * 1.05         then 'no: PT excede VI'
    else 'SI'
  end                                                       as medible,
  pt.filas_pt
from prep x
left join pt on pt.lote_id = x.lote_id
order by medible, x.lote;

\echo ''
\echo '== Totales (nuevo modelo, con guardrail) =='
with tj as (select turno_json(:'turno_id'::uuid) as j),
lin as (select l->>'id' as tl_id, nullif(l->>'lote_id','') as lote_id from tj, jsonb_array_elements(j->'lineas') l),
pt as (
  select ln.lote_id, sum((p->>'litros_producidos')::numeric) as pt_litros
  from tj, jsonb_array_elements(j->'producto_terminado') p
  join lin ln on ln.tl_id = p->>'turno_linea_id'
  where ln.lote_id is not null group by ln.lote_id
),
prep as (
  select pr->>'id' as lote_id,
         (pr->>'volumen_l_inicio')::numeric as inicio,
         (pr->>'volumen_l')::numeric as fin,
         p.volumen_inicial_l as vi
  from tj, jsonb_array_elements(j->'preparaciones') pr
  left join preparaciones p on p.id = (pr->>'id')::uuid
),
calc as (
  select
    x.*, coalesce(pt.pt_litros,0) as pt_litros,
    (x.inicio is not null
     and (x.inicio - x.fin) > 0
     and not (x.vi is not null and x.vi > 0 and coalesce(pt.pt_litros,0) > x.vi * 1.05)) as medible
  from prep x left join pt on pt.lote_id = x.lote_id
)
select
  round(sum(case when medible then inicio - fin end), 0)                     as consumo,
  round(sum(case when medible then pt_litros end), 0)                        as producido,
  round(sum(case when not medible then pt_litros end), 0)                    as litros_sin_contraste,
  case when coalesce(sum(case when medible then inicio - fin end),0) <= 0 then null
       else round((1 - sum(case when medible then pt_litros end)
                        / sum(case when medible then inicio - fin end)) * 100, 1)
  end                                                                        as merma_pct,
  bool_or(not medible)                                                       as parcial
from calc;

\echo ''
\echo '== Comparación: qué daba el modelo VIEJO (Σ todo el PT / Σ max(tramo,0)) =='
with tj as (select turno_json(:'turno_id'::uuid) as j),
pt_total as (
  select coalesce(sum((p->>'litros_producidos')::numeric),0) as pt_todo
  from tj, jsonb_array_elements(j->'producto_terminado') p
),
consumo_viejo as (
  select coalesce(sum(greatest((pr->>'volumen_l_inicio')::numeric - (pr->>'volumen_l')::numeric, 0)),0) as c
  from tj, jsonb_array_elements(j->'preparaciones') pr
)
select
  cv.c                                          as consumo_viejo,
  pt.pt_todo                                    as producido_viejo,
  case when cv.c <= 0 then null
       else round((1 - pt.pt_todo / cv.c) * 100, 1) end as merma_pct_viejo
from consumo_viejo cv, pt_total pt;
