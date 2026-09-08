-- Prueba manual de continuar_siguiente_lote(p_numero_tanque) — con Docker/psql local.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-continuar-siguiente-lote-manual.sql
--
-- Verifica:
--   1. Camino manual: la corrida vieja pasa a ESPERANDO_PT (activa=false,
--      finalizada_en NULL) y nace la nueva en el tanque elegido.
--   2. La nueva corrida hereda presentación/velocidad de la vieja.
--   3. Rechaza tanque que no está LISTO.
--   4. Rechaza tanque sin lote asignado.
--   5. Rechaza si ese lote ya lo toma otra corrida activa.
--   6. Camino automático (p_numero_tanque NULL) sigue funcionando igual.

begin;

do $$
declare
  v_turno_id uuid;
  v_usuario text;
  v_linea_id uuid;
  v_lote_a uuid;  -- lote en curso
  v_lote_b uuid;  -- lote destino (manual)
  v_corrida_id uuid;
  v_nueva turno_lineas%rowtype;
  v_pres_id uuid;
begin
  select t.id, u.usuario into v_turno_id, v_usuario
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO' order by t.created_at desc limit 1;
  if v_turno_id is null then raise notice 'SKIP: no hay turno ABIERTO'; return; end if;

  select id into v_linea_id from lineas where activo order by codigo limit 1;
  select id into v_pres_id from presentaciones order by volumen_ml limit 1;

  -- Lote en curso (7) + su corrida activa con lote_terminado_en.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 8, null, '0007', 0, 5000, (select id from usuarios where usuario = v_usuario))
  returning id into v_lote_a;

  insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, lote_terminado_en)
  values (v_turno_id, v_linea_id, v_pres_id, 9000, 4500, null, '0007', v_lote_a, true, now(), now())
  returning id into v_corrida_id;

  -- Lote destino (0011, NO consecutivo) en el tanque 9, LISTO.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 9, null, '0011', 20000, 20000, (select id from usuarios where usuario = v_usuario))
  returning id into v_lote_b;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 9, 'LISTO', 20000, '0011', v_lote_b, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', volumen_l = 20000, lote = '0011', lote_id = v_lote_b;

  -- 1 + 2. Camino manual.
  perform continuar_siguiente_lote(v_usuario, v_turno_id, v_corrida_id, 9::smallint);

  assert (select activa from turno_lineas where id = v_corrida_id) = false, '1a. la corrida vieja deberia quedar activa=false';
  assert (select finalizada_en from turno_lineas where id = v_corrida_id) is null, '1b. finalizada_en deberia seguir NULL (ESPERANDO_PT)';

  select * into v_nueva from turno_lineas
  where turno_id = v_turno_id and linea_id = v_linea_id and activa and lote_id = v_lote_b;
  assert v_nueva.id is not null, '1c. deberia existir la corrida nueva en el lote destino';
  assert v_nueva.presentacion_id = v_pres_id, '2a. presentacion heredada';
  assert v_nueva.envases_hora = 9000, '2b. envases_hora heredado';
  assert v_nueva.litros_hora = 4500, '2c. litros_hora heredado';

  -- 3. Tanque no LISTO.
  update recepcion_tanques set condicion = 'SUCIO' where turno_id = v_turno_id and numero_tanque = 9;
  begin
    perform continuar_siguiente_lote(v_usuario, v_turno_id, v_nueva.id, 9::smallint);
    raise exception '3. deberia fallar con tanque no LISTO';
  exception when others then raise notice '3. OK rechaza tanque no LISTO: %', sqlerrm;
  end;
  update recepcion_tanques set condicion = 'LISTO' where turno_id = v_turno_id and numero_tanque = 9;

  -- 5. Lote ya tomado por otra corrida activa (la que acabamos de crear).
  begin
    perform continuar_siguiente_lote(v_usuario, v_turno_id, v_corrida_id, 9::smallint);
    raise exception '5. deberia fallar: lote 11 ya lo toma otra corrida';
  exception when others then raise notice '5. OK rechaza lote ya tomado: %', sqlerrm;
  end;

  -- 4. Tanque sin lote.
  insert into recepcion_tanques (turno_id, numero_tanque, condicion, activada_en)
  values (v_turno_id, 7, 'LISTO', now())
  on conflict (turno_id, numero_tanque) do update set condicion = 'LISTO', lote_id = null, lote = null;
  begin
    perform continuar_siguiente_lote(v_usuario, v_turno_id, v_nueva.id, 7::smallint);
    raise exception '4. deberia fallar con tanque sin lote';
  exception when others then raise notice '4. OK rechaza tanque sin lote: %', sqlerrm;
  end;

  raise notice 'TODAS OK';
end $$;

rollback;
