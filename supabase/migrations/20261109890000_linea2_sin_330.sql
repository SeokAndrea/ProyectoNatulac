-- ============================================================
-- LÍNEA 2: solo 250 y 200 ml
-- ============================================================
-- Dueña, 2026-10-14: la Línea 2 llena 250 y 200 ml, no 330. Las
-- velocidades de 330 ml de la Línea 2 venían desde 20260829090000.
-- Se desactivan (no se borran: las corridas viejas las siguen
-- nombrando), en la Línea 2 y en su gemela de Pruebas (LINEA_T2).
-- Desde ahí, al arrancar la Línea 2 ya no se ofrece la 330.
--
-- La Línea 3 sigue con 330, 250 y 200 (20261109790000).
--
-- Para revisar después:
--   select l.codigo, p.volumen_ml, v.envases_hora, v.activo
--   from velocidades_llenadora v join lineas l on l.id = v.linea_id
--   join presentaciones p on p.id = v.presentacion_id
--   where l.codigo in ('LINEA_2', 'LINEA_T2') order by l.codigo, p.volumen_ml desc;
-- ============================================================

update velocidades_llenadora v
set activo = false
from lineas l, presentaciones p
where l.id = v.linea_id
  and p.id = v.presentacion_id
  and l.codigo in ('LINEA_2', 'LINEA_T2')
  and p.volumen_ml = 330
  and v.activo;
