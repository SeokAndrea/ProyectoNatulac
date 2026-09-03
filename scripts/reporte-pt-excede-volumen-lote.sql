-- ============================================================
-- REPORTE — lotes con Producto Terminado que EXCEDE su volumen
-- ============================================================
-- SOLO LECTURA. Un lote no puede producir más litros de los que tuvo
-- adentro (volumen_inicial_l, que ya incluye los ajustes de "Ajustar").
-- Si el PT lo supera, es una de dos:
--   - una corrida DUPLICADA (mismo envasado cargado dos veces contra
--     dos turno_lineas — ver el caso del turno de Javier), o
--   - se agregó jugo/agua al tanque sin registrarlo con "Ajustar".
--
-- Este es el mismo chequeo que hace mermaSemielaboradoTurno en el
-- frontend para dejar un lote fuera del % (ver plan-rework-auditoria.md
-- §7.2). Acá se lista para revisión de la jefa.
--
--   psql "<conn prod>" -f scripts/reporte-pt-excede-volumen-lote.sql
-- ============================================================

\echo '== Lotes cuyo Σ litros de PT supera su volumen_inicial_l (con 5% de margen de redondeo) =='
with pt as (
  select
    tl.lote_id,
    sum(x.litros_producidos)                             as pt_litros,
    count(*)                                             as filas_pt,
    -- ¿dos o más corridas con paletas y cajas idénticas? (posible re-tipeo)
    count(*) - count(distinct (x.paletas, x.cajas_sueltas)) as filas_repetidas
  from producto_terminado x
  join turno_lineas tl on tl.id = x.turno_linea_id
  where tl.lote_id is not null
  group by tl.lote_id
)
select
  t.codigo                                as turno,
  t.fecha,
  p.numero_tanque                         as tanque,
  p.lote,
  s.nombre                                as sabor,
  p.volumen_inicial_l                     as vi,
  pt.pt_litros,
  round((pt.pt_litros / nullif(p.volumen_inicial_l, 0) - 1) * 100, 1) as exceso_pct,
  pt.filas_pt,
  pt.filas_repetidas,
  p.liberado_en is not null               as liberado,
  p.cerrado_en is not null                as cerrado
from preparaciones p
join pt              on pt.lote_id = p.id
left join turnos t   on t.id = p.turno_id
left join sabores s  on s.id = p.sabor_id
where p.volumen_inicial_l is not null
  and p.volumen_inicial_l > 0
  and pt.pt_litros > p.volumen_inicial_l * 1.05
order by exceso_pct desc nulls last;
