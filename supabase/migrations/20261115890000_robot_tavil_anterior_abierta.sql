-- ============================================================
-- Robot Tavil: el aviso del lote anterior no dice «cerró» si sigue abierto
-- (Alexander, 2026-11-09)
-- ============================================================
-- Si el supervisor carga un lote nuevo sin cerrar el anterior y el operador
-- toca «Iniciar», la tarjeta mostraba «El lote X cerró con N paletas…»
-- aunque esa corrida seguía abierta (por ejemplo, esperando su PT).
--
-- robot_tavil_corrida_json agrega 'abierta' (robot_tavil_corrida_abierta).
-- Con ese dato la pantalla dice «El lote X sigue abierto con N paletas…
-- hasta que el supervisor lo cierre». Lo demás de la función no cambia.
--
-- Se puede correr más de una vez.
-- ============================================================

create or replace function robot_tavil_corrida_json(p_turno_linea_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', tl.id,
    'lote', tl.lote,
    'sabor_nombre', sabor_display(s.nombre, f.nombre),
    'presentacion_volumen_ml', p.volumen_ml,
    'paletas', (select count(*) from robot_tavil_paletas rp where rp.turno_linea_id = tl.id and rp.anulada_en is null),
    'ultima_paleta_en', (select max(rp.creada_en) from robot_tavil_paletas rp where rp.turno_linea_id = tl.id and rp.anulada_en is null),
    'resto', coalesce((select r.cajas from robot_tavil_resto r where r.turno_linea_id = tl.id), 0),
    'entregada', tl.entregada_en is not null,
    'abierta', robot_tavil_corrida_abierta(tl.id)
  )
  from turno_lineas tl
  left join presentaciones p on p.id = tl.presentacion_id
  left join sabores s on s.id = tl.sabor_id
  left join familias_producto f on f.id = s.familia_id
  where tl.id = p_turno_linea_id;
$$;
revoke execute on function robot_tavil_corrida_json(uuid) from public, anon, authenticated;
