-- Prueba manual del bloqueo de turno cerrado, gracia y corrección (migración 20261082) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada. Usa el Área de Pruebas.
--
--   psql "$DATABASE_URL" -f scripts/test-turno-cerrado.sql
--
-- Verifica:
--   1. Turno abierto: estado y datos pasan.
--   2. Recién cerrado (gracia): datos sí (novedad), estado no (cambiar línea).
--   3. Cerrado hace más de 30 min: datos no.
--   4. Corrección: sin permiso no; motivo corto no; con motivo, datos sí (solo para quien la abrió).
--   5. Corrida olvidada: dentro del horario sí, solapada no, fuera del horario no.
--   6. Solo se corrige el turno anterior al actual.
--   7. reabrir_turno ya no existe.
--   8. El personal del área Mantenimiento tiene rol Mantenimiento.

begin;

do $$
declare
  v_sup uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_linea text;
  v_ahora timestamp := now() at time zone 'America/Caracas';
  v_j jsonb;
begin
  -- Pruebas sin turnos abiertos y con los de antes lejos (30 días atrás), para que el orden sea el del test.
  update turnos set estado = 'CERRADO', fecha = fecha - 30 where area_id = (select id from areas where codigo = 'PRUEBAS');

  insert into usuarios (usuario, password_hash, nombre) values ('t_sup', 'x', 'Sup'), ('t_jefe', 'x', 'Jefe'), ('t_jefe2', 'x', 'Jefe 2');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'PRUEBAS')
  from usuarios u join roles r on r.codigo = case when u.usuario = 't_sup' then 'SUPERVISOR' else 'JEFE_PRODUCCION' end
  where u.usuario in ('t_sup', 't_jefe', 't_jefe2');
  select id into v_sup from usuarios where usuario = 't_sup';
  select codigo into v_linea from lineas where area_id = (select id from areas where codigo = 'PRUEBAS') and activo order by codigo limit 1;

  -- 1
  v_t1 := abrir_turno(v_sup, 'PRUEBAS', 'TURNO_1', 'GRUPO_1', false);
  -- La línea del test sin corridas heredadas (si no, la corrida olvidada chocaría con ellas).
  delete from turno_lineas where turno_id = v_t1 and linea_id = (select id from lineas where codigo = v_linea);
  perform exigir_turno_escribible('t_sup', v_t1, false);
  perform registrar_novedad_turno('t_sup', v_t1, 'Novedad con el turno abierto');

  -- 2 (se abre otro: el primero queda cerrado ahora mismo)
  v_t2 := abrir_turno(v_sup, 'PRUEBAS', 'TURNO_2', 'GRUPO_1', false);
  perform registrar_novedad_turno('t_sup', v_t1, 'Novedad en la gracia');
  begin
    perform cambiar_condicion_linea('t_sup', v_t1, v_linea, 'CIP');
    raise exception 'FALLA 2: cambió una línea de un turno cerrado';
  exception when others then
    assert sqlerrm like 'Este turno ya está cerrado%', '2 mensaje: ' || sqlerrm;
  end;

  -- 3: el primero pasa a haber durado de hace 4 h a hace 2 h.
  update turnos
  set fecha = (v_ahora - interval '4 hours')::date, hora_inicio = (v_ahora - interval '4 hours')::time,
      fecha_fin = (v_ahora - interval '2 hours')::date, hora_fin = (v_ahora - interval '2 hours')::time
  where id = v_t1;
  begin
    perform registrar_novedad_turno('t_sup', v_t1, 'Novedad tarde');
    raise exception 'FALLA 3: cargó datos tarde sin corrección';
  exception when others then
    assert sqlerrm like 'Este turno se cerró hace más de 30 minutos%', '3 mensaje: ' || sqlerrm;
  end;

  -- 4
  begin
    perform iniciar_correccion('t_sup', v_t1, 'Faltó cargar el PT');
    raise exception 'FALLA 4a: supervisor abrió corrección';
  exception when others then
    assert sqlerrm like 'No tienes permiso%', '4a mensaje: ' || sqlerrm;
  end;
  begin
    perform iniciar_correccion('t_jefe', v_t1, 'x');
    raise exception 'FALLA 4b: motivo corto';
  exception when others then
    assert sqlerrm like 'Escribe el motivo%', '4b mensaje: ' || sqlerrm;
  end;
  v_j := iniciar_correccion('t_jefe', v_t1, 'Faltó cargar el PT de la línea 1');
  assert (v_j ->> 'correccion_activa')::boolean, '4c corrección activa';
  perform registrar_novedad_turno('t_jefe', v_t1, 'Novedad por corrección');
  begin
    perform registrar_novedad_turno('t_jefe2', v_t1, 'Otro jefe sin corrección propia');
    raise exception 'FALLA 4d: cargó sin su propia corrección';
  exception when others then
    assert sqlerrm like 'Este turno se cerró hace más de 30 minutos%', '4d mensaje: ' || sqlerrm;
  end;
  begin
    perform cambiar_condicion_linea('t_jefe', v_t1, v_linea, 'CIP');
    raise exception 'FALLA 4e: la corrección cambió estado';
  exception when others then
    assert sqlerrm like 'Este turno ya está cerrado%', '4e mensaje: ' || sqlerrm;
  end;

  -- 5
  v_j := agregar_corrida_retroactiva(
    't_jefe', v_t1, v_linea, (select id from sabores where activo limit 1),
    (select p.volumen_ml from presentaciones p limit 1), 9000, null, null,
    (v_ahora - interval '3 hours 30 minutes') at time zone 'America/Caracas',
    (v_ahora - interval '3 hours') at time zone 'America/Caracas'
  );
  assert exists (
    select 1 from turno_lineas where turno_id = v_t1 and not activa and finalizada_en is not null
      and activada_en = (v_ahora - interval '3 hours 30 minutes') at time zone 'America/Caracas'
  ), '5a corrida olvidada agregada y terminada';
  begin
    perform agregar_corrida_retroactiva(
      't_jefe', v_t1, v_linea, (select id from sabores where activo limit 1),
      (select p.volumen_ml from presentaciones p limit 1), 9000, null, null,
      (v_ahora - interval '3 hours 15 minutes') at time zone 'America/Caracas',
      (v_ahora - interval '2 hours 50 minutes') at time zone 'America/Caracas'
    );
    raise exception 'FALLA 5b: se solapó';
  exception when others then
    assert sqlerrm like '%ya tiene una corrida en ese horario%', '5b mensaje: ' || sqlerrm;
  end;
  begin
    perform agregar_corrida_retroactiva(
      't_jefe', v_t1, v_linea, (select id from sabores where activo limit 1),
      (select p.volumen_ml from presentaciones p limit 1), 9000, null, null,
      (v_ahora - interval '1 hour') at time zone 'America/Caracas',
      (v_ahora - interval '30 minutes') at time zone 'America/Caracas'
    );
    raise exception 'FALLA 5c: fuera del horario';
  exception when others then
    assert sqlerrm like 'La corrida tiene que estar dentro del horario%', '5c mensaje: ' || sqlerrm;
  end;

  -- 6: con un tercer turno, el primero ya no es el anterior al actual.
  perform abrir_turno(v_sup, 'PRUEBAS', 'TURNO_3', 'GRUPO_1', false);
  assert turno_corregible(v_t2), '6a el anterior sí';
  assert not turno_corregible(v_t1), '6b el de antes no';

  -- 7
  assert not exists (select 1 from pg_proc where proname = 'reabrir_turno'), '7 reabrir_turno borrada';

  -- 8
  assert not exists (
    select 1 from usuario_roles ur join areas a on a.id = ur.area_id join roles r on r.id = ur.rol_id
    where a.codigo = 'MANTENIMIENTO' and r.codigo = 'SUPERVISOR'
  ), '8 nadie de Mantenimiento queda como Supervisor';

  raise notice 'OK: turno cerrado, gracia y corrección';
end;
$$;

rollback;
