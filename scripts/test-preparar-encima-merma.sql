-- Prueba manual de 20261034 (preparar encima / transferir no encogen
-- volumen_inicial_l del lote que cierra) — con Docker/psql local o el
-- SQL editor del proyecto de PRUEBAS. Todo en begin/rollback: no deja nada.
--
--   psql "$DATABASE_URL" -f scripts/test-preparar-encima-merma.sql
--
-- Reproduce el caso de planta (turno de Deivis, 2026-09-10, lote 0003):
-- una línea terminó un lote de 17000 L entregando 16620 L de Producto
-- Terminado (volumen_l bajó a 380), y sobre ESE tanque se preparó el
-- lote siguiente. Antes de 20261034 el lote que cerraba quedaba en
-- volumen_inicial_l = 16620 y volumen_l = 380 -> consumo del tramo
-- 16240 < PT 16620 -> merma negativa -> "Rendimiento 101 %".
--
-- Verifica, después de iniciar_preparacion sobre el mismo tanque:
--   1. Lote viejo: volumen_inicial_l SIGUE en 17000 (no lo encoge).
--   2. Lote viejo: volumen_l sigue 380, cerrado_en quedó seteado.
--   3. Lote nuevo: absorbió el resto -> volumen_l = agua + 380.
--   4. Tramo del lote viejo = 17000 - 380 = 16620 = PT  ->  merma 0.

begin;

do $$
declare
  v_turno_id uuid;
  v_usuario text;
  v_uid uuid;
  v_linea_id uuid;
  v_lote_viejo uuid;
  v_lote_nuevo uuid;
  v_vi_antes numeric;
  v_vi_despues numeric;
  v_vl_despues numeric;
  v_cerrado timestamptz;
  v_nuevo_vl numeric;
  v_pt numeric := 16620;
  v_agua numeric := 5000;
  v_tramo numeric;
begin
  select t.id, u.usuario, u.id into v_turno_id, v_usuario, v_uid
  from turnos t join usuarios u on u.id = t.supervisor_id
  where t.estado = 'ABIERTO' order by t.created_at desc limit 1;
  if v_turno_id is null then raise notice 'SKIP: no hay turno ABIERTO'; return; end if;

  select id into v_linea_id from lineas order by codigo limit 1;

  -- Lote viejo en el tanque 7: se preparó con 17000, ya entregó 16620 de
  -- PT (volumen_l bajó a 380). Tanque LISTO con ese lote.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
  values (v_turno_id, 7, null, 'PENCIMA-VIEJO', 380, 17000, 0, v_uid, now())
  returning id into v_lote_viejo;

  insert into recepcion_tanques (turno_id, numero_tanque, condicion, sabor_id, volumen_l, lote, lote_id, activada_en)
  values (v_turno_id, 7, 'LISTO', null, 380, 'PENCIMA-VIEJO', v_lote_viejo, now())
  on conflict (turno_id, numero_tanque) do update
    set condicion = 'LISTO', sabor_id = null, volumen_l = 380,
        lote = 'PENCIMA-VIEJO', lote_id = v_lote_viejo, activada_en = now();

  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, lote_id, activa, activada_en)
  values (v_turno_id, v_linea_id, null, 'PENCIMA-VIEJO', v_lote_viejo, true, now());

  select volumen_inicial_l into v_vi_antes from preparaciones where id = v_lote_viejo;

  -- Preparar ENCIMA: lote nuevo en el mismo tanque 7 (0 tambores + agua,
  -- sabor null para no depender del catálogo).
  perform iniciar_preparacion(v_usuario, v_turno_id, 7::smallint, null, 'PENCIMA-NUEVO', 0, v_agua, null, null);

  select volumen_inicial_l, volumen_l, cerrado_en
    into v_vi_despues, v_vl_despues, v_cerrado
  from preparaciones where id = v_lote_viejo;

  select id, volumen_l into v_lote_nuevo, v_nuevo_vl
  from preparaciones where turno_id = v_turno_id and lote = 'PENCIMA-NUEVO';

  v_tramo := v_vi_despues - v_vl_despues;

  raise notice '--- LOTE VIEJO (el que cierra) ---';
  raise notice 'volumen_inicial_l  antes=%  después=%   (esperado: 17000, sin cambio)', v_vi_antes, v_vi_despues;
  raise notice 'volumen_l          después=%             (esperado: 380)', v_vl_despues;
  raise notice 'cerrado_en         %                     (esperado: no nulo)', v_cerrado;
  raise notice '--- LOTE NUEVO ---';
  raise notice 'volumen_l          =%                     (esperado: % = agua + resto 380)', v_nuevo_vl, v_agua + 380;
  raise notice '--- MERMA DEL TRAMO ---';
  raise notice 'tramo = inicial - fin = % - % = %         (esperado: 16620 = PT)', v_vi_despues, v_vl_despues, v_tramo;
  raise notice 'merma %% = 1 - PT/tramo = %', round((1 - v_pt / nullif(v_tramo, 0)) * 100, 2);

  if v_vi_despues <> 17000 then
    raise exception 'FALLA: volumen_inicial_l del lote viejo se movió a % (debía quedar en 17000)', v_vi_despues;
  end if;
  if v_vl_despues <> 380 then
    raise exception 'FALLA: volumen_l del lote viejo quedó en % (debía quedar en 380)', v_vl_despues;
  end if;
  if v_cerrado is null then
    raise exception 'FALLA: el lote viejo no se cerró';
  end if;
  if v_nuevo_vl <> v_agua + 380 then
    raise exception 'FALLA: el lote nuevo quedó en % (debía absorber el resto: %)', v_nuevo_vl, v_agua + 380;
  end if;
  if round((1 - v_pt / nullif(v_tramo, 0)) * 100, 2) <> 0 then
    raise exception 'FALLA: la merma del tramo no dio 0 (dio %)', round((1 - v_pt / nullif(v_tramo, 0)) * 100, 2);
  end if;

  raise notice 'OK: preparar encima no encoge volumen_inicial_l; el tramo cuadra con el PT.';
end $$;

rollback;
