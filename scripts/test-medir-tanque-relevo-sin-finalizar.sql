-- Prueba manual de 20261039 (medir_tanque corrige el cierre forzado
-- anterior) — Docker/psql local o el SQL editor de PRUEBAS.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-medir-tanque-relevo-sin-finalizar.sql
--
-- Reproduce el caso real (Javier/Deivis, 2026-09-15, ASEPTICO, tanque 3
-- / lote 0002): un turno se cierra FORZADO (relevo sin finalizar,
-- 20261035) con un tanque todavía abierto, congelando
-- volumenes_lote_cierre con el volumen que tenía en ESE instante
-- (2.960 L). El turno siguiente mide el mismo tanque poco después,
-- ANTES de producir nada con ese lote (2.000 L, el valor real).
-- Verifica que:
--   1. medir_tanque corrige retroactivamente volumenes_lote_cierre del
--      turno ANTERIOR (no el propio) cuando todavía no hubo PT en el
--      turno nuevo contra ese lote.
--   2. Deja constancia de quién hizo la corrección (turnos.actualizada_por).
--   3. Una VEZ que el turno nuevo ya produjo algo con ese lote, una
--      medición posterior YA NO toca el turno anterior — el punto de
--      corte (primera producción) ya pasó.

begin;

do $$
declare
  v_area_id uuid;
  v_area_cod text;
  v_tipo_cod text;
  v_grupo_cod text;
  v_sup text;
  v_sup_id uuid;
  v_deivis text;
  v_deivis_id uuid;
  v_linea_a uuid;
  v_presentacion_id uuid;
  v_turno_viejo uuid;
  v_lote uuid;
  v_json jsonb;
  v_turno_nuevo uuid;
  v_tanque_num smallint := 1;
  v_snap_antes numeric;
  v_snap_despues numeric;
  v_actualizada_por uuid;
  v_turno_linea_id uuid;
  v_snap_final numeric;
begin
  select a.id, a.codigo into v_area_id, v_area_cod
  from areas a
  where a.codigo <> 'PRUEBAS'
    and exists (select 1 from lineas l where l.area_id = a.id and l.activo)
  order by a.codigo limit 1;
  select codigo into v_tipo_cod from turno_tipos order by codigo limit 1;
  select codigo into v_grupo_cod from grupos order by codigo desc limit 1;
  select u.usuario, u.id into v_sup, v_sup_id from usuarios u order by u.usuario limit 1;
  select u.usuario, u.id into v_deivis, v_deivis_id from usuarios u where u.id <> v_sup_id order by u.usuario limit 1;
  select id into v_linea_a from lineas where area_id = v_area_id and activo order by codigo limit 1;
  select id into v_presentacion_id from presentaciones order by volumen_ml limit 1;
  if v_area_id is null or v_linea_a is null or v_deivis_id is null or v_presentacion_id is null then
    raise notice 'SKIP: falta área/línea/segundo usuario/presentación para la prueba';
    return;
  end if;

  -- Turno VIEJO (Javier) abierto, sin finalizar, con un lote todavía
  -- abierto en el tanque 1 (equivalente al tanque 3 / lote 0002 real).
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado)
  select 'TEST-RELEVO-' || substr(md5(random()::text),1,6), v_area_id, v_sup_id, tt.id, g.id,
         (now() at time zone 'America/Caracas')::date, '07:00', 'ABIERTO'
  from turno_tipos tt, grupos g
  where tt.codigo = v_tipo_cod and g.codigo = v_grupo_cod
  returning id into v_turno_viejo;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id, actualizada_por, liberado_en)
  values (v_turno_viejo, v_tanque_num, null, 'TEST-0002', 2960, 18260, v_sup_id, v_sup_id, now())
  returning id into v_lote;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en, actualizada_por)
  values (v_turno_viejo, v_tanque_num, 'LISTO', null, 2960, 'TEST-0002', v_lote, now(), v_sup_id);

  -- Una corrida (aunque sea sin PT todavía) para que el lote entre al
  -- snapshot de cierre — igual que en el caso real.
  insert into turno_lineas (turno_id, linea_id, presentacion_id, sabor_id, lote, lote_id, activa, activada_en, activada_por)
  values (v_turno_viejo, v_linea_a, v_presentacion_id, null, 'TEST-0002', v_lote, true, now(), v_sup_id);

  -- Deivis arranca su turno en la misma área -> relevo sin finalizar:
  -- cierra forzado el turno viejo y congela el tanque en 2960.
  v_json := iniciar_turno(v_deivis, v_area_cod, v_tipo_cod, v_grupo_cod);
  v_turno_nuevo := (v_json ->> 'id')::uuid;

  select (volumenes_lote_cierre ->> v_lote::text)::numeric into v_snap_antes
  from turnos where id = v_turno_viejo;

  raise notice 'snapshot congelado al relevo: % (esperado: 2960)', v_snap_antes;
  if v_snap_antes is distinct from 2960 then
    raise exception 'FALLA: el relevo no congeló el tanque en 2960 — revisar setup del caso.';
  end if;

  -- Deivis mide el mismo tanque poco después (todavía sin PT en su
  -- turno) -> debe corregir el cierre del turno VIEJO, no el arranque
  -- del nuevo.
  perform medir_tanque(v_deivis, v_turno_nuevo, v_tanque_num, 2000);

  select (volumenes_lote_cierre ->> v_lote::text)::numeric, actualizada_por
    into v_snap_despues, v_actualizada_por
  from turnos where id = v_turno_viejo;

  raise notice 'snapshot del turno VIEJO tras medir_tanque: % (esperado: 2000), actualizada_por=Deivis: %',
    v_snap_despues, (v_actualizada_por = v_deivis_id);

  if v_snap_despues is distinct from 2000 then
    raise exception 'FALLA: medir_tanque no corrigió retroactivamente el cierre del turno anterior.';
  end if;
  if v_actualizada_por is distinct from v_deivis_id then
    raise exception 'FALLA: el turno VIEJO no quedó con actualizada_por = quien corrigió.';
  end if;

  -- Ahora Deivis SÍ produce algo con ese lote en su propio turno...
  select id into v_turno_linea_id
  from turno_lineas where turno_id = v_turno_nuevo and linea_id = v_linea_a and activa
  limit 1;

  if v_turno_linea_id is null then
    raise notice 'SKIP parte 2: el relevo no heredó una corrida activa sobre la línea de prueba.';
  else
    perform registrar_producto_terminado(
      v_turno_nuevo, v_turno_linea_id, (select codigo from lineas where id = v_linea_a), null,
      (select volumen_ml from presentaciones where id = v_presentacion_id), 1, 0, v_deivis
    );

    -- ...y una medición POSTERIOR ya no debe tocar el turno viejo: el
    -- punto de corte (primera producción) ya pasó.
    perform medir_tanque(v_deivis, v_turno_nuevo, v_tanque_num, 500);

    select (volumenes_lote_cierre ->> v_lote::text)::numeric into v_snap_final
    from turnos where id = v_turno_viejo;

    raise notice 'snapshot del turno VIEJO tras producir + volver a medir: % (esperado: sigue en 2000)', v_snap_final;
    if v_snap_final is distinct from 2000 then
      raise exception 'FALLA: una medición después de producir no debía tocar el turno anterior.';
    end if;
  end if;

  raise notice 'OK: medir_tanque corrige el cierre forzado anterior solo antes de la primera producción.';
end $$;

rollback;
