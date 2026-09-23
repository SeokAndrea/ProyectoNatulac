-- ============================================================
-- turno_activo_de(): pasa de "el turno que abrió este usuario" a
-- "el turno ABIERTO del área de este usuario".
--
-- Por qué: iniciar_turno() ya cierra el turno anterior por ÁREA,
-- no por usuario (ver 20261035090000) — solo puede haber un turno
-- ABIERTO por área a la vez. Pero turno_activo_de() seguía
-- buscando por supervisor_id = este usuario, así que cualquier
-- OTRO usuario que quisiera reportar sobre ese mismo turno (por
-- ejemplo, el Super Administrador reportando líneas/preparaciones/
-- producto terminado) no lo encontraba, y "Comenzar Turno" le
-- habría cerrado de facto el turno real del supervisor para
-- abrirle uno nuevo a su nombre. Con esto, cualquier usuario del
-- área ve y reporta sobre el mismo turno_id.
--
-- SUPERADMINISTRADOR no tiene área fija en usuario_roles
-- (area_id null = "todas las áreas" en el resto de la app, ver
-- listar_lineas/estado_planta_actual) — hoy todos los Super Admin
-- son de Aséptico, así que se usa ese default acá.
-- ============================================================
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

  if v_area_id is null then
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
