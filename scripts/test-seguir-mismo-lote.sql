-- Prueba manual de seguir_mismo_lote() — correr con Docker/psql local.
-- Todo dentro de begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-seguir-mismo-lote.sql
--
-- Verifica:
--   1. Deshace lote_terminado_en en una corrida activa con lote con volumen.
--   2. NO toca preparaciones.volumen_l / volumen_inicial_l ni recepcion_tanques.
--   3. Rechaza si la corrida no está activa.
--   4. Rechaza si el lote ya está cerrado.
--   5. Rechaza si el lote no tiene volumen (<= 0).
--   6. No-op silencioso si la corrida ya está corriendo (sin marca).

begin;

do $$
declare
  v_turno_id uuid;
  v_usuario text;
  v_linea_id uuid;
  v_lote_id uuid;
  v_corrida_id uuid;
  v_tanque_no smallint;
  v_vol_prep_antes numeric;
  v_vol_ini_antes numeric;
  v_vol_tanque_antes numeric;
  v_lote_term timestamptz;
begin
  select t.id, u.usuario into v_turno_id, v_usuario
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO'
  order by t.created_at desc limit 1;

  if v_turno_id is null then
    raise notice 'SKIP: no hay turno ABIERTO de prueba';
    return;
  end if;

  select id into v_linea_id from lineas where activo order by codigo limit 1;

  -- Lote de prueba con volumen.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 9, null, '9001', 5000, 5000, (select id from usuarios where usuario = v_usuario))
  returning id, numero_tanque into v_lote_id, v_tanque_no;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 9, 'LISTO', 5000, '9001', v_lote_id, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', volumen_l = 5000, lote = '9001', lote_id = v_lote_id;

  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, lote_id, activa, activada_en, lote_terminado_en)
  values (v_turno_id, v_linea_id, null, '9001', v_lote_id, true, now(), now())
  returning id into v_corrida_id;

  select volumen_l, volumen_inicial_l into v_vol_prep_antes, v_vol_ini_antes from preparaciones where id = v_lote_id;
  select volumen_l into v_vol_tanque_antes from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 9;

  -- 1. Camino feliz.
  perform seguir_mismo_lote(v_usuario, v_turno_id, v_corrida_id);
  select lote_terminado_en into v_lote_term from turno_lineas where id = v_corrida_id;
  assert v_lote_term is null, '1. lote_terminado_en deberia quedar NULL';

  -- 2. No tocó volúmenes.
  assert (select volumen_l from preparaciones where id = v_lote_id) = v_vol_prep_antes, '2a. volumen_l cambió';
  assert (select volumen_inicial_l from preparaciones where id = v_lote_id) = v_vol_ini_antes, '2b. volumen_inicial_l cambió';
  assert (select volumen_l from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 9) = v_vol_tanque_antes, '2c. volumen tanque cambió';

  -- 6. Segunda llamada: no-op, sin error.
  perform seguir_mismo_lote(v_usuario, v_turno_id, v_corrida_id);

  -- 3. Corrida no activa -> error.
  update turno_lineas set lote_terminado_en = now(), activa = false where id = v_corrida_id;
  begin
    perform seguir_mismo_lote(v_usuario, v_turno_id, v_corrida_id);
    raise exception '3. deberia haber fallado con corrida no activa';
  exception when others then
    raise notice '3. OK rechaza corrida no activa: %', sqlerrm;
  end;
  update turno_lineas set activa = true where id = v_corrida_id;

  -- 4. Lote cerrado -> error.
  update preparaciones set cerrado_en = now() where id = v_lote_id;
  begin
    perform seguir_mismo_lote(v_usuario, v_turno_id, v_corrida_id);
    raise exception '4. deberia haber fallado con lote cerrado';
  exception when others then
    raise notice '4. OK rechaza lote cerrado: %', sqlerrm;
  end;
  update preparaciones set cerrado_en = null where id = v_lote_id;

  -- 5. Lote sin volumen -> error.
  update preparaciones set volumen_l = 0 where id = v_lote_id;
  begin
    perform seguir_mismo_lote(v_usuario, v_turno_id, v_corrida_id);
    raise exception '5. deberia haber fallado con lote sin volumen';
  exception when others then
    raise notice '5. OK rechaza lote sin volumen: %', sqlerrm;
  end;

  raise notice 'TODAS OK';
end $$;

rollback;
