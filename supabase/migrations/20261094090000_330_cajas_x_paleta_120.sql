-- ------------------------------------------------------------
-- 330 ml: 120 cajas por paleta (15 cajas x 8 camadas), no 150.
--
-- presentaciones ya se había corregido a 120 desde la app, pero
-- producto_terminado guarda una copia (snapshot) de cajas_x_paleta al
-- registrar, así que lo cargado antes del cambio seguía multiplicando
-- por 150. Se corrigen esas filas; la columna generada
-- litros_producidos se recalcula sola.
-- ------------------------------------------------------------

update presentaciones
set cajas_x_paleta = 120,
    cant_camada = 8
where volumen_ml = 330;

update producto_terminado pt
set cajas_x_paleta = 120
from presentaciones p
where p.id = pt.presentacion_id
  and p.volumen_ml = 330
  and pt.cajas_x_paleta <> 120;
