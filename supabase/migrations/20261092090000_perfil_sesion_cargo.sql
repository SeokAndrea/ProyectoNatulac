-- ============================================================
-- perfil_sesion(): también devuelve el CARGO de la persona
-- ============================================================
-- El inicio (Hub) ordena las tarjetas según el cargo (usuarios.cargo,
-- migración 20260982), no según el rol: quien tiene cargo "Supervisor" ve
-- en el teléfono el flujo del turno arriba de todo (dueño, 2026-09-30).
-- El cargo sigue siendo solo un rótulo: no da ni quita permisos.
--
-- Idéntica a 20261084 + 'cargo'. Solo agrega un dato; la app vieja lo ignora.
-- ============================================================
create or replace function perfil_sesion(p_usuario text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activo', u.activo,
    'rol', r.codigo,
    'area', a.codigo,
    'es_dueno', u.ve_errores,
    'cargo', u.cargo,
    'permisos', to_jsonb(permisos_de(u.usuario))
  )
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  where u.usuario = lower(p_usuario)
  limit 1;
$$;

grant execute on function perfil_sesion(text) to anon, authenticated;
