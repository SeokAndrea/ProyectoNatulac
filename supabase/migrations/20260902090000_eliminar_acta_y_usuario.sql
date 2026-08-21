-- ============================================================
-- ELIMINAR TURNO (acta) y ELIMINAR PERSONAL (borrado real)
-- ============================================================
-- Hasta ahora todo era baja lógica (activo = false). Esto agrega
-- borrado REAL, con dos salvaguardas que ya vienen gratis del
-- esquema, sin necesidad de código extra:
--
--   1. eliminar_turno: solo permite borrar turnos CERRADOS (no se
--      puede borrar uno en curso — rompería la sesión del supervisor
--      que lo tiene abierto). Al borrar el turno, se borran en
--      cascada turno_lineas, recepcion_tanques, contadores y
--      producto_terminado (todas esas tablas tienen
--      "on delete cascade" hacia turnos, ver 20260819120000 y
--      siguientes).
--
--   2. eliminar_personal: la tabla "usuarios" NO tiene cascada desde
--      turnos/contadores/producto_terminado hacia ella (al revés sí,
--      pero no en este sentido) — si la persona ya tiene turnos o
--      contadores registrados, Postgres va a rechazar el DELETE solo
--      por la restricción de llave foránea (error 23503), sin que
--      haga falta ninguna validación manual acá. El frontend
--      atrapa ese error y explica que hay que desactivar en vez de
--      eliminar. Esto es intencional: evita borrar sin querer el
--      historial de producción de alguien.
-- ============================================================

create or replace function eliminar_turno(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_estado text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para hacer esto.';
  end if;

  select estado into v_estado from turnos where id = p_turno_id;
  if v_estado is null then
    raise exception 'Ese turno no existe.';
  end if;
  if v_estado <> 'CERRADO' then
    raise exception 'No se puede eliminar un turno en curso.';
  end if;

  delete from turnos where id = p_turno_id;
end;
$$;

create or replace function eliminar_personal(p_creador_usuario text, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para eliminar a esta persona.';
  end if;

  delete from usuarios where id = p_usuario_id;
end;
$$;

grant execute on function eliminar_turno(text, uuid) to anon, authenticated;
grant execute on function eliminar_personal(text, uuid) to anon, authenticated;
