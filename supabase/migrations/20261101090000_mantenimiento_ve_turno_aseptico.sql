-- ============================================================
-- MANTENIMIENTO VE EL TURNO DE ASÉPTICO (como Calidad)
-- ============================================================
-- Mantenimiento es un área de apoyo: no abre turnos. turno_activo_de()
-- solo mandaba a Calidad al turno abierto de Aséptico; para Mantenimiento
-- buscaba un turno de su propia área (nunca hay) y el banner decía
-- "Sin turno iniciado". Ahora Mantenimiento ve el turno de Aséptico.
-- Solo lectura: sus permisos no cambian.
-- ============================================================

-- Última versión: migrations\20261089090000_area_calidad.sql
create or replace function turno_activo_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area_id uuid;
  v_turno_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    return null;
  end if;

  select ur.area_id into v_area_id
  from usuario_roles ur
  where ur.usuario_id = v_usuario_id
  limit 1;

  -- Sin área (Super Admin) o áreas de apoyo Calidad y Mantenimiento: el turno de Aséptico.
  if v_area_id is null
     or v_area_id in (select id from areas where codigo in ('CALIDAD', 'MANTENIMIENTO')) then
    select id into v_area_id from areas where codigo = 'ASEPTICO';
  end if;

  select t.id into v_turno_id
  from turnos t
  where t.area_id = v_area_id and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;
