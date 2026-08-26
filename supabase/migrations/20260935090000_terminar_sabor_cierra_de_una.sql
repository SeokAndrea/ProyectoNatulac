-- ============================================================
-- "TERMINÓ SABOR" CIERRA LA CORRIDA DE UNA, EN VEZ DE QUEDAR
-- "ESPERANDO CIERRE" PARA SIEMPRE
-- ============================================================
-- terminar_sabor_linea() (20260913090000_linea_parada_terminar_sabor.sql)
-- solo pone activa=false — nunca se tocó cuando
-- 20260928090000_cerrar_corrida_desde_contador_o_producto.sql agregó
-- cerrar_corrida_si_esperando(), la función que decide Sucio/Standby
-- del tanque y marca finalizada_en. Esa función SOLO se llama desde
-- registrar_contador()/registrar_producto_terminado() — si el
-- supervisor ya había cargado el Contador y el Producto Terminado
-- ANTES de apretar Terminó Sabor (el caso normal: cargás los números
-- finales y recién ahí cerrás), la corrida queda en "Esperando cierre"
-- PARA SIEMPRE, porque nada vuelve a llamar a ninguna de las dos.
--
-- Se corrige de raíz: terminar_sabor_linea() también llama a
-- cerrar_corrida_si_esperando() — si ya había datos cargados, cierra
-- en el momento; si no, se queda esperando ese último dato como
-- siempre (comportamiento sin cambios para ese caso).
-- ============================================================

create or replace function terminar_sabor_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set activa = false, pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_sabor_linea(text, uuid, uuid) to anon, authenticated;
