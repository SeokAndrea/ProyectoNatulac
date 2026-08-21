-- ============================================================
-- FORZAR ELIMINACIÓN DE PERSONAL (para limpiar datos de prueba)
-- ============================================================
-- eliminar_personal() por defecto sigue protegido: si la persona
-- tiene turnos o contadores, Postgres lo rechaza (llave foránea).
-- Se agrega un parámetro p_forzar: si es true, borra primero los
-- turnos de esa persona (lo que en cascada se lleva turno_lineas,
-- recepcion_tanques, contadores y producto_terminado — todas esas
-- tablas ya tienen "on delete cascade" hacia turnos) y recién
-- entonces borra a la persona.
--
-- Uso pensado: limpiar usuarios de prueba que quedaron con turnos de
-- prueba encima. Esto SÍ borra producción real si se usa mal — no es
-- una opción para el día a día, es un escape hatch explícito.
-- ============================================================

drop function if exists eliminar_personal(text, uuid);

create or replace function eliminar_personal(p_creador_usuario text, p_usuario_id uuid, p_forzar boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_gestionar_personal(p_creador_usuario, p_usuario_id) then
    raise exception 'No tienes permiso para eliminar a esta persona.';
  end if;

  if p_forzar then
    delete from turnos where supervisor_id = p_usuario_id;
    -- Defensivo: en este proyecto no se usa Supabase Auth, así que
    -- auth.uid() (usado en los triggers de auditoría) siempre guarda
    -- NULL acá — pero por si eso cambia más adelante, se limpia igual.
    delete from turnos_historial where usuario_id = p_usuario_id;
    delete from contadores_historial where usuario_id = p_usuario_id;
  end if;

  delete from usuarios where id = p_usuario_id;
end;
$$;

grant execute on function eliminar_personal(text, uuid, boolean) to anon, authenticated;
