-- ============================================================
-- 12x12: interruptor que se aplica de inmediato
-- ============================================================
-- Rework 2026-09-27 (dueño): el 12x12 es un interruptor encendido /
-- apagado. Encendido tiene que significar "hoy es 12x12", así que el
-- cambio se aplica también al turno ABIERTO del área, no solo desde el
-- próximo. El esquema del turno solo afecta el aviso de relevo de las 19:00
-- y la línea "Esquema 12x12" del acta: aplicarlo de una no toca datos.
-- ============================================================

-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
create or replace function guardar_esquema_turnos(p_usuario text, p_area_codigo text, p_esquema text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes text;
begin
  if not tiene_permiso(p_usuario, 'ESQUEMA_TURNOS') then
    raise exception 'No tienes permiso para cambiar el esquema de turnos.';
  end if;
  if p_esquema not in ('3x8', '12x12') then
    raise exception 'Esquema no válido.';
  end if;
  select id, esquema_turnos into v_area_id, v_antes from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  if v_antes = p_esquema then
    return;
  end if;

  update areas set esquema_turnos = p_esquema where id = v_area_id;
  -- Se aplica ya al turno abierto del área (encendido = "hoy es 12x12").
  update turnos set esquema = p_esquema where area_id = v_area_id and estado = 'ABIERTO';
  insert into esquema_turnos_historial (area_id, esquema, cambiado_por)
  values (v_area_id, p_esquema, (select id from usuarios where usuario = lower(p_usuario)));

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'esquema_turnos', v_area_id::text, 'Comenzar Turno',
    'Cambió el esquema de turnos de ' || p_area_codigo || ' a ' || p_esquema,
    jsonb_build_object('esquema', v_antes), jsonb_build_object('esquema', p_esquema)
  );
end;
$$;
