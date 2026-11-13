-- Ensayo de 20261115290000_trazabilidad_paletizado.sql (trazabilidad de paletizado del Robot Tavil).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-trazabilidad-paletizado.sql
-- (scripts/ensayo-robot-tavil.sql usa el «+» viejo sin ticket: después de esta migración ya no corre.)
begin;

create function pg_temp.linea(p_pantalla jsonb, p_codigo text) returns jsonb
language sql as $$
  select e from jsonb_array_elements(p_pantalla -> 'lineas') e where e ->> 'linea_codigo' = p_codigo;
$$;
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
-- Dentro de una transacción now() no avanza: cada paleta recibe la hora real
-- para que «la última» (el «−», la lista del día) sea la que se creó al final.
create function pg_temp.sello(p_ticket text) returns void
language sql as $$
  update robot_tavil_paletas set creada_en = clock_timestamp() where ticket = p_ticket and anulada_en is null;
$$;
-- «+» con ticket, conforme. Devuelve la pantalla ya con el sello.
create function pg_temp.sumar(p_linea text, p_ticket text) returns jsonb
language plpgsql as $$
begin
  perform robot_tavil_sumar('tz_op', p_linea, p_ticket);
  perform pg_temp.sello(p_ticket);
  return robot_tavil_estado('tz_op');
end;
$$;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_linea uuid;
  v_cod text;
  v_mz uuid;
  v_pr uuid;
  v_pres uuid;
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sis uuid := usuario_sistema_id();
  v_t uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_l jsonb;
  v_p jsonb;
  v_id uuid;
  v_nums text;
begin
  select id, codigo into v_linea, v_cod from lineas where area_id = v_area and activo order by codigo limit 1;
  if v_linea is null then raise exception 'Falta una línea activa en Pruebas.'; end if;
  select s.id into v_mz from sabores s join familias_producto f on f.id = s.familia_id
   where s.nombre ilike 'manzana' and f.nombre ilike 'cl%sicos' limit 1;
  select s.id into v_pr from sabores s join familias_producto f on f.id = s.familia_id
   where s.nombre ilike 'pera' and f.nombre ilike 'cl%sicos' limit 1;
  select id into v_pres from presentaciones where volumen_ml = 1000;
  if v_mz is null or v_pr is null or v_pres is null then raise exception 'Faltan Manzana/Pera Clásicos o la presentación de 1000 ml.'; end if;

  -- ---------------------------------------------------------------------
  -- 0. Códigos de la hoja y permisos
  -- ---------------------------------------------------------------------
  if (select codigo from sabores where id = v_mz) <> 'MZ' then raise exception '0: Manzana Clásicos = MZ'; end if;
  if exists (select 1 from sabores s join familias_producto f on f.id = s.familia_id
              where f.nombre = 'Selecto' and s.nombre ilike 'manzana%' and s.codigo <> 'MZ%') then raise exception '0: Manzana Selecto = MZ%%'; end if;
  if exists (select 1 from sabores s join familias_producto f on f.id = s.familia_id
              where f.nombre = 'Jucosa' and s.nombre ilike 'pera' and s.codigo <> 'PRJ') then raise exception '0: Pera Jucosa = PRJ'; end if;
  if (select codigos_presentacion from presentaciones where id = v_pres) <> 'TBA-1000 cm3' then raise exception '0: 1000 ml = TBA-1000 cm3'; end if;
  if not exists (select 1 from permisos where codigo = 'TRAZABILIDAD_VER') or not exists (select 1 from permisos where codigo = 'TRAZABILIDAD_EDITAR') then
    raise exception '0: faltan los permisos';
  end if;
  if exists (select 1 from puesto_permisos where permiso_codigo in ('TRAZABILIDAD_VER', 'TRAZABILIDAD_EDITAR')) then raise exception '0: no nacen en ningún puesto'; end if;

  update turnos set estado = 'CERRADO' where area_id = v_area and estado = 'ABIERTO';
  delete from robot_tavil_seguimiento where linea_id in (select id from lineas where area_id = v_area);
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select x.u, 'x', x.n, p.id, true
    from (values ('tz_op', 'Operador Ensayo', 'PROBADOR'), ('tz_sup', 'Supervisor Ensayo', 'SUPERVISOR')) x(u, n, pc)
    join puestos p on p.codigo = x.pc;
  -- El supervisor del ensayo es de Pruebas (como las paletas): si no, queda en Aséptico y no ve nada.
  delete from usuario_roles where usuario_id = (select id from usuarios where usuario = 'tz_sup');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, v_area from usuarios u, roles r where u.usuario = 'tz_sup' and r.codigo = 'SUPERVISOR';
  if (select area_codigo from rol_y_area_de('tz_sup')) is distinct from 'PRUEBAS' then raise exception '0: tz_sup tiene que quedar en Pruebas'; end if;
  if not pg_temp.falla($q$ select trazabilidad_paletizado_listar('tz_sup', current_date) $q$, 'No tienes permiso') then raise exception '0: sin permiso no ve'; end if;

  -- Corrida de Manzana 1000 ml.
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('TZ-A', v_area, v_sis, v_tt1, v_grupo, current_date, time '07:00', now() - interval '3 hours')
  returning id into v_t;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  values (v_t, v_linea, v_mz, v_pres, 'TZ-1', true, now() - interval '3 hours')
  returning id into v_c1;

  -- ---------------------------------------------------------------------
  -- 1. «+» con ticket: número, turno, día, cajas
  -- ---------------------------------------------------------------------
  v_l := pg_temp.linea(robot_tavil_estado('tz_op'), v_cod);
  if (v_l ->> 'proximo_numero')::int <> 1 or v_l ->> 'proximo_sabor_codigo' <> 'MZ' then raise exception '1: próximo Nº 1 de MZ: %', v_l; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tz_op', %L, '  ') $q$, v_cod), 'Escribe el número de ticket') then raise exception '1: ticket obligatorio'; end if;
  perform pg_temp.sumar(v_cod, 'TZ-T1');
  perform pg_temp.sumar(v_cod, 'TZ-T2');
  v_l := pg_temp.linea(pg_temp.sumar(v_cod, 'TZ-T3'), v_cod);
  if (v_l ->> 'proximo_numero')::int <> 4 then raise exception '1: próximo Nº 4: %', v_l; end if;
  v_p := v_l -> 'paletas_dia' -> 0;
  if (v_p ->> 'numero')::int <> 3 or v_p ->> 'ticket' <> 'TZ-T3' or v_p ->> 'turno_tipo' <> 'TURNO_1'
     or (v_p ->> 'fecha_produccion')::date <> current_date or v_p ->> 'tipo_paletizado' <> 'AUTOMATICO'
     or (v_p ->> 'cajas')::int <> (select cajas_x_paleta from presentaciones where id = v_pres) then
    raise exception '1: datos de la última paleta: %', v_p;
  end if;

  -- Ticket repetido: se bloquea (sin distinguir mayúsculas ni espacios).
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tz_op', %L, ' tz-t2 ') $q$, v_cod), 'Ese ticket ya está en la paleta Nº 2') then raise exception '1: ticket repetido'; end if;

  -- NC exige observación; el 7 pide texto.
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tz_op', %L, 'TZ-NC', false) $q$, v_cod), 'Marca al menos una observación') then raise exception '1: NC sin observación'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tz_op', %L, 'TZ-NC', false, array[7]) $q$, v_cod), 'Especifica el «Otros»') then raise exception '1: 7 sin texto'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('tz_op', %L, 'TZ-NC', false, array[9]) $q$, v_cod), 'códigos 1 a 7') then raise exception '1: código fuera de la hoja'; end if;
  perform robot_tavil_sumar('tz_op', v_cod, 'TZ-NC', false, array[7, 1, 1], 'golpe', 'Se reenvolvió');
  perform pg_temp.sello('TZ-NC');
  if (select observacion_codigos from robot_tavil_paletas where ticket = 'TZ-NC') <> array[1, 7] then raise exception '1: códigos ordenados y sin repetir'; end if;

  -- «−» anula la última: su número y su ticket quedan libres.
  perform robot_tavil_restar('tz_op', v_cod);
  v_l := pg_temp.linea(pg_temp.sumar(v_cod, 'TZ-NC'), v_cod);
  if (v_l -> 'paletas_dia' -> 0 ->> 'numero')::int <> 4 then raise exception '1: el número anulado se reutiliza: %', v_l; end if;
  if (v_l ->> 'anuladas_dia')::int <> 1 then raise exception '1: 1 anulada en el día'; end if;

  -- ---------------------------------------------------------------------
  -- 2. Combinaciones: MZ → PR → MZ continúa donde iba
  -- ---------------------------------------------------------------------
  update turno_lineas set activa = false, finalizada_en = now() where id = v_c1;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  values (v_t, v_linea, v_pr, v_pres, 'TZ-2', true, now()) returning id into v_c2;
  perform robot_tavil_iniciar('tz_op', v_cod);
  perform pg_temp.sumar(v_cod, 'TZ-P1');
  perform pg_temp.sumar(v_cod, 'TZ-P2');
  update turno_lineas set activa = false, finalizada_en = now() where id = v_c2;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  values (v_t, v_linea, v_mz, v_pres, 'TZ-3', true, now() + interval '1 minute') returning id into v_c3;
  perform robot_tavil_iniciar('tz_op', v_cod);
  perform pg_temp.sumar(v_cod, 'TZ-M5');
  select string_agg(s.codigo || rp.numero, ',' order by rp.creada_en) into v_nums
  from robot_tavil_paletas rp join sabores s on s.id = rp.sabor_id
  where rp.linea_id = v_linea and rp.anulada_en is null and rp.fecha_produccion = current_date;
  if v_nums <> 'MZ1,MZ2,MZ3,MZ4,PR1,PR2,MZ5' then raise exception '2: numeración por combinación: %', v_nums; end if;

  -- ---------------------------------------------------------------------
  -- 3. Paleta manual: interruptor por línea, auditado
  -- ---------------------------------------------------------------------
  v_l := pg_temp.linea(robot_tavil_cambiar_manual('tz_op', v_cod, true), v_cod);
  if not (v_l ->> 'manual')::boolean then raise exception '3: encendido'; end if;
  v_l := pg_temp.linea(pg_temp.sumar(v_cod, 'TZ-MAN'), v_cod);
  if v_l -> 'paletas_dia' -> 0 ->> 'tipo_paletizado' <> 'MANUAL' then raise exception '3: la nueva sale MANUAL: %', v_l; end if;
  if (select tipo_paletizado from robot_tavil_paletas where ticket = 'TZ-M5') <> 'AUTOMATICO' then raise exception '3: las ya creadas no cambian'; end if;
  if not exists (select 1 from auditoria where entidad = 'robot_tavil_linea_manual' and entidad_id = v_linea::text) then raise exception '3: auditado'; end if;
  perform robot_tavil_cambiar_manual('tz_op', v_cod, false);

  -- ---------------------------------------------------------------------
  -- 4. Corregir desde la lista del operador (auditado, ticket no repetido)
  -- ---------------------------------------------------------------------
  select id into v_id from robot_tavil_paletas where ticket = 'TZ-T1';
  if not pg_temp.falla(format($q$ select robot_tavil_editar_paleta('tz_op', %L, 'TZ-T2', 'AUTOMATICO', 80, true, '{}', null, null) $q$, v_id), 'Ese ticket ya está') then
    raise exception '4: corregir a un ticket repetido';
  end if;
  perform robot_tavil_editar_paleta('tz_op', v_id, 'TZ-T1b', 'MANUAL', 80, false, array[2], null, 'Se completó');
  if (select row(ticket, tipo_paletizado, cajas, conforme)::text from robot_tavil_paletas where id = v_id) <> '(TZ-T1b,MANUAL,80,f)' then raise exception '4: corregida'; end if;
  if not exists (select 1 from auditoria where entidad = 'robot_tavil_paletas' and entidad_id = v_id::text and antes ->> 'ticket' = 'TZ-T1') then raise exception '4: auditada con antes'; end if;

  -- ---------------------------------------------------------------------
  -- 5. Tarjeta de Trazabilidad: filtros y corrección (observación opcional)
  -- ---------------------------------------------------------------------
  insert into usuario_permisos (usuario_id, permiso_codigo)
  select id, 'TRAZABILIDAD_EDITAR' from usuarios where usuario = 'tz_sup';
  v_p := trazabilidad_paletizado_listar('tz_sup', current_date);
  if jsonb_array_length(v_p -> 'paletas') < 8 then raise exception '5: todas las del día: %', v_p; end if;
  if jsonb_array_length(trazabilidad_paletizado_listar('tz_sup', current_date, array['TURNO_2'])  -> 'paletas') <> 0 then raise exception '5: filtro de turno'; end if;
  if jsonb_array_length(trazabilidad_paletizado_listar('tz_sup', current_date, null, array['NO_EXISTE']) -> 'paletas') <> 0 then raise exception '5: filtro de línea'; end if;
  v_p := trazabilidad_paletizado_corregir('tz_sup', v_id, false, '{}', null, null);
  if (v_p ->> 'conforme')::boolean then raise exception '5: NC sin observación al corregir'; end if;
  v_p := trazabilidad_paletizado_corregir('tz_sup', v_id, true, array[3], null, 'x');
  if jsonb_array_length(v_p -> 'observacion_codigos') <> 0 or v_p ->> 'accion_correccion' is not null then raise exception '5: conforme limpia la observación: %', v_p; end if;

  -- ---------------------------------------------------------------------
  -- 6. Edición de Datos: el código del sabor (el Probador tiene EDICION_DATOS)
  -- ---------------------------------------------------------------------
  perform guardar_catalogo('tz_op', 'sabores', v_mz,
    jsonb_build_object('nombre', (select nombre from sabores where id = v_mz), 'familia_id', (select familia_id from sabores where id = v_mz),
                       'volumen', (select volumen from sabores where id = v_mz), 'codigo', ' mzx '));
  if (select codigo from sabores where id = v_mz) <> 'MZX' then raise exception '6: código del sabor'; end if;

  raise notice 'ENSAYO TRAZABILIDAD DE PALETIZADO: todo bien';
end $$;

rollback;
