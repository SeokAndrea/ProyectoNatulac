-- ============================================================
-- LÍNEA 3: 330, 250 y 200 ml
-- ============================================================
-- Dueña, 2026-10-13: la Línea 3 puede llenar las tres presentaciones de
-- la Tetra Prisma. Las presentaciones de cada línea salen de
-- velocidades_llenadora (src/lib/catalogosLive.tsx,
-- presentacionesPorLineaLive). Las filas ya estaban desde 20260829090000.
-- Esta migración las asegura por si alguna se desactivó desde Edición
-- de Datos.
--
--   * Solo toca una presentación de la Línea 3 que NO tenga ninguna
--     velocidad activa. Si ya tiene alguna, se deja como está.
--   * Si la fila existe desactivada, solo la reactiva. Respeta máquina y
--     litros/hora que se hayan editado.
--   * Si no existe, la crea con los números de la Tetra Prisma, iguales
--     a los de la Línea 2.
--   * Las presentaciones de 200, 250 y 330 ml quedan activas en el
--     catálogo.
--
-- Para revisar después:
--   select l.codigo, p.volumen_ml, v.envases_hora, v.litros_hora, v.activo
--   from velocidades_llenadora v join lineas l on l.id = v.linea_id
--   join presentaciones p on p.id = v.presentacion_id
--   where l.codigo = 'LINEA_3' order by p.volumen_ml desc, v.envases_hora;
-- ============================================================

update presentaciones set activo = true where volumen_ml in (200, 250, 330) and not activo;

insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora)
select l.id, p.id, v.maquina, v.envases_hora, v.litros_hora
from (
  values
    ('LINEA_3', 330, 'TP', 7500, 2250),
    ('LINEA_3', 330, 'TP', 9000, 2970),
    ('LINEA_3', 250, 'TP', 7500, 1875),
    ('LINEA_3', 250, 'TP', 9000, 2970),
    ('LINEA_3', 200, 'TP', 7500, 1500),
    ('LINEA_3', 200, 'TP', 9000, 1800)
) as v (linea_codigo, volumen_ml, maquina, envases_hora, litros_hora)
join lineas l on l.codigo = v.linea_codigo
join presentaciones p on p.volumen_ml = v.volumen_ml
where not exists (
  select 1 from velocidades_llenadora x
  where x.linea_id = l.id and x.presentacion_id = p.id and x.activo
)
on conflict (linea_id, presentacion_id, envases_hora) do update set activo = true;
