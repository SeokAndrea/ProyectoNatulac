-- ============================================================
-- DESGLOSE merma de semielaborado — versión para el SQL Editor de Supabase
-- ============================================================
-- SOLO LECTURA. Pegar en Dashboard > SQL Editor > New query > Run.
-- Cambiar el código del turno en la primera línea del CTE `params`.
-- Cada bloque (separado por -- ####) es una consulta: seleccionala y
-- corré con Run, o corré todo y mirá el último resultado.
-- ============================================================

-- #### 1) Lote por lote + fila TOTAL ####
with params as (
  select 'A20260903_T1G2'::text as codigo      -- <<< CÓDIGO DEL TURNO ACÁ
),
tj as (
  select turno_json(t.id) as j
  from turnos t join params p on p.codigo = t.codigo
),
lin as (
  select l->>'id' as tl_id, nullif(l->>'lote_id','') as lote_id
  from tj, jsonb_array_elements(j->'lineas') l
),
pt as (
  select ln.lote_id, sum((x->>'litros_producidos')::numeric) as pt_litros
  from tj, jsonb_array_elements(j->'producto_terminado') x
  join lin ln on ln.tl_id = x->>'turno_linea_id'
  where ln.lote_id is not null
  group by ln.lote_id
),
prep as (
  select
    pr->>'id'                          as lote_id,
    pr->>'lote'                        as lote,
    pr->>'sabor_nombre'               as sabor,
    (pr->>'volumen_l_inicio')::numeric as inicio,
    (pr->>'volumen_l')::numeric        as fin,
    p.volumen_inicial_l               as vi
  from tj, jsonb_array_elements(j->'preparaciones') pr
  left join preparaciones p on p.id = (pr->>'id')::uuid
),
calc as (
  select
    x.lote, x.sabor, x.inicio, x.fin,
    (x.inicio - x.fin)              as tramo,
    coalesce(pt.pt_litros, 0)       as pt_litros,
    x.vi,
    ( x.inicio is not null
      and (x.inicio - x.fin) > 0
      and not (x.vi is not null and x.vi > 0
               and coalesce(pt.pt_litros,0) > x.vi * 1.05) ) as medible
  from prep x
  left join pt on pt.lote_id = x.lote_id
)
select
  coalesce(lote,'—')     as lote,
  sabor,
  round(inicio)          as inicio,
  round(fin)             as fin,
  round(tramo)           as tramo,
  round(pt_litros)       as pt_litros,
  round(vi)              as vi,
  case when medible then 'SI'
       when inicio is null then 'no: sin inicio'
       when (inicio - fin) <= 0 then 'no: fin >= inicio'
       else 'no: PT excede VI' end as medible
from calc
union all
select
  'TOTAL', null,
  round(sum(inicio)     filter (where medible)),
  round(sum(fin)        filter (where medible)),
  round(sum(tramo)      filter (where medible)),   -- = consumo
  round(sum(pt_litros)  filter (where medible)),   -- = producido
  null,
  case
    when coalesce(sum(tramo) filter (where medible), 0) <= 0 then 'merma: sin dato'
    else 'merma: '
         || round((1 - sum(pt_litros) filter (where medible)
                       / sum(tramo)    filter (where medible)) * 100, 1) || '%'
         || case when bool_or(not medible) then ' (PARCIAL)' else '' end
  end
from calc
order by (lote = 'TOTAL'), lote;


-- #### 2) Qué daba el modelo VIEJO (Σ todo el PT / Σ max(tramo,0)) ####
with params as (
  select 'A20260903_T1G2'::text as codigo      -- <<< MISMO CÓDIGO ACÁ
),
tj as (
  select turno_json(t.id) as j
  from turnos t join params p on p.codigo = t.codigo
),
pt_todo as (
  select coalesce(sum((x->>'litros_producidos')::numeric), 0) as producido
  from tj, jsonb_array_elements(j->'producto_terminado') x
),
consumo as (
  select coalesce(sum(greatest(
           (pr->>'volumen_l_inicio')::numeric - (pr->>'volumen_l')::numeric, 0)), 0) as consumo
  from tj, jsonb_array_elements(j->'preparaciones') pr
)
select
  round(c.consumo)   as consumo_viejo,
  round(p.producido) as producido_viejo,
  case when c.consumo <= 0 then null
       else round((1 - p.producido / c.consumo) * 100, 1) end as merma_pct_viejo
from consumo c, pt_todo p;
