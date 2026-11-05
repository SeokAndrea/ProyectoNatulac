-- Ensayo de 20261114790000_estado_lineas.sql (estado de línea desde la base y un turno abierto por área).
-- Todo en el Área de Pruebas, dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-estado-lineas.sql
-- Mismos casos que src/components/panel/calculosPanel.test.ts (la regla de respaldo en TypeScript).
begin;

-- Una línea de la respuesta, por código.
create function pg_temp.linea(p_estado jsonb, p_codigo text) returns jsonb
language sql as $$
  select e from jsonb_array_elements(p_estado -> 'lineas') e where e ->> 'linea_codigo' = p_codigo;
$$;
-- ¿La llamada falla?
create function pg_temp.falla(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;
-- Abre otro turno en Pruebas con uno ya abierto y revisa el candado en el momento.
create function pg_temp.segundo_abierto() returns void
language plpgsql as $$
begin
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  select 'EL-C', area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio from turnos where codigo = 'EL-B';
  set constraints turnos_un_abierto_por_area immediate;
end;
$$;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_sabor uuid := (select id from sabores order by nombre limit 1);
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sis uuid := usuario_sistema_id();
  v_lnpe uuid := (select id from paradas_tipos where prefijo_planilla = 'LNPE' limit 1);
  v_l1 uuid; v_l2 uuid; v_l3 uuid;
  v_c1 text; v_c2 text; v_c3 text;
  v_t uuid;
  v_e jsonb;
begin
  select id, codigo into v_l1, v_c1 from lineas where area_id = v_area and activo order by codigo limit 1;
  select id, codigo into v_l2, v_c2 from lineas where area_id = v_area and activo order by codigo offset 1 limit 1;
  select id, codigo into v_l3, v_c3 from lineas where area_id = v_area and activo order by codigo offset 2 limit 1;
  if v_l3 is null then raise exception 'Faltan tres líneas activas en Pruebas.'; end if;

  -- Pruebas sin turnos abiertos ni paradas abiertas (todo se deshace al final).
  update turnos set estado = 'CERRADO' where area_id = v_area and estado = 'ABIERTO';
  update paradas set fin = inicio where linea_id in (v_l1, v_l2, v_l3) and fin is null;

  -- ---------------------------------------------------------------------
  -- 1. Sin turno abierto: libres; solo cuenta una parada abierta
  -- ---------------------------------------------------------------------
  v_e := estado_lineas('PRUEBAS');
  if v_e ->> 'turno_id' is not null then raise exception 'Sin turno abierto no debe usar uno cerrado'; end if;
  if pg_temp.linea(v_e, v_c1) ->> 'estado' <> 'libre' then raise exception '1: sin turno, libre'; end if;

  insert into paradas (linea_id, clase, tipo_nombre, inicio, responsable)
  values (v_l2, 'NO_PROGRAMADA', 'Ensayo falla', now() - interval '30 minutes', 'OPERACIONAL');
  v_e := estado_lineas('PRUEBAS');
  if pg_temp.linea(v_e, v_c2) ->> 'estado' <> 'detenida_por_parada' then raise exception '1: parada abierta de 30 min sin corrida: detenida_por_parada (salió %)', pg_temp.linea(v_e, v_c2) ->> 'estado'; end if;
  update paradas set fin = now() where linea_id = v_l2 and fin is null;

  -- ---------------------------------------------------------------------
  -- 2. Con turno: corriendo, Parar al instante, margen de 15 min
  -- ---------------------------------------------------------------------
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values ('EL-A', v_area, v_sis, v_tt1, v_grupo, current_date, time '07:00')
  returning id into v_t;
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en)
  values (v_t, v_l1, v_sabor, 'EL-1', true, now() - interval '2 hours');
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en, pausada_en)
  values (v_t, v_l2, v_sabor, 'EL-2', true, now() - interval '2 hours', now() - interval '5 minutes');
  insert into lineas_estado (turno_id, linea_id, condicion) values (v_t, v_l3, 'LISTA')
  on conflict (turno_id, linea_id) do update set condicion = 'LISTA';
  insert into paradas (linea_id, clase, tipo_nombre, inicio, responsable)
  values (v_l3, 'NO_PROGRAMADA', 'Ensayo corta', now() - interval '5 minutes', 'OPERACIONAL');

  v_e := estado_lineas('PRUEBAS');
  if (v_e ->> 'turno_id')::uuid <> v_t then raise exception '2: debe usar el turno abierto'; end if;
  if pg_temp.linea(v_e, v_c1) ->> 'estado' <> 'activa' then raise exception '2: corrida en marcha: activa'; end if;
  if pg_temp.linea(v_e, v_c2) ->> 'estado' <> 'parada' then raise exception '2: pausada hace 5 min: parada al instante'; end if;
  if (pg_temp.linea(v_e, v_c2) -> 'parada' ->> 'visible')::boolean then raise exception '2: la pausa de 5 min todavía no es visible'; end if;
  if pg_temp.linea(v_e, v_c3) ->> 'estado' <> 'libre' then raise exception '2: parada de 5 min sin corrida: libre (margen)'; end if;

  -- Mantenimiento: sin corrida, al instante. Con la corrida arrancada después, solo avisa.
  insert into paradas (linea_id, clase, origen, tipo_nombre, inicio, responsable)
  values (v_l3, 'NO_PROGRAMADA', 'MANTENIMIENTO', 'Ensayo Mantenimiento', now() - interval '2 minutes', 'MANTENIMIENTO');
  insert into paradas (linea_id, clase, origen, tipo_nombre, inicio, responsable)
  values (v_l1, 'NO_PROGRAMADA', 'MANTENIMIENTO', 'Ensayo Mantenimiento', now() - interval '3 hours', 'MANTENIMIENTO');
  v_e := estado_lineas('PRUEBAS');
  if pg_temp.linea(v_e, v_c3) ->> 'estado' <> 'detenida_por_parada' then raise exception '2: Mantenimiento sin corrida: detenida al instante'; end if;
  if pg_temp.linea(v_e, v_c1) ->> 'estado' <> 'activa' then raise exception '2: Mantenimiento de antes de arrancar: la corrida sigue activa'; end if;
  if not (pg_temp.linea(v_e, v_c1) -> 'parada' ->> 'de_mantenimiento')::boolean then raise exception '2: con corrida, la de Mantenimiento va como aviso'; end if;
  update paradas set fin = now() where linea_id in (v_l1, v_l2, v_l3) and fin is null;

  -- ---------------------------------------------------------------------
  -- 3. CIP, Esperando PT (ya no es estado), LNPE, +1 pendiente
  -- ---------------------------------------------------------------------
  insert into lineas_estado (turno_id, linea_id, condicion, observacion) values (v_t, v_l2, 'CIP', 'Ensayo CIP')
  on conflict (turno_id, linea_id) do update set condicion = 'CIP', observacion = 'Ensayo CIP';
  update turno_lineas set activa = false where turno_id = v_t and linea_id = v_l1;
  insert into lineas_estado (turno_id, linea_id, condicion) values (v_t, v_l1, 'DETENIDA')
  on conflict (turno_id, linea_id) do update set condicion = 'DETENIDA';
  insert into paradas (linea_id, clase, tipo_nombre, inicio, fin, pendiente, responsable)
  values (v_l1, 'NO_PROGRAMADA', 'Ensayo +1', now() - interval '1 hour', now() - interval '1 hour', true, 'OPERACIONAL');

  v_e := estado_lineas('PRUEBAS');
  if pg_temp.linea(v_e, v_c2) ->> 'estado' <> 'cip' then raise exception '3: pausada con la línea en CIP: cip'; end if;
  if pg_temp.linea(v_e, v_c2) ->> 'observacion' <> 'Ensayo CIP' then raise exception '3: el motivo del CIP'; end if;
  if pg_temp.linea(v_e, v_c1) ->> 'estado' <> 'libre' then raise exception '3: sin corrida en marcha y DETENIDA: libre (salió %)', pg_temp.linea(v_e, v_c1) ->> 'estado'; end if;
  if pg_temp.linea(v_e, v_c1) -> 'parada' <> 'null'::jsonb then raise exception '3: un +1 pendiente no es una parada abierta'; end if;

  if v_lnpe is not null then
    insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable)
    values (v_l3, v_lnpe, 'PROGRAMADA', 'Ensayo LNPE', now() - interval '3 hours', now() + interval '2 hours', 'OPERACIONAL');
    v_e := estado_lineas('PRUEBAS');
    if pg_temp.linea(v_e, v_c3) ->> 'estado' <> 'sin_programacion' then raise exception '3: LNPE hasta el fin del turno: sin_programacion'; end if;
  else
    raise notice '3: no hay un tipo LNPE en el catálogo; ese caso no se ensayó.';
  end if;

  -- ---------------------------------------------------------------------
  -- 4. Un solo turno ABIERTO por área
  -- ---------------------------------------------------------------------
  if exists (select 1 from pg_constraint where conname = 'turnos_un_abierto_por_area') then
    -- El relevo normal (abrir el nuevo y cerrar el anterior en la misma transacción) pasa.
    insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
    values ('EL-B', v_area, v_sis, v_tt1, v_grupo, current_date, time '15:00');
    update turnos set estado = 'CERRADO' where id = v_t;
    set constraints turnos_un_abierto_por_area immediate;
    set constraints turnos_un_abierto_por_area deferred;
    -- Dos abiertos a la vez, no.
    if not pg_temp.falla('select pg_temp.segundo_abierto()') then
      raise exception '4: un segundo turno abierto en el área debe fallar';
    end if;
  else
    raise notice '4: el candado no está puesto (había dos turnos abiertos en un área al migrar). Ciérrelos y vuelva a correr el bloque 2 de la migración.';
  end if;

  raise notice 'Ensayo de estado_lineas: todo bien.';
end;
$$;

rollback;
