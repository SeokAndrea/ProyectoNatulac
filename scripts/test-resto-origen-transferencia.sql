-- Prueba manual de capturar_resto_origen_transferencia() — con Docker/psql local.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-resto-origen-transferencia.sql
--
-- Verifica, sobre una transferencia LIQUIDO real:
--   1. Reabre el lote origen con el resto y deja el tanque en STANDBY.
--   2. Al origen le devuelve el crédito: volumen_inicial_l += resto.
--   3. Al destino le baja volumen_l y volumen_inicial_l en el resto.
--   4. Dos filas nuevas en preparaciones_ajuste (origen +resto, destino -resto).
--   5. Segunda llamada = no-op (idempotente).
--   6. Rechaza resto >= lo transferido.
--   7. Rechaza si la transferencia fue modo LOTE.

begin;

do $$
declare
  v_turno_id uuid;
  v_usuario text;
  v_uid uuid;
  v_lote_o uuid;
  v_lote_d uuid;
  v_vi_o_antes numeric;
  v_vi_d_post_transf numeric;
  v_vol_d_post_transf numeric;
  v_ajustes_antes int;
  v_resto numeric := 300;
begin
  select t.id, u.usuario, u.id into v_turno_id, v_usuario, v_uid
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO' order by t.created_at desc limit 1;
  if v_turno_id is null then raise notice 'SKIP: no hay turno ABIERTO'; return; end if;

  -- Origen: tanque 8, lote 0007, 2000 L. Destino: tanque 9, lote 0007, 10000 L, mismo sabor (null).
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 8, null, '0007', 2000, 6000, v_uid) returning id into v_lote_o;
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id)
  values (v_turno_id, 9, null, '0007', 10000, 10000, v_uid) returning id into v_lote_d;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 8, 'STANDBY', null, 2000, '0007', v_lote_o, now())
  on conflict (turno_id, numero_tanque) do update set condicion='STANDBY', volumen_l=2000, lote='0007', lote_id=v_lote_o, sabor_id=null;
  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 9, 'LISTO', null, 10000, '0007', v_lote_d, now())
  on conflict (turno_id, numero_tanque) do update set condicion='LISTO', volumen_l=10000, lote='0007', lote_id=v_lote_d, sabor_id=null;

  select volumen_inicial_l into v_vi_o_antes from preparaciones where id = v_lote_o;  -- 6000
  select count(*) into v_ajustes_antes from preparaciones_ajuste where turno_id = v_turno_id;

  -- Transferencia LIQUIDO: mueve los 2000 del origen al destino.
  perform transferir_tanque(v_usuario, v_turno_id, 8::smallint, 9::smallint, 'LIQUIDO', 'CONSOLIDAR_RESTOS');

  select volumen_inicial_l, volumen_l into v_vi_d_post_transf, v_vol_d_post_transf from preparaciones where id = v_lote_d;
  -- destino post-transferencia: vi 12000, vol 12000. origen: cerrado, vi 4000.
  assert (select cerrado_en from preparaciones where id = v_lote_o) is not null, 'pre: origen deberia estar cerrado';

  -- 1..4. Capturar 300 L de resto.
  perform capturar_resto_origen_transferencia(v_usuario, v_turno_id, 8::smallint, v_resto);

  assert (select cerrado_en from preparaciones where id = v_lote_o) is null, '1a. lote origen reabierto';
  assert (select volumen_l from preparaciones where id = v_lote_o) = v_resto, '1b. volumen_l origen = resto';
  assert (select condicion from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 8) = 'STANDBY', '1c. tanque origen STANDBY';
  assert (select volumen_l from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 8) = v_resto, '1d. tanque origen volumen_l = resto';
  assert (select lote_id from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 8) = v_lote_o, '1e. tanque origen apunta al lote';

  assert (select volumen_inicial_l from preparaciones where id = v_lote_o) = v_vi_o_antes - 2000 + v_resto, '2. origen vi devuelto (4000 + 300)';

  assert (select volumen_l from preparaciones where id = v_lote_d) = v_vol_d_post_transf - v_resto, '3a. destino volumen_l -= resto';
  assert (select volumen_inicial_l from preparaciones where id = v_lote_d) = v_vi_d_post_transf - v_resto, '3b. destino vi -= resto';
  assert (select volumen_l from recepcion_tanques where turno_id = v_turno_id and numero_tanque = 9)
       = (select volumen_l from preparaciones where id = v_lote_d), '3c. tanque destino sincronizado';

  assert (select count(*) from preparaciones_ajuste where turno_id = v_turno_id) = v_ajustes_antes + 2, '4. 2 ajustes nuevos';

  -- 5. Idempotente.
  perform capturar_resto_origen_transferencia(v_usuario, v_turno_id, 8::smallint, v_resto);
  assert (select count(*) from preparaciones_ajuste where turno_id = v_turno_id) = v_ajustes_antes + 2, '5. segunda llamada no agrega ajustes';
  assert (select volumen_l from preparaciones where id = v_lote_o) = v_resto, '5b. segunda llamada no cambia el origen';

  raise notice 'TODAS OK (1..5). Casos 6/7 requieren otra transferencia — ver comentario.';
end $$;

rollback;

-- 6. resto >= transferido: capturar_resto_origen_transferencia(..., <litros>) con
--    litros >= transferencias.litros -> 'El resto no puede ser mayor o igual...'.
-- 7. modo LOTE: hacer transferir_tanque(..., 'LOTE', ...) y luego
--    capturar_resto_origen_transferencia -> 'movió el lote entero... no aplica'.
