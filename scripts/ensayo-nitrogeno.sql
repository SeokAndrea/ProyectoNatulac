-- Ensayo de 20261116290000_nitrogeno_turno.sql (bombonas de nitrógeno del turno).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   cd scripts/base-local && node correr.mjs --migracion ../../supabase/migrations/20261116290000_nitrogeno_turno.sql ../ensayo-nitrogeno.sql
begin;

create function pg_temp.falla(p_sql text, p_texto text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  if position(p_texto in sqlerrm) = 0 then raise exception 'Mensaje inesperado: %', sqlerrm; end if;
  return true;
end;
$$;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'ASEPTICO');
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_tt2 uuid := (select id from turno_tipos where codigo = 'TURNO_2');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sup uuid;
  v_viejo uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_j jsonb;
begin
  update turnos set estado = 'CERRADO' where area_id = v_area and estado = 'ABIERTO';
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select 'n2_sup', 'x', 'Supervisor Nitrógeno', p.id, true from puestos p where p.codigo = 'SUPERVISOR'
  returning id into v_sup;
  if (select area_codigo from rol_y_area_de('n2_sup')) is distinct from 'ASEPTICO' then raise exception '0: n2_sup tiene que quedar en Aséptico'; end if;

  -- ---------------------------------------------------------------------
  -- 0. Turno que ya existía al aplicar la migración: no se le pide nada.
  -- ---------------------------------------------------------------------
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, nitrogeno_aplica)
  values ('N2-VIEJO', v_area, v_sup, v_tt1, v_grupo, current_date - 1, time '07:00', false)
  returning id into v_viejo;
  if (turno_json(v_viejo) ->> 'nitrogeno_aplica')::boolean then raise exception '0: el viejo no aplica'; end if;
  if turno_json(v_viejo) -> 'nitrogeno' <> 'null'::jsonb then raise exception '0: sin datos, nitrogeno = null'; end if;
  perform finalizar_turno('n2_sup', v_viejo);
  if (select estado from turnos where id = v_viejo) <> 'CERRADO' then raise exception '0: el viejo cierra sin nitrógeno'; end if;

  -- ---------------------------------------------------------------------
  -- 1. Turno nuevo: aplica y no cierra sin el nitrógeno.
  -- ---------------------------------------------------------------------
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values ('N2-T1', v_area, v_sup, v_tt1, v_grupo, current_date, time '07:00')
  returning id into v_t1;
  if not (turno_json(v_t1) ->> 'nitrogeno_aplica')::boolean then raise exception '1: el nuevo aplica'; end if;
  if not pg_temp.falla(format($q$ select finalizar_turno('n2_sup', %L) $q$, v_t1), 'Falta el nitrógeno del turno') then raise exception '1: sin nitrógeno no cierra'; end if;

  -- Validaciones de entrada.
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'INICIO', -1) $q$, v_t1), 'un número entero desde 0') then raise exception '1: negativo'; end if;
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'OTRO', 1) $q$, v_t1), 'Momento no válido') then raise exception '1: momento'; end if;

  -- Recibe 3.
  v_j := guardar_nitrogeno_turno('n2_sup', v_t1, 'INICIO', 3);
  if v_j -> 'nitrogeno' <> '{"inicio": 3, "llegaron": 0, "fin": null}'::jsonb then raise exception '1: inicio 3: %', v_j -> 'nitrogeno'; end if;
  if not pg_temp.falla(format($q$ select finalizar_turno('n2_sup', %L) $q$, v_t1), 'Falta el nitrógeno del turno') then raise exception '1: con solo el inicio no cierra'; end if;

  -- ---------------------------------------------------------------------
  -- 2. El caso de Alexander: recibe 3 y entrega 5.
  -- ---------------------------------------------------------------------
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'FIN', 5) $q$, v_t1),
                       'Entregas 5 bombonas llenas, pero recibiste 3 y anotaste 0 que llegaron en el turno. Si llegaron bombonas, anota cuántas en «Llegaron en el turno» (al menos 2)') then
    raise exception '2: 3 -> 5 sin llegadas no se guarda';
  end if;
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'FIN', 5, 1) $q$, v_t1), '(al menos 2)') then raise exception '2: con 1 que llegó tampoco'; end if;
  v_j := guardar_nitrogeno_turno('n2_sup', v_t1, 'FIN', 5, 2);
  if v_j -> 'nitrogeno' <> '{"inicio": 3, "llegaron": 2, "fin": 5}'::jsonb then raise exception '2: 3 + 2 - 5: %', v_j -> 'nitrogeno'; end if;
  -- Corrige: llegaron 6 y entrega 4 (consumo 5).
  v_j := guardar_nitrogeno_turno('n2_sup', v_t1, 'FIN', 4, 6);
  if v_j -> 'nitrogeno' <> '{"inicio": 3, "llegaron": 6, "fin": 4}'::jsonb then raise exception '2: corrección: %', v_j -> 'nitrogeno'; end if;
  -- Corregir el inicio también tiene que cuadrar con lo que ya está.
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'FIN', 4, 0) $q$, v_t1), 'al menos 1') then raise exception '2: quitar las llegadas'; end if;
  perform guardar_nitrogeno_turno('n2_sup', v_t1, 'INICIO', 0);
  if (select inicio from turno_nitrogeno where turno_id = v_t1) <> 0 then raise exception '2: inicio corregido a 0 (0 + 6 >= 4)'; end if;
  -- Al FIN sin p_llegaron se conservan las que ya estaban.
  perform guardar_nitrogeno_turno('n2_sup', v_t1, 'FIN', 5);
  if (select llegaron from turno_nitrogeno where turno_id = v_t1) <> 6 then raise exception '2: llegaron se conserva'; end if;
  perform guardar_nitrogeno_turno('n2_sup', v_t1, 'INICIO', 3);
  -- Desde Finalizar se corrige todo en un paso (p_inicio): 3 + 6 - 5 pasa a 5 + 0 - 5,
  -- que en dos pasos fallaría (FIN con 0 llegadas contra el inicio viejo de 3).
  v_j := guardar_nitrogeno_turno('n2_sup', v_t1, 'FIN', 5, 0, 5);
  if v_j -> 'nitrogeno' <> '{"inicio": 5, "llegaron": 0, "fin": 5}'::jsonb then raise exception '2: en un paso: %', v_j -> 'nitrogeno'; end if;
  if not exists (select 1 from auditoria where entidad = 'turno_nitrogeno' and entidad_id = v_t1::text and resumen like '%recibió 5, llegaron 0 y entregó 5%') then
    raise exception '2: el resumen dice lo recibido, lo que llegó y lo entregado';
  end if;

  -- Auditoría: quién, antes y después.
  if (select count(*) from auditoria where entidad = 'turno_nitrogeno' and entidad_id = v_t1::text) < 5 then raise exception '2: cada cambio auditado'; end if;
  if not exists (select 1 from auditoria where entidad = 'turno_nitrogeno' and entidad_id = v_t1::text and antes ->> 'fin' = '5' and despues ->> 'fin' = '4') then
    raise exception '2: antes y después';
  end if;

  -- ---------------------------------------------------------------------
  -- 3. Cierra y el turno siguiente ve lo que entregó.
  -- ---------------------------------------------------------------------
  perform finalizar_turno('n2_sup', v_t1);
  if (select estado from turnos where id = v_t1) <> 'CERRADO' then raise exception '3: con el nitrógeno cierra'; end if;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values ('N2-T2', v_area, v_sup, v_tt2, v_grupo, current_date, time '15:00')
  returning id into v_t2;
  if (turno_json(v_t2) ->> 'nitrogeno_turno_anterior')::int <> 5 then raise exception '3: el anterior entregó 5: %', turno_json(v_t2) ->> 'nitrogeno_turno_anterior'; end if;
  if turno_json(v_t1) -> 'nitrogeno_turno_anterior' <> 'null'::jsonb then raise exception '3: el anterior del T1 (el viejo) no tiene dato'; end if;

  -- Turno cerrado hace más de 30 min: ya no se puede cambiar (exigir_turno_escribible).
  update turnos set fecha_fin = current_date - 2, hora_fin = time '07:00' where id = v_t1;
  if not pg_temp.falla(format($q$ select guardar_nitrogeno_turno('n2_sup', %L, 'FIN', 4, 6) $q$, v_t1), 'Este turno se cerró') then raise exception '3: turno viejo no se cambia'; end if;

  raise notice 'ENSAYO NITRÓGENO: todo bien';
end;
$$;

rollback;
