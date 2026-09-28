-- Prueba manual de responsable, relevo, entrega automática y respaldo (migración 20261080) — correr con psql.
-- Todo dentro de begin/rollback: no deja nada. Usa el Área de Pruebas (sin turnos abiertos reales).
--
--   psql "$DATABASE_URL" -f scripts/test-turno-respaldo.sql
--
-- Verifica:
--   1. abrir_turno manual: código con G, responsable INICIO.
--   2. Abrir otro turno con una corrida activa sin entregar: la corrida se
--      ENTREGA sola (no se sella) y el turno nuevo la hereda activa.
--   3. Turno automático: sin responsable, grupo pendiente, código sin G.
--   4. iniciar_turno rechaza si hay un turno sin responsable abierto.
--   5. asumir_turno: pide grupo, fija código con G, responsable ASUMIR.
--   6. Relevo: otro usuario toma el turno (RELEVO), el tramo anterior se cierra.
--   7. Finalizar cierra el tramo del último responsable (trigger).
--   8. Sin permiso TURNO_ASUMIR no se asume.
--   9. turno_de_hora: franjas y madrugada.

begin;

do $$
declare
  v_a uuid;
  v_b uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_linea uuid;
  v_corrida uuid;
  v_j jsonb;
  v_codigo text;
  v_f record;
begin
  -- Pruebas arranca sin turnos abiertos.
  update turnos set estado = 'CERRADO' where area_id = (select id from areas where codigo = 'PRUEBAS') and estado = 'ABIERTO';

  insert into usuarios (usuario, password_hash, nombre) values ('t_a', 'x', 'Sup A'), ('t_b', 'x', 'Sup B'), ('t_m', 'x', 'Mant');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, (select id from areas where codigo = 'PRUEBAS')
  from usuarios u join roles r on r.codigo = case when u.usuario = 't_m' then 'MANTENIMIENTO' else 'SUPERVISOR' end
  where u.usuario in ('t_a', 't_b', 't_m');
  select id into v_a from usuarios where usuario = 't_a';
  select id into v_b from usuarios where usuario = 't_b';

  -- 1
  v_t1 := abrir_turno(v_a, 'PRUEBAS', 'TURNO_1', 'GRUPO_2', false);
  select codigo into v_codigo from turnos where id = v_t1;
  assert v_codigo like '%_T1G2%', '1a código con grupo: ' || v_codigo;
  assert (select count(*) from turno_responsables where turno_id = v_t1 and usuario_id = v_a and motivo = 'INICIO') = 1, '1b responsable INICIO';

  -- 2
  -- Línea sin corrida activa heredada; si todas tienen, se libera la primera.
  select l.id into v_linea from lineas l
  where l.area_id = (select id from areas where codigo = 'PRUEBAS') and l.activo
    and not exists (select 1 from turno_lineas tl where tl.turno_id = v_t1 and tl.linea_id = l.id and tl.activa)
  order by l.codigo limit 1;
  if v_linea is null then
    select id into v_linea from lineas where area_id = (select id from areas where codigo = 'PRUEBAS') and activo order by codigo limit 1;
    update turno_lineas set activa = false, finalizada_en = now() where turno_id = v_t1 and linea_id = v_linea and activa;
  end if;
  insert into turno_lineas (turno_id, linea_id) values (v_t1, v_linea) returning id into v_corrida;
  v_t2 := abrir_turno(v_b, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  assert (select estado from turnos where id = v_t1) = 'CERRADO', '2a el anterior se cerró';
  assert (select entrega_automatica and activa and entregada_en is not null from turno_lineas where id = v_corrida), '2b entregada sola, no sellada';
  assert exists (select 1 from turno_lineas where turno_id = v_t2 and linea_id = v_linea and activa), '2c el turno nuevo la hereda activa';
  assert (select hasta is not null from turno_responsables where turno_id = v_t1), '2d tramo de A cerrado';

  -- 3
  v_t3 := abrir_turno(usuario_sistema_id(), 'PRUEBAS', 'TURNO_3', 'GRUPO_2', true);
  select codigo into v_codigo from turnos where id = v_t3;
  assert v_codigo not like '%G%', '3a código sin grupo: ' || v_codigo;
  assert (select grupo_pendiente and apertura_automatica from turnos where id = v_t3), '3b grupo pendiente';
  assert not exists (select 1 from turno_responsables where turno_id = v_t3), '3c sin responsable';
  v_j := turno_json(v_t3);
  assert (v_j ->> 'sin_responsable')::boolean, '3d turno_json sin_responsable';

  -- 4
  begin
    perform iniciar_turno('t_a', 'PRUEBAS', 'TURNO_3', 'GRUPO_1');
    raise exception 'FALLA 4: inició con turno sin responsable abierto';
  exception when others then
    assert sqlerrm like 'Ya hay un turno abierto sin responsable%', '4 mensaje: ' || sqlerrm;
  end;

  -- 5
  begin
    perform asumir_turno('t_a', v_t3, null);
    raise exception 'FALLA 5a: asumió sin grupo';
  exception when others then
    assert sqlerrm like 'Elige el grupo%', '5a mensaje: ' || sqlerrm;
  end;
  v_j := asumir_turno('t_a', v_t3, 'GRUPO_3');
  assert v_j ->> 'codigo' like '%_T3G3%', '5b código con grupo: ' || (v_j ->> 'codigo');
  assert not (v_j ->> 'sin_responsable')::boolean, '5c ya tiene responsable';
  assert (select motivo from turno_responsables where turno_id = v_t3 and usuario_id = v_a) = 'ASUMIR', '5d motivo ASUMIR';

  -- 6
  v_j := asumir_turno('t_b', v_t3);
  assert (select supervisor_id from turnos where id = v_t3) = v_b, '6a supervisor pasa a B';
  assert (select motivo from turno_responsables where turno_id = v_t3 and usuario_id = v_b) = 'RELEVO', '6b motivo RELEVO';
  assert (select hasta is not null from turno_responsables where turno_id = v_t3 and usuario_id = v_a), '6c tramo de A cerrado';
  assert jsonb_array_length(v_j -> 'responsables') = 2, '6d turno_json con 2 responsables';

  -- 7
  update turnos set estado = 'CERRADO' where id = v_t3;
  assert not exists (select 1 from turno_responsables where turno_id = v_t3 and hasta is null), '7 cierre cierra el tramo';

  -- 8
  v_t1 := abrir_turno(v_a, 'PRUEBAS', 'TURNO_1', 'GRUPO_1', false);
  begin
    perform asumir_turno('t_m', v_t1);
    raise exception 'FALLA 8: mantenimiento asumió';
  exception when others then
    assert sqlerrm like 'No tienes permiso%', '8 mensaje: ' || sqlerrm;
  end;

  -- 9
  select * into v_f from turno_de_hora(timestamp '2026-09-27 06:59');
  assert v_f.tipo_codigo = 'TURNO_3' and v_f.fecha = date '2026-09-26', '9a madrugada es T3 del día anterior';
  select * into v_f from turno_de_hora(timestamp '2026-09-27 15:00');
  assert v_f.tipo_codigo = 'TURNO_2' and v_f.inicio = timestamp '2026-09-27 15:00', '9b 15:00 es T2';
  select * into v_f from turno_de_hora(timestamp '2026-09-27 22:30');
  assert v_f.tipo_codigo = 'TURNO_3' and v_f.fecha = date '2026-09-27', '9c 22:30 es T3';

  raise notice 'OK: turnos responsable, relevo y respaldo';
end;
$$;

rollback;
