-- ============================================================
-- INDICADORES: septiembre desde el Excel + ausentismo e incidencias
-- ============================================================
-- Dueña, 2026-10-14: la fuente de los números es el Excel "INDICADORES DE
-- PRODUCCION SEPTIEMBRE.xlsx", no el PowerPoint. Corrige lo que cargó
-- 20261110090000 (que salió del PowerPoint):
--   * Merma de envases: TPA-250 septiembre 4,02 % (no 2,56); TPA-330
--     septiembre 6,28 %; TPA-200 sin dato en el Excel ("—").
--   * Julio y agosto: el % de cumplimiento por presentación (el Excel no
--     trae las cajas de esos meses), la merma y Selecto agosto 97 %.
--   * Observaciones: las del Excel (plan, merma y semielaborado).
-- Del PowerPoint quedan:
--   * Las paradas de septiembre (el Excel no las trae; en modo manual solo
--     se muestran los nombres).
--   * AUSENTISMO (diapositiva 11) e INCIDENCIAS (diapositivas 8 a 10), que
--     son pantallas nuevas y siempre se cargan a mano. El informe las pone
--     bajo "Agosto", pero es el informe de septiembre: van en septiembre.
--     Los NOMBRES de quién incidió más en el ausentismo NO van acá (el repo
--     es público): la analista los escribe en la app (Ausentismo → Editar).
--
-- Solo toca los meses que nadie editó todavía (actualizado_por null, lo que
-- dejó la carga anterior). Si la analista ya cambió algo, no se pisa.
-- ============================================================

with meses (mes, datos, observaciones) as (
  values
  (date '2026-07-01',
   '{"eficiencia": {"1": 64, "2": 59, "3": 54},
     "presentaciones": {
       "1|1000": {"corrio": true, "prod": null, "plan": null, "merma": 3.41, "cumplimiento": 40, "paradas": []},
       "2|250": {"corrio": true, "prod": null, "plan": null, "merma": 4.18, "cumplimiento": 50, "paradas": []},
       "3|200": {"corrio": true, "prod": null, "plan": null, "merma": null, "cumplimiento": 48, "paradas": []}
     },
     "semielaborado": {"Clasicos": 100, "Jucosa": 99}}'::jsonb,
   '{}'::jsonb),
  (date '2026-08-01',
   '{"eficiencia": {"1": 76, "2": 69, "3": 75},
     "presentaciones": {
       "1|1000": {"corrio": true, "prod": null, "plan": null, "merma": 3.14, "cumplimiento": 105, "paradas": []},
       "1|500": {"corrio": true, "prod": null, "plan": null, "merma": 14.6, "cumplimiento": 170, "paradas": []},
       "2|250": {"corrio": true, "prod": null, "plan": null, "merma": 2.56, "cumplimiento": 130, "paradas": []},
       "3|200": {"corrio": true, "prod": null, "plan": null, "merma": null, "cumplimiento": 141, "paradas": []}
     },
     "semielaborado": {"Clasicos": 99.6, "Selecto": 97, "Jucosa": 96.4}}'::jsonb,
   '{}'::jsonb),
  (date '2026-09-01',
   '{"eficiencia": {"1": 76, "2": 53, "3": 66},
     "presentaciones": {
       "1|1000": {"corrio": true, "prod": 69157, "plan": 98085, "merma": 3.04, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 1200, "veces": 8},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null},
         {"causa": "Falta de paletas", "minutos": null, "veces": null},
         {"causa": "Falla del generador 440 V (correa reventada)", "minutos": null, "veces": null},
         {"causa": "Cambio de presentación a TBA-500", "minutos": null, "veces": null}]},
       "1|500": {"corrio": true, "prod": 10443, "plan": 9451, "merma": 10.1, "paradas": [
         {"causa": "Falla en plegadora por solapa inferior invertida", "minutos": null, "veces": null},
         {"causa": "Signados fuera de rango", "minutos": null, "veces": null},
         {"causa": "Cambio de presentación a TBA-1000", "minutos": null, "veces": null}]},
       "2|250": {"corrio": true, "prod": 18660, "plan": 27106, "merma": 4.02, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 900, "veces": 6},
         {"causa": "Falla en el sistema de sellado transversal", "minutos": null, "veces": null},
         {"causa": "Logística condicionada por correr las tres líneas con el FLEX", "minutos": null, "veces": null},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null}]},
       "3|330": {"corrio": true, "prod": 26054, "plan": 14256, "merma": 6.28, "paradas": []},
       "3|200": {"corrio": true, "prod": 11479, "plan": 23670, "merma": null, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 780, "veces": 5},
         {"causa": "Falla en la plegadora", "minutos": null, "veces": null},
         {"causa": "Logística condicionada por correr las tres líneas con el FLEX", "minutos": null, "veces": null},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null}]}
     },
     "semielaborado": {"Clasicos": 100, "Selecto": 95, "Jucosa": 99},
     "ausentismo": {
       "horasTeoricas": 7418.5,
       "horasPerdidas": 562,
       "grupos": [
         {"grupo": "1", "porcentaje": 6.49, "partePerdidas": 34.54, "quien": "", "dias": 19},
         {"grupo": "2", "porcentaje": 9.03, "partePerdidas": 28.14, "quien": "", "dias": 20},
         {"grupo": "3", "porcentaje": 7.45, "partePerdidas": 37.31, "quien": "", "dias": 12}
       ]
     },
     "incidencias": [
       {"tipo": "INCIDENCIA",
        "evento": "Lote no cuenta con el perfil del sabor (616 cajas TBA-1000 y 321 cajas TPA-250)",
        "quePaso": "No se incorporaron los edulcorantes a la preparación de Manzana el día 18 de agosto de 2026. El lote se liberó con esta no conformidad y se envasaron 616 cajas de TBA-1000 y 321 cajas de TPA-250.",
        "comoPaso": "• El supervisor no entregó los edulcorantes a los preparadores antes de iniciar la preparación.\n• Los preparadores no notaron la ausencia del edulcorante y continuaron el proceso sin él.\n• El formato de control se firmó confirmando que todos los ingredientes habían sido agregados, sin verificación real.\n• El supervisor no degustó el producto para validar el perfil de sabor antes de liberarlo.",
        "accionCorrectiva": "• Se incorporaron los edulcorantes dentro del kit de preparación, eliminando la dependencia de que el supervisor deba entregarlos por separado.\n• El supervisor tomará una fotografía de la materia prima, la cual incluirá en el sistema (Producción Natulac) antes de comenzar la preparación; sin dicha imagen el proceso no da la opción de iniciar la preparación.\n• Se actualizó el formato de preparación con el detalle completo de la materia prima, para que la firma sea trazable por insumo.\n• Es obligatorio que el supervisor deguste el lote para validar el perfil de sabor antes de la liberación.\n• Como medida de seguridad adicional, se cambiará el color de las bolsas de edulcorantes para facilitar su identificación."},
       {"tipo": "INCIDENCIA",
        "evento": "Bobina TPA-200 en llenadora con formato TPA-250",
        "quePaso": "El operador colocó una bobina de envases de TPA-200 en la llenadora que tenía formato TPA-250, generando una parada de 9 horas por corrección de diseño. Se pasó el tiempo probando y no fue sino hasta el operador del siguiente turno que observó que la bobina era la equivocada.",
        "comoPaso": "El operador no leyó la ficha técnica de la bobina. Además, no llevó registro en el formato de trazabilidad de envasado.",
        "accionCorrectiva": "Se decide identificar el área donde se colocan las bobinas, delimitando cada zona por línea, y una lección de un punto en el puesto de trabajo de la operación para el uso correcto de la bobina."}
     ]}'::jsonb,
   '{"1|1000": "Sin disponibilidad de envases, solo Pera y Manzana.",
     "1|500": "Merma por la plegadora.",
     "2|250": "Falla del variador de la Línea 2: 2 semanas sin producción.",
     "3|330": "Merma de arranque 7,06 %; estabilizada 4,68 %.",
     "3|200": "Cambio de presentación por necesidad de TPA-330.",
     "semi|Selecto": "Corrida corta."}'::jsonb)
)
insert into indicadores_mes (area_id, mes, modo, datos, observaciones, actualizado_en)
select a.id, m.mes, 'MANUAL', m.datos, m.observaciones, now()
from meses m
cross join areas a
where a.codigo = 'ASEPTICO'
on conflict (area_id, mes) do update
  set modo = 'MANUAL',
      datos = excluded.datos,
      observaciones = excluded.observaciones,
      actualizado_en = now()
  where indicadores_mes.actualizado_por is null;
