-- ============================================================
-- GRACIA DE 15 MIN PARA CARGAR PRODUCTO TERMINADO TRAS CERRAR EL TURNO
-- ============================================================
-- Un supervisor ansioso finalizó el turno antes de que Danny pudiera
-- subir su Producto Terminado. turno_activo_de() (y por lo tanto toda
-- la sesión de turno del front — ver src/lib/sesionTurno.tsx) solo
-- devuelve turnos con estado ABIERTO, así que Producto Terminado se
-- caía de golpe a "Primero debes iniciar un turno" apenas el turno
-- pasaba a CERRADO — sin ventana para terminar de cargar lo que
-- faltaba.
--
-- turno_pt_gracia_de() es una puerta chica y aparte: el turno CERRADO
-- más reciente del usuario, SOLO si se cerró hace 15 minutos o menos
-- (medido contra turnos.updated_at — el trigger trg_turnos_auditar lo
-- pisa en cada UPDATE de turnos, y finalizar_turno() solo actualiza la
-- fila en la transición ABIERTO → CERRADO, así que queda como el
-- instante del cierre). No toca turno_activo_de(): Preparación,
-- Producción, Comenzar/Finalizar Turno siguen exigiendo ABIERTO como
-- siempre — esta puerta la usa nada más ProductoTerminado.tsx, y
-- encima en modo "solo PT" (ver soloPT ahí): durante la gracia no se
-- puede tocar Contador ni elegir Terminar/Entregar línea, solo
-- Paletas/Cajas sueltas.
-- ============================================================

create or replace function turno_pt_gracia_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
begin
  select t.id into v_turno_id
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where u.usuario = lower(p_usuario)
    and t.estado = 'CERRADO'
    and now() - t.updated_at <= interval '15 minutes'
  order by t.updated_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function turno_pt_gracia_de(text) to anon, authenticated;
