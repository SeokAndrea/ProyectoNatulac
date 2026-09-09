-- ============================================================
-- Case 6 — Finalizar exige resolver toda corrida todavía activa
-- ============================================================
-- Hoy `finalizar_turno` solo rechaza una corrida en ESPERANDO_PT
-- (`activa=false, finalizada_en NULL`). Una corrida **todavía activa**
-- (corriendo o en Parada Operacional) pasa: el frontend avisa pero deja
-- "Finalizar de todos modos". Resultado: el turno cierra sin el Producto
-- Terminado del tramo de ESA línea en ESE turno — y esa producción no
-- se registra nunca (el turno siguiente hereda una corrida nueva, nadie
-- vuelve a cargar el tramo perdido).
--
-- Diseño (plan-rework-3-modulos-y-merma.md, tabla de casos, fila "Turno
-- termina con corrida corriendo/pausada"): Finalizar OBLIGA, por línea
-- activa, cargar el PT del tramo + elegir Terminar o Entregar línea.
--   - Terminar        -> la corrida deja de estar `activa`.
--   - Entregar línea  -> `entregada_en` queda sellado, sigue el turno
--                        siguiente con una corrida fresca.
-- Cualquiera de las dos destraba. Si la línea no produjo nada, se carga
-- PT 0/0 igual (raro que nada salga si la línea se activó — pero se
-- registra el 0 explícito en vez de perder un número real).
--
-- `create or replace`, sin cambio de firma. `cerrar_turnos_vencidos()`
-- (cron) hace su propio UPDATE, NO llama a esta función — no hay
-- deadlock con el cierre automático.
-- ============================================================

create or replace function finalizar_turno(p_turno_id uuid, p_fecha_fin date, p_hora_fin time)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
begin
  -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
  end if;

  -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
  -- del tramo de este turno y elegir Terminar o Entregar línea.
  select string_agg(l.nombre, ', ' order by l.codigo)
  into v_lineas_activas
  from turno_lineas tl
  join lineas l on l.id = tl.linea_id
  where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

  if v_lineas_activas is not null then
    raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
      v_lineas_activas;
  end if;

  update turnos
  set estado = 'CERRADO', fecha_fin = p_fecha_fin, hora_fin = p_hora_fin
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function finalizar_turno(uuid, date, time) to anon, authenticated;
