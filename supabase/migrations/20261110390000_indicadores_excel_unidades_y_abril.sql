-- ============================================================
-- INDICADORES: lo que faltaba del Excel de septiembre
-- ============================================================
-- Dueña, 2026-10-14: del Excel "INDICADORES DE PRODUCCION SEPTIEMBRE"
-- faltaban dos cosas de la hoja PERDIDA ENVASES:
--   * "Equivalencia en unidades" (envases perdidos) de septiembre: va en
--     mermaUnidades de cada presentación y sale bajo la merma.
--   * Abril: la TPA-330 tuvo 5,52 % de merma.
-- Igual que 20261110290000, no pisa lo que la analista ya editó
-- (actualizado_por null = nadie lo tocó).
-- ============================================================

update indicadores_mes im
set datos = jsonb_set(jsonb_set(jsonb_set(jsonb_set(im.datos,
      '{presentaciones,1|1000,mermaUnidades}', '42972'),
      '{presentaciones,1|500,mermaUnidades}', '14058'),
      '{presentaciones,2|250,mermaUnidades}', '74461'),
      '{presentaciones,3|330,mermaUnidades}', '39737'),
    actualizado_en = now()
from areas a
where a.id = im.area_id
  and a.codigo = 'ASEPTICO'
  and im.mes = date '2026-09-01'
  and im.actualizado_por is null
  and im.datos #> '{presentaciones,1|1000}' is not null
  and im.datos #> '{presentaciones,1|500}' is not null
  and im.datos #> '{presentaciones,2|250}' is not null
  and im.datos #> '{presentaciones,3|330}' is not null;

insert into indicadores_mes (area_id, mes, modo, datos, actualizado_en)
select a.id, date '2026-04-01', 'MANUAL',
  '{"eficiencia": {},
    "presentaciones": {"3|330": {"corrio": true, "prod": null, "plan": null, "merma": 5.52, "paradas": []}},
    "semielaborado": {}}'::jsonb,
  now()
from areas a
where a.codigo = 'ASEPTICO'
on conflict (area_id, mes) do nothing;
