-- ============================================================
-- «Ver como»: el dueño mira la app con los permisos de otro rol
-- ============================================================
-- Dueña, 2026-10-08: para ver cómo queda la app para un supervisor, la
-- analista, el jefe… Solo cambia lo que muestra la app (pantallas y
-- botones); lo que se hace sigue quedando con el usuario real. Esta función
-- solo devuelve el paquete de permisos de un rol (rol_permisos).
-- ============================================================

create or replace function permisos_de_rol(p_usuario text, p_rol_codigo text)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(es_dueno(p_usuario), false) then
    raise exception 'Solo el dueño puede usar «Ver como».';
  end if;
  return coalesce(
    (select array_agg(rp.permiso_codigo order by rp.permiso_codigo)
     from rol_permisos rp join roles r on r.id = rp.rol_id
     where r.codigo = p_rol_codigo),
    array[]::text[]
  );
end;
$$;
grant execute on function permisos_de_rol(text, text) to anon, authenticated;
