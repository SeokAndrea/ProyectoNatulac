-- Prueba manual de 20261031 (volumen_vivo_tanque como fuente única) —
-- con Docker/psql local o el SQL editor del proyecto de PRUEBAS.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-volumen-vivo-tanque.sql
--
-- Reproduce el caso de planta (Turno 3, Javier): el tanque origen tiene
-- el volumen CONGELADO inflado en recepcion_tanques (lo que la línea ya
-- se llevó no se restó ahí), y el volumen VIVO real en preparaciones.
--
-- Verifica:
--   1. volumen_vivo_tanque() devuelve el VIVO (4300), no el congelado (8400).
--   2. Transferir LIQUIDO: el destino sube SOLO el vivo -> 16260 + 4300
--      = 20560 (no 24660).
--   3. Conservación de volumen_inicial_l: lo que baja el origen ==
--      lo que sube el destino == 4300.
--   4. transferencias.litros == 4300.
--   5. turno_json.tanques[].volumen_l del destino == 20560 (misma función).

begin;

do $$
declare
  v_turno_id uuid;
  v_usuario text;
  v_uid uuid;
  v_lote_o uuid;
  v_lote_d uuid;
  v_vivo numeric := 4300;      -- lo que queda de verdad en el origen
  v_congelado numeric := 8400; -- lo que recepcion_tanques quedó marcando
  v_dest_antes numeric := 16260;
  v_vi_o_antes numeric;
  v_vi_d_antes numeric;
  v_dest_despues numeric;
  v_vi_o_despues numeric;
  v_vi_d_despues numeric;
  v_transf_litros numeric;
  v_vivo_fn numeric;
  v_json_dest numeric;
begin
  select t.id, u.usuario, u.id into v_turno_id, v_usuario, v_uid
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO' order by t.created_at desc limit 1;
  if v_turno_id is null then raise notice 'SKIP: no hay turno ABIERTO'; return; end if;

  -- Origen: tanque 8. Lote VIVO 4300, pero volumen_inicial_l 8400 (la
  -- línea ya se llevó 4100 y su PT bajó preparaciones.volumen_l).
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 8, null, 'PERA-1', v_vivo, v_congelado, v_uid) returning id into v_lote_o;
  -- Destino: tanque 9, mismo sabor (null), lote de pera con 16260.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 9, null, 'PERA-2', v_dest_antes, v_dest_antes, v_uid) returning id into v_lote_d;

  -- recepcion_tanques: el ORIGEN quedó CONGELADO en 8400 (el bug).
  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 8, 'LISTO', null, v_congelado, 'PERA-1', v_lote_o, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', sabor_id = null, volumen_l = v_congelado, lote = 'PERA-1', lote_id = v_lote_o, activada_en = now();
  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 9, 'LISTO', null, v_dest_antes, 'PERA-2', v_lote_d, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', sabor_id = null, volumen_l = v_dest_antes, lote = 'PERA-2', lote_id = v_lote_d, activada_en = now();

  -- 1. La función devuelve el vivo, no el congelado.
  v_vivo_fn := volumen_vivo_tanque(v_turno_id, 8::smallint);
  assert v_vivo_fn = v_vivo, format('volumen_vivo_tanque = %s, esperaba %s', v_vivo_fn, v_vivo);

  select volumen_inicial_l into v_vi_o_antes from preparaciones where id = v_lote_o;
  select volumen_inicial_l into v_vi_d_antes from preparaciones where id = v_lote_d;

  -- Transferir líquido 8 -> 9.
  perform transferir_tanque(v_usuario, v_turno_id, 8::smallint, 9::smallint, 'LIQUIDO', 'CONSOLIDAR_RESTOS');

  select volumen_l, volumen_inicial_l into v_dest_despues, v_vi_d_despues from preparaciones where id = v_lote_d;
  select volumen_inicial_l into v_vi_o_despues from preparaciones where id = v_lote_o;
  select litros into v_transf_litros from transferencias
  where turno_id = v_turno_id and tanque_origen = 8 order by creado_en desc limit 1;
  select (tq ->> 'volumen_l')::numeric into v_json_dest
  from jsonb_array_elements(turno_json(v_turno_id) -> 'tanques') tq
  where (tq ->> 'numero_tanque')::int = 9;

  -- 2. Destino sube solo el vivo.
  assert v_dest_despues = v_dest_antes + v_vivo,
    format('destino esperaba %s, obtuvo %s (bug si = %s)', v_dest_antes + v_vivo, v_dest_despues, v_dest_antes + v_congelado);
  -- 3. Conservación con el vivo. El destino sube su volumen_inicial_l por
  --    el vivo. El origen NO lo encoge (20261034): el resto que se movió
  --    queda como "fin" del tramo en su volumen_l, y ahí se compensa.
  assert v_vi_d_despues - v_vi_d_antes = v_vivo,
    format('destino volumen_inicial_l subió %s, esperaba %s', v_vi_d_despues - v_vi_d_antes, v_vivo);
  assert v_vi_o_antes - v_vi_o_despues = 0,
    format('origen volumen_inicial_l cambió %s, esperaba 0 (20261034 ya no lo encoge)', v_vi_o_antes - v_vi_o_despues);
  -- 4. El log registra el vivo.
  assert v_transf_litros = v_vivo,
    format('transferencias.litros = %s, esperaba %s', v_transf_litros, v_vivo);
  -- 5. turno_json (misma función) da el mismo número.
  assert v_json_dest = v_dest_antes + v_vivo,
    format('turno_json destino = %s, esperaba %s', v_json_dest, v_dest_antes + v_vivo);

  raise notice 'OK — vivo % / destino % (= % + %) / log % / json %',
    v_vivo_fn, v_dest_despues, v_dest_antes, v_vivo, v_transf_litros, v_json_dest;
end $$;

rollback;
