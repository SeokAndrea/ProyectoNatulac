-- Prueba manual de turnos sin grupo (migración 20261084) y de las funciones de turnos
-- que no cubren los otros tests (ajustes, gracia, finalizar completo, cron) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada. Usa el Área de Pruebas.
--
--   psql "$DATABASE_URL" -f scripts/test-turno-sin-grupo.sql
--
-- Verifica:
--   1. Turno automático sin asumir: turno_json devuelve SIN_GRUPO y grupo_pendiente.
--   2. estadisticas_produccion y listar_turnos_historial devuelven SIN_GRUPO.
--   3. asignar_grupo_turno: no con el turno abierto, no sin permiso, sí con TURNO_CORREGIR
--      (código con G, queda como corrección) y no dos veces.
--   4. Esquema 12x12: supervisor no, jefe sí (con historial); el turno siguiente lo toma.
--   5. Respaldo automático: solo el dueño lo cambia.
--   6. Gracia de PT por área.
--   7. finalizar_turno completo (Pruebas, sin ceremonia).
--   8. El cron (relevo_de_respaldo y cerrar_turnos_vencidos) corre sin errores.
--   9. perfil_sesion: rol, área y permisos actuales; baja; usuario inexistente.

begin;

do $$
declare
  v_sup uuid;
  v_t uuid;
  v_t2 uuid;
  v_j jsonb;
  v_ahora timestamp := now() at time zone 'America/Caracas';
begin
  -- Pruebas sin turnos abiertos y con los de antes lejos (30 días atrás).
  update turnos set estado = 'CERRADO', fecha = fecha - 30 where area_id = (select id from areas where codigo = 'PRUEBAS');

  insert into usuarios (usuario, password_hash, nombre) values ('g_sup', 'x', 'Sup G'), ('g_jefe', 'x', 'Jefe G');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'PRUEBAS')
  from usuarios u join roles r on r.codigo = case when u.usuario = 'g_sup' then 'SUPERVISOR' else 'JEFE_PRODUCCION' end
  where u.usuario in ('g_sup', 'g_jefe');
  select id into v_sup from usuarios where usuario = 'g_sup';

  -- 1
  v_t := abrir_turno(usuario_sistema_id(), 'PRUEBAS', 'TURNO_1', 'GRUPO_2', true);
  v_j := turno_json(v_t);
  assert v_j ->> 'grupo_codigo' = 'SIN_GRUPO', '1a turno_json SIN_GRUPO: ' || (v_j ->> 'grupo_codigo');
  assert (v_j ->> 'grupo_pendiente')::boolean, '1b grupo_pendiente';

  -- 2 (una corrida para que salga en estadísticas; inactiva, no choca con las heredadas)
  insert into turno_lineas (turno_id, linea_id, activa)
  values (v_t, (select id from lineas where area_id = (select id from areas where codigo = 'PRUEBAS') and activo order by codigo limit 1), false);
  assert exists (
    select 1 from estadisticas_produccion(null, null, 'PRUEBAS') e where e.turno_id = v_t and e.grupo_codigo = 'SIN_GRUPO'
  ), '2a estadísticas SIN_GRUPO';

  -- 3
  begin
    perform asignar_grupo_turno('g_jefe', v_t, 'GRUPO_3');
    raise exception 'FALLA 3a: asignó con el turno abierto';
  exception when others then
    assert sqlerrm like 'El turno sigue abierto%', '3a mensaje: ' || sqlerrm;
  end;

  update turnos
  set estado = 'CERRADO', fecha_fin = v_ahora::date, hora_fin = v_ahora::time
  where id = v_t;

  assert exists (
    select 1 from listar_turnos_historial(p_usuario => 'g_jefe', p_area_codigo => 'PRUEBAS') h
    where h.turno_id = v_t and h.grupo_codigo = 'SIN_GRUPO'
  ), '2b lista de Auditoría SIN_GRUPO';

  begin
    perform asignar_grupo_turno('g_sup', v_t, 'GRUPO_3');
    raise exception 'FALLA 3b: supervisor asignó grupo';
  exception when others then
    assert sqlerrm like 'No tienes permiso%', '3b mensaje: ' || sqlerrm;
  end;
  v_j := asignar_grupo_turno('g_jefe', v_t, 'GRUPO_3');
  assert v_j ->> 'grupo_codigo' = 'GRUPO_3', '3c grupo asignado';
  assert v_j ->> 'codigo' like '%_T1G3%', '3d código con grupo: ' || (v_j ->> 'codigo');
  assert jsonb_array_length(v_j -> 'correcciones') = 1, '3e queda como corrección';
  begin
    perform asignar_grupo_turno('g_jefe', v_t, 'GRUPO_1');
    raise exception 'FALLA 3f: asignó dos veces';
  exception when others then
    assert sqlerrm like 'Ese turno ya tiene grupo%', '3f mensaje: ' || sqlerrm;
  end;

  -- 4
  begin
    perform guardar_esquema_turnos('g_sup', 'PRUEBAS', '12x12');
    raise exception 'FALLA 4a: supervisor cambió el esquema';
  exception when others then
    assert sqlerrm like 'No tienes permiso%', '4a mensaje: ' || sqlerrm;
  end;
  perform guardar_esquema_turnos('g_jefe', 'PRUEBAS', '12x12');
  assert ajustes_turnos('PRUEBAS') ->> 'esquema' = '12x12', '4b esquema guardado';
  assert exists (
    select 1 from esquema_turnos_historial h join areas a on a.id = h.area_id
    where a.codigo = 'PRUEBAS' and h.esquema = '12x12'
  ), '4c historial';

  -- 5
  begin
    perform guardar_turnos_automaticos('g_jefe', 'PRUEBAS', true);
    raise exception 'FALLA 5: un jefe cambió el respaldo';
  exception when others then
    assert sqlerrm like 'Solo el dueño%', '5 mensaje: ' || sqlerrm;
  end;

  -- 4 (cont.): el turno siguiente toma el esquema del área
  v_t2 := abrir_turno(v_sup, 'PRUEBAS', 'TURNO_2', 'GRUPO_1', false);
  assert (select esquema from turnos where id = v_t2) = '12x12', '4d el turno nuevo es 12x12';

  -- 6: el primero cerró recién, sigue en gracia
  assert turno_pt_gracia_de('g_sup') is not null, '6 gracia por área';

  -- 7
  perform finalizar_turno('g_sup', v_t2);
  assert (select estado from turnos where id = v_t2) = 'CERRADO', '7 finalizar_turno';

  -- 8 (lo que hagan sobre datos reales se deshace con el rollback)
  perform relevo_de_respaldo();
  perform cerrar_turnos_vencidos();

  -- 9
  v_j := perfil_sesion('g_jefe');
  assert v_j ->> 'rol' = 'JEFE_PRODUCCION' and v_j ->> 'area' = 'PRUEBAS', '9a perfil: ' || v_j::text;
  assert (v_j -> 'permisos') ? 'TURNO_CORREGIR', '9b permisos del rol';
  update usuarios set activo = false where usuario = 'g_jefe';
  assert not (perfil_sesion('g_jefe') ->> 'activo')::boolean, '9c baja';
  assert perfil_sesion('no_existe_xyz') is null, '9d no existe';

  raise notice 'OK: turnos sin grupo, ajustes, gracia, finalizar y cron';
end;
$$;

rollback;
