-- ============================================================
-- INDICADORES: TOTAL ASÉPTICO de julio y agosto
-- ============================================================
-- Dueña, 2026-10-14: la fila "TOTAL ASEPTICO" del Excel de septiembre
-- trae el cumplimiento de julio (51 %) y agosto (44 %). Vienen de otro
-- Excel, así que van tal cual, aunque no salgan de sumar las
-- presentaciones de esos meses. Septiembre se calcula solo: 135.793 de
-- 172.568 = 79 %. Se ve en la franja TOTAL ASÉPTICO, arriba de todas las
-- pantallas. No pisa lo que la analista ya editó.
-- ============================================================

update indicadores_mes im
set datos = jsonb_set(im.datos, '{totalAseptico}', jsonb_build_object('prod', null, 'plan', null, 'cumplimiento', x.cumplimiento)),
    actualizado_en = now()
from areas a, (values (date '2026-07-01', 51), (date '2026-08-01', 44)) as x (mes, cumplimiento)
where a.id = im.area_id
  and a.codigo = 'ASEPTICO'
  and im.mes = x.mes
  and im.datos is not null
  and im.actualizado_por is null;
