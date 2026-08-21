-- ============================================================
-- EDICIÓN DE SABORES desde la interfaz (Edición de Datos)
-- ============================================================
-- Primera pieza de la página "Edición de Datos" (solo
-- SUPERADMINISTRADOR, ver src/pages/apps/EdicionDatos.tsx): permite
-- crear, editar y dar de baja sabores desde el navegador, sin tocar
-- SQL a mano. Mismo patrón que las funciones de usuarios.ts (security
-- definer, ya que "sabores" y "familias_producto" tienen RLS activado
-- y sin políticas — ver supabase/ESQUEMA.md).
--
-- La baja es lógica (activo = false), no borrado real: los sabores ya
-- pueden estar referenciados desde otro lado más adelante, y así se
-- pueden reactivar si fue un error.
-- ============================================================

create or replace function listar_familias()
returns table (familia_id uuid, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select f.id, f.nombre
  from familias_producto f
  order by f.nombre;
end;
$$;

create or replace function listar_sabores()
returns table (
  sabor_id uuid,
  nombre text,
  volumen numeric,
  activo boolean,
  familia_id uuid,
  familia_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id, s.nombre, s.volumen, s.activo, f.id, f.nombre
  from sabores s
  join familias_producto f on f.id = s.familia_id
  order by f.nombre, s.nombre;
end;
$$;

create or replace function crear_sabor(p_familia_id uuid, p_nombre text, p_volumen numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sabor_id uuid;
begin
  insert into sabores (familia_id, nombre, volumen)
  values (p_familia_id, p_nombre, p_volumen)
  returning id into v_sabor_id;

  return v_sabor_id;
end;
$$;

create or replace function editar_sabor(p_sabor_id uuid, p_nombre text, p_volumen numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sabores
  set nombre = p_nombre,
      volumen = p_volumen
  where id = p_sabor_id;
end;
$$;

create or replace function desactivar_sabor(p_sabor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sabores set activo = false where id = p_sabor_id;
end;
$$;

create or replace function reactivar_sabor(p_sabor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sabores set activo = true where id = p_sabor_id;
end;
$$;

grant execute on function listar_familias() to anon, authenticated;
grant execute on function listar_sabores() to anon, authenticated;
grant execute on function crear_sabor(uuid, text, numeric) to anon, authenticated;
grant execute on function editar_sabor(uuid, text, numeric) to anon, authenticated;
grant execute on function desactivar_sabor(uuid) to anon, authenticated;
grant execute on function reactivar_sabor(uuid) to anon, authenticated;
