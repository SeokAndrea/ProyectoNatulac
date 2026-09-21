-- Prueba manual de 20261059 (cierre de lote limpia el tanque del turno
-- abierto) — con Docker/psql local o el SQL editor del proyecto de PRUEBAS.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-cierre-lote-heredado.sql
--
-- Reproduce el caso de Danny (2026-09-18): el lote fue creado en OTRO
-- turno, el turno abierto tiene su propia copia del tanque (LISTO, 19200)
-- y el lote se agota.
--
-- Verifica:
--   1. El lote queda cerrado.
--   2. El tanque del turno ABIERTO queda SUCIO, sin lote y sin volumen.
--   3. volumen_vivo_tanque() ya no devuelve 19200.

begin;

do $$
declare
  v_abierto uuid;
  v_otro uuid;
  v_lote uuid;
  v_cond text;
  v_lote_id uuid;
  v_vol numeric;
  v_cerrado timestamptz;
begin
  select id into v_abierto from turnos where estado = 'ABIERTO' order by created_at desc limit 1;
  if v_abierto is null then raise notice 'SKIP: no hay turno ABIERTO'; return; end if;
  select id into v_otro from turnos where id <> v_abierto order by created_at desc limit 1;
  if v_otro is null then raise notice 'SKIP: hace falta un segundo turno'; return; end if;

  -- Lote creado en el OTRO turno, ya agotado (volumen 0).
  insert into preparaciones (turno_id, numero_tanque, lote, volumen_l, volumen_inicial_l)
  values (v_otro, 8, 'HEREDADO-1', 0, 19200) returning id into v_lote;

  -- Copia del tanque en el turno abierto: LISTO con el volumen congelado.
  insert into recepcion_tanques (turno_id, numero_tanque, condicion, volumen_l, lote, lote_id, activada_en)
  values (v_abierto, 8, 'LISTO', 19200, 'HEREDADO-1', v_lote, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', sabor_id = null, volumen_l = 19200, lote = 'HEREDADO-1', lote_id = v_lote, activada_en = now();

  perform revisar_cierre_de_lote(v_lote);

  select cerrado_en into v_cerrado from preparaciones where id = v_lote;
  select condicion, lote_id, volumen_l into v_cond, v_lote_id, v_vol
  from recepcion_tanques where turno_id = v_abierto and numero_tanque = 8;

  if v_cerrado is null then raise exception 'FALLO 1: el lote no se cerró'; end if;
  if v_cond <> 'SUCIO' or v_lote_id is not null or v_vol is not null then
    raise exception 'FALLO 2: el tanque del turno abierto quedó % / lote % / vol %', v_cond, v_lote_id, v_vol;
  end if;
  if volumen_vivo_tanque(v_abierto, 8::smallint) is not null then
    raise exception 'FALLO 3: volumen_vivo_tanque devuelve %', volumen_vivo_tanque(v_abierto, 8::smallint);
  end if;

  raise notice 'OK: el tanque del turno abierto se limpió aunque el lote lo creó otro turno';
end;
$$;

rollback;
