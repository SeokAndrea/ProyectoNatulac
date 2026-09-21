-- Prueba manual de 20261040 (confirmar inicio/fin pasa a ser la
-- fuente real de la merma) — Docker/psql local o el SQL editor de
-- PRUEBAS. Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-confirmar-fuente-de-verdad.sql
--
-- Verifica:
--   1. confirmar_estado_tanque(INICIO) sobre un lote HEREDADO estampa
--      turnos.volumenes_lote_inicio.
--   2. activar_linea RECHAZA tomar un tanque heredado sin confirmar el
--      inicio, y funciona una vez confirmado.
--   3. activar_linea NO bloquea un lote preparado en ESTE MISMO turno
--      (nada que confirmar — regresión del guard de arriba).
--   4. finalizar_turno RECHAZA si falta confirmar el fin de un tanque
--      con producción de este turno, y funciona una vez confirmado
--      (confirmar_estado_tanque(FIN) estampa volumenes_lote_cierre).
--   5. registrar_contador RECHAZA sobre una corrida HEREDADA (copiada
--      por el relevo, nunca reactivada) sin confirmar su inicio, y
--      funciona una vez confirmada con confirmar_estado_linea.
--   6. entregar_corrida estampa confirmado_fin_en solo — no hace falta
--      un paso aparte para que finalizar_turno la deje pasar.

begin;

do $$
declare
  v_area_id uuid;
  v_area_cod text;
  v_tipo_cod text;
  v_grupo_cod text;
  v_sup text;
  v_sup_id uuid;
  v_linea_a uuid;
  v_linea_b uuid;
  v_presentacion_id uuid;
  v_presentacion_ml integer;
  v_turno_viejo uuid;
  v_lote_heredado uuid;
  v_turno_id uuid;
  v_json jsonb;
  v_resultado text;
  v_lote_propio uuid;
  v_snap_inicio numeric;
  v_snap_fin numeric;
begin
  select a.id, a.codigo into v_area_id, v_area_cod
  from areas a
  where a.codigo <> 'PRUEBAS'
    and exists (select 1 from lineas l where l.area_id = a.id and l.activo)
  order by a.codigo limit 1;
  select codigo into v_tipo_cod from turno_tipos order by codigo limit 1;
  select codigo into v_grupo_cod from grupos order by codigo desc limit 1;
  select u.usuario, u.id into v_sup, v_sup_id from usuarios u order by u.usuario limit 1;
  select id into v_linea_a from lineas where area_id = v_area_id and activo order by codigo limit 1;
  select id into v_linea_b from lineas where area_id = v_area_id and activo order by codigo offset 1 limit 1;
  select id, volumen_ml into v_presentacion_id, v_presentacion_ml from presentaciones order by volumen_ml limit 1;
  if v_area_id is null or v_linea_a is null or v_linea_b is null or v_presentacion_id is null then
    raise notice 'SKIP: falta área con >=2 líneas activas o presentación';
    return;
  end if;

  -- Turno VIEJO cerrado normal, deja un lote abierto en tanque 1 (se
  -- hereda al turno nuevo).
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado, fecha_fin, hora_fin)
  select 'TEST-CONF-VIEJO-' || substr(md5(random()::text),1,6), v_area_id, v_sup_id, tt.id, g.id,
         (now() at time zone 'America/Caracas')::date, '07:00', 'CERRADO',
         (now() at time zone 'America/Caracas')::date, '15:00'
  from turno_tipos tt, grupos g
  where tt.codigo = v_tipo_cod and g.codigo = v_grupo_cod
  returning id into v_turno_viejo;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id, actualizada_por, liberado_en)
  values (v_turno_viejo, 1, null, 'TEST-HEREDADO', 5000, 12000, v_sup_id, v_sup_id, now())
  returning id into v_lote_heredado;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en, actualizada_por)
  values (v_turno_viejo, 1, 'LISTO', null, 5000, 'TEST-HEREDADO', v_lote_heredado, now(), v_sup_id);

  -- Turno NUEVO: hereda el tanque 1 con su lote (turno_id sigue siendo
  -- v_turno_viejo en la fila preparaciones — es HEREDADO para este turno).
  v_json := iniciar_turno(v_sup, v_area_cod, v_tipo_cod, v_grupo_cod);
  v_turno_id := (v_json ->> 'id')::uuid;

  -- ---- Parte 1: activar_linea rechaza el tanque heredado sin confirmar ----
  begin
    perform activar_linea(v_sup, v_turno_id, (select codigo from lineas where id = v_linea_a),
      v_presentacion_ml, 6000, 6000, 1, false);
    raise exception 'FALLA: activar_linea debía rechazar el tanque heredado sin confirmar inicio.';
  exception
    when others then
      get stacked diagnostics v_resultado = message_text;
      if v_resultado like 'Confirmá el estado del Tanque%' then
        raise notice 'OK (esperado): activar_linea rechazó — %', v_resultado;
      else
        raise exception 'FALLA: activar_linea rechazó por otra razón: %', v_resultado;
      end if;
  end;

  -- Confirmar inicio del tanque 1 -> debe estampar volumenes_lote_inicio.
  perform confirmar_estado_tanque(v_sup, v_turno_id, 1, 'INICIO');
  select (volumenes_lote_inicio ->> v_lote_heredado::text)::numeric into v_snap_inicio
  from turnos where id = v_turno_id;
  raise notice 'volumenes_lote_inicio tras confirmar: % (esperado: 5000)', v_snap_inicio;
  if v_snap_inicio is distinct from 5000 then
    raise exception 'FALLA: confirmar_estado_tanque(INICIO) no estampó volumenes_lote_inicio.';
  end if;

  -- Ahora sí debe dejar activar la línea.
  perform activar_linea(v_sup, v_turno_id, (select codigo from lineas where id = v_linea_a),
    v_presentacion_ml, 6000, 6000, 1, false);
  raise notice 'OK: activar_linea funcionó después de confirmar inicio.';

  -- ---- Parte 2: un lote preparado en ESTE MISMO turno no bloquea ----
  perform iniciar_preparacion(v_sup, v_turno_id, 2, null, 'TEST-PROPIO', 6, null, null, null, null);
  perform liberar_lote(v_sup, v_turno_id, (select id from preparaciones where turno_id = v_turno_id and numero_tanque = 2 and lote = 'TEST-PROPIO'));

  perform activar_linea(v_sup, v_turno_id, (select codigo from lineas where id = v_linea_b),
    v_presentacion_ml, 6000, 6000, 2, false);
  raise notice 'OK: activar_linea NO bloqueó un lote preparado en este mismo turno (nada que confirmar).';

  -- ---- Parte 3: finalizar_turno rechaza sin confirmar el fin ----
  perform registrar_producto_terminado(v_turno_id, (select id from turno_lineas where turno_id = v_turno_id and linea_id = v_linea_a and activa),
    (select codigo from lineas where id = v_linea_a), null, v_presentacion_ml, 1, 0, v_sup);

  begin
    perform finalizar_turno(v_turno_id);
    raise exception 'FALLA: finalizar_turno debía rechazar sin confirmar el fin del Tanque 1.';
  exception
    when others then
      get stacked diagnostics v_resultado = message_text;
      if v_resultado like 'Hay tanques con producción%' then
        raise notice 'OK (esperado): finalizar_turno rechazó — %', v_resultado;
      else
        raise exception 'FALLA: finalizar_turno rechazó por otra razón: %', v_resultado;
      end if;
  end;

  -- Confirmar fin de los dos tanques usados -> debe estampar
  -- volumenes_lote_cierre y dejar finalizar.
  perform confirmar_estado_tanque(v_sup, v_turno_id, 1, 'FIN');
  perform confirmar_estado_tanque(v_sup, v_turno_id, 2, 'FIN');

  select (volumenes_lote_cierre ->> v_lote_heredado::text)::numeric into v_snap_fin
  from turnos where id = v_turno_id;
  raise notice 'volumenes_lote_cierre (tanque 1) tras confirmar FIN: %', v_snap_fin;
  if v_snap_fin is null then
    raise exception 'FALLA: confirmar_estado_tanque(FIN) no estampó volumenes_lote_cierre.';
  end if;

  perform finalizar_turno(v_turno_id);
  raise notice 'OK: finalizar_turno funcionó después de confirmar el fin de los tanques usados.';

  raise notice 'TODO OK (tanques): confirmar inicio/fin ya es la fuente real y es obligatorio.';
end $$;

-- ---- Bloque aparte: mismo mecanismo, ahora para LÍNEAS ----
do $$
declare
  v_area_id uuid;
  v_area_cod text;
  v_tipo_cod text;
  v_grupo_cod text;
  v_sup text;
  v_sup_id uuid;
  v_linea_a uuid;
  v_presentacion_id uuid;
  v_presentacion_ml integer;
  v_turno_viejo uuid;
  v_corrida_heredada uuid;
  v_turno_id uuid;
  v_json jsonb;
  v_resultado text;
  v_confirmado_fin timestamptz;
begin
  select a.id, a.codigo into v_area_id, v_area_cod
  from areas a
  where a.codigo <> 'PRUEBAS'
    and exists (select 1 from lineas l where l.area_id = a.id and l.activo)
  order by a.codigo limit 1;
  select codigo into v_tipo_cod from turno_tipos order by codigo limit 1;
  select codigo into v_grupo_cod from grupos order by codigo desc limit 1;
  select u.usuario, u.id into v_sup, v_sup_id from usuarios u order by u.usuario limit 1;
  select id into v_linea_a from lineas where area_id = v_area_id and activo order by codigo limit 1;
  select id, volumen_ml into v_presentacion_id, v_presentacion_ml from presentaciones order by volumen_ml limit 1;
  if v_area_id is null or v_linea_a is null or v_presentacion_id is null then
    raise notice 'SKIP (líneas): falta área/línea/presentación';
    return;
  end if;

  -- Turno VIEJO con una corrida activa SIN entregar (para que el
  -- relevo la selle) — el objetivo acá es simular una corrida ya
  -- ACTIVA que iniciar_turno copia tal cual al turno nuevo, con
  -- confirmado_inicio_en en null (como hace el copy-forward real).
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado)
  select 'TEST-CONF-LINEA-' || substr(md5(random()::text),1,6), v_area_id, v_sup_id, tt.id, g.id,
         (now() at time zone 'America/Caracas')::date, '07:00', 'ABIERTO'
  from turno_tipos tt, grupos g
  where tt.codigo = v_tipo_cod and g.codigo = v_grupo_cod
  returning id into v_turno_viejo;

  insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, entregada_en, entregada_por)
  values (v_turno_viejo, v_linea_a, v_presentacion_id, 6000, 6000, null, 'TEST-LINEA', null, true, now(), v_sup_id, now(), v_sup_id);

  -- Arranca el turno nuevo: relevo sin finalizar hereda la corrida
  -- entregada (activa=true, entregada_en set) tal cual — copy-forward
  -- de iniciar_turno dejando confirmado_inicio_en en null a propósito.
  v_json := iniciar_turno(v_sup, v_area_cod, v_tipo_cod, v_grupo_cod);
  v_turno_id := (v_json ->> 'id')::uuid;

  select id into v_corrida_heredada from turno_lineas where turno_id = v_turno_id and linea_id = v_linea_a and activa;
  if v_corrida_heredada is null then
    raise notice 'SKIP (líneas): el relevo no heredó la corrida entregada — no se pudo armar el caso.';
    return;
  end if;

  -- ---- registrar_contador rechaza la corrida heredada sin confirmar ----
  begin
    perform registrar_contador(v_turno_id, v_corrida_heredada, (select codigo from lineas where id = v_linea_a), 100, null, v_sup, false, null, 95);
    raise exception 'FALLA: registrar_contador debía rechazar la corrida heredada sin confirmar.';
  exception
    when others then
      get stacked diagnostics v_resultado = message_text;
      if v_resultado like 'Confirmá el estado de esta línea%' then
        raise notice 'OK (esperado): registrar_contador rechazó — %', v_resultado;
      else
        raise exception 'FALLA: registrar_contador rechazó por otra razón: %', v_resultado;
      end if;
  end;

  perform confirmar_estado_linea(v_sup, v_turno_id, v_corrida_heredada, 'INICIO');
  perform registrar_contador(v_turno_id, v_corrida_heredada, (select codigo from lineas where id = v_linea_a), 100, null, v_sup, false, null, 95);
  raise notice 'OK: registrar_contador funcionó después de confirmar el inicio de la línea.';

  -- ---- entregar_corrida estampa confirmado_fin_en solo ----
  perform entregar_corrida(v_sup, v_turno_id, v_corrida_heredada);
  select confirmado_fin_en into v_confirmado_fin from turno_lineas where id = v_corrida_heredada;
  raise notice 'confirmado_fin_en tras entregar_corrida: % (esperado: no nulo)', v_confirmado_fin;
  if v_confirmado_fin is null then
    raise exception 'FALLA: entregar_corrida no estampó confirmado_fin_en.';
  end if;

  raise notice 'TODO OK (líneas): confirmar inicio es obligatorio para producir, y entregar confirma el fin solo.';
end $$;

rollback;
