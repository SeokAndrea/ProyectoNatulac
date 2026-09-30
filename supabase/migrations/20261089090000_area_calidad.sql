-- ============================================================
-- ÁREA CALIDAD (de apoyo, como Servicios Industriales y Mantenimiento)
-- ============================================================
-- Rework 2026-09-29 (dueño). Calidad no produce ni abre turnos: da apoyo a
-- las áreas de producción. Funciona como Servicios Industriales (mira el
-- turno abierto de Aséptico), pero además ve los tanques En Preparación
-- para analizarlos y liberarlos.
--
--   * Área CALIDAD.
--   * En el área Calidad solo puede haber Analista de Calidad o Supervisor
--     de Calidad, y esos dos roles solo van en Calidad (o en Pruebas, para
--     probar). Lo valida un trigger en usuario_roles, así vale para crear y
--     para editar personal sin tocar esas funciones.
--   * turno_activo_de(): un usuario del área Calidad ve el turno abierto de
--     Aséptico (la única área productiva).
-- ============================================================

insert into areas (codigo, nombre) values ('CALIDAD', 'Calidad')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 1. Rol ↔ área
-- ------------------------------------------------------------
create or replace function fn_rol_area_calidad()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select codigo into v_rol from roles where id = new.rol_id;
  select codigo into v_area from areas where id = new.area_id;

  if v_area = 'CALIDAD' and v_rol not in ('CALIDAD', 'SUPERVISOR_CALIDAD') then
    raise exception 'En el área Calidad solo puede haber Analista de Calidad o Supervisor de Calidad.';
  end if;
  if v_rol in ('CALIDAD', 'SUPERVISOR_CALIDAD') and coalesce(v_area, '') not in ('CALIDAD', 'PRUEBAS') then
    raise exception 'El Analista y el Supervisor de Calidad van en el área Calidad (o en Pruebas para probar).';
  end if;
  return new;
end;
$$;

create trigger trg_rol_area_calidad
before insert or update of rol_id, area_id on usuario_roles
for each row execute function fn_rol_area_calidad();

-- ------------------------------------------------------------
-- 2. El área Calidad mira el turno de Aséptico
-- ------------------------------------------------------------
-- Última versión: 20261075090000_turno_activo_por_area.sql
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

  -- Sin área (Super Admin) o área Calidad (apoyo): el turno de Aséptico.
  if v_area_id is null or v_area_id = (select id from areas where codigo = 'CALIDAD') then
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
