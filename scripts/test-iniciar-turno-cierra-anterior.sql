-- Prueba manual de 20261035 (iniciar_turno cierra el turno anterior si
-- quedó ABIERTO) — Docker/psql local o el SQL editor de PRUEBAS.
-- Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-iniciar-turno-cierra-anterior.sql
--
-- Reproduce el caso: un supervisor no le da Finalizar Turno y otro
-- inicia el suyo. Verifica que iniciar_turno:
--   1. Cierra el turno anterior (estado CERRADO, cierre_automatico = true,
--      fecha_fin/hora_fin puestos) y congela volumenes_lote_cierre.
--   2. Sella la corrida sin entregar (activa = false, finalizada_en).
--   3. NO hereda esa corrida sellada al turno nuevo.
--   4. Una corrida CON entregada_en sí sigue activa y se hereda.

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
  v_turno_viejo uuid;
  v_lote uuid;
  v_json jsonb;
  v_turno_nuevo uuid;
  v_estado text;
  v_auto boolean;
  v_ffin date;
  v_snap jsonb;
  v_corr_sellada_activa boolean;
  v_corr_sellada_fin timestamptz;
  v_corr_entregada_activa boolean;
  v_heredo_sellada int;
  v_heredo_entregada int;
begin
  -- Un área real con líneas y un turno_tipo/grupo válidos.
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
  if v_area_id is null or v_linea_a is null or v_linea_b is null then
    raise notice 'SKIP: falta área con >=2 líneas activas'; return;
  end if;

  -- Turno VIEJO abierto, sin finalizar.
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, estado)
  select 'TEST-VIEJO-' || substr(md5(random()::text),1,6), v_area_id, v_sup_id, tt.id, g.id,
         (now() at time zone 'America/Caracas')::date, '07:00', 'ABIERTO'
  from turno_tipos tt, grupos g
  where tt.codigo = v_tipo_cod and g.codigo = v_grupo_cod
  returning id into v_turno_viejo;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, usuario_id, liberado_en)
  values (v_turno_viejo, 1, null, 'TEST-L', 5000, 12000, v_sup_id, now())
  returning id into v_lote;

  -- Corrida A: corriendo, SIN entregar -> se debe sellar y NO heredar.
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, lote_id, activa, activada_en)
  values (v_turno_viejo, v_linea_a, null, 'TEST-L', v_lote, true, now());
  -- Corrida B: entregada -> sigue activa y se hereda.
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, lote_id, activa, activada_en, entregada_en)
  values (v_turno_viejo, v_linea_b, null, 'TEST-L', v_lote, true, now(), now());

  -- Otro supervisor inicia su turno en la misma área.
  v_json := iniciar_turno(v_sup, v_area_cod, v_tipo_cod, v_grupo_cod);
  v_turno_nuevo := (v_json ->> 'id')::uuid;

  select estado, cierre_automatico, fecha_fin, volumenes_lote_cierre
    into v_estado, v_auto, v_ffin, v_snap
  from turnos where id = v_turno_viejo;

  select activa, finalizada_en into v_corr_sellada_activa, v_corr_sellada_fin
  from turno_lineas where turno_id = v_turno_viejo and linea_id = v_linea_a;
  select activa into v_corr_entregada_activa
  from turno_lineas where turno_id = v_turno_viejo and linea_id = v_linea_b;

  select count(*) into v_heredo_sellada
  from turno_lineas where turno_id = v_turno_nuevo and linea_id = v_linea_a;
  select count(*) into v_heredo_entregada
  from turno_lineas where turno_id = v_turno_nuevo and linea_id = v_linea_b and activa;

  raise notice '--- TURNO VIEJO ---';
  raise notice 'estado=%  cierre_automatico=%  fecha_fin=%  snapshot=%',
    v_estado, v_auto, v_ffin, (v_snap is not null);
  raise notice 'corrida A (sin entregar): activa=%  finalizada_en=%  (esperado: false / no nulo)',
    v_corr_sellada_activa, (v_corr_sellada_fin is not null);
  raise notice 'corrida B (entregada): activa=%  (esperado: true)', v_corr_entregada_activa;
  raise notice '--- TURNO NUEVO ---';
  raise notice 'heredó corrida A (sellada): %  (esperado: 0)', v_heredo_sellada;
  raise notice 'heredó corrida B (entregada) activa: %  (esperado: 1)', v_heredo_entregada;

  if v_estado <> 'CERRADO' then raise exception 'FALLA: el turno viejo quedó en %', v_estado; end if;
  if not coalesce(v_auto, false) then raise exception 'FALLA: cierre_automatico no quedó en true'; end if;
  if v_ffin is null then raise exception 'FALLA: fecha_fin no se puso'; end if;
  if v_snap is null then raise exception 'FALLA: volumenes_lote_cierre no se congeló'; end if;
  if v_corr_sellada_activa is not false then raise exception 'FALLA: la corrida sin entregar no se selló'; end if;
  if v_corr_sellada_fin is null then raise exception 'FALLA: la corrida sellada quedó sin finalizada_en'; end if;
  if v_corr_entregada_activa is not true then raise exception 'FALLA: la corrida entregada no debía tocarse'; end if;
  if v_heredo_sellada <> 0 then raise exception 'FALLA: el turno nuevo heredó la corrida sellada'; end if;
  if v_heredo_entregada <> 1 then raise exception 'FALLA: el turno nuevo no heredó la corrida entregada'; end if;

  raise notice 'OK: iniciar_turno cerró el turno anterior y heredó solo lo entregado.';
end $$;

rollback;
