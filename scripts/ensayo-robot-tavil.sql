-- Ensayo de 20261114690000_robot_tavil_precarga.sql (precarga de paletas del Robot Tavil).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-robot-tavil.sql
begin;

-- La línea de la pantalla del operador, por código.
create function pg_temp.linea(p_pantalla jsonb, p_codigo text) returns jsonb
language sql as $$
  select e from jsonb_array_elements(p_pantalla -> 'lineas') e where e ->> 'linea_codigo' = p_codigo;
$$;
-- ¿La llamada falla con un mensaje que contiene p_texto?
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
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_linea uuid;
  v_cod text;
  v_sabor uuid := (select id from sabores order by nombre limit 1);
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_tt2 uuid := (select id from turno_tipos where codigo = 'TURNO_2');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sis uuid := usuario_sistema_id();
  v_ta uuid; v_tb uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid;
  v_p jsonb;
  v_l jsonb;
  v_n int;
  v_prep uuid; v_pres uuid; v_cxp numeric; v_lxc numeric;
begin
  select id, codigo into v_linea, v_cod from lineas where area_id = v_area and activo order by codigo limit 1;
  if v_linea is null then raise exception 'Falta una línea activa en Pruebas.'; end if;

  -- Pruebas sin turnos abiertos ni seguimiento previo (todo se deshace al final).
  update turnos set estado = 'CERRADO' where area_id = v_area and estado = 'ABIERTO';
  delete from robot_tavil_seguimiento where linea_id in (select id from lineas where area_id = v_area);

  -- Operador: el Probador (Pruebas, todos los permisos). Sin permiso: un Supervisor de Aséptico.
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select x.u, 'x', x.n, p.id, true
    from (values ('rt_op', 'Operador Ensayo', 'PROBADOR'), ('rt_sup', 'Supervisor Ensayo', 'SUPERVISOR')) x(u, n, pc)
    join puestos p on p.codigo = x.pc;

  -- ---------------------------------------------------------------------
  -- 0. Permiso
  -- ---------------------------------------------------------------------
  if not exists (select 1 from permisos where codigo = 'ROBOT_TAVIL_CARGAR' and tema = 'TURNOS') then raise exception 'Falta el permiso ROBOT_TAVIL_CARGAR'; end if;
  if exists (select 1 from puesto_permisos where permiso_codigo = 'ROBOT_TAVIL_CARGAR') then raise exception 'El permiso no nace en ningún puesto'; end if;
  if not tiene_permiso('rt_op', 'ROBOT_TAVIL_CARGAR') then raise exception 'El Probador debe tenerlo'; end if;
  if not pg_temp.falla($q$ select robot_tavil_estado('rt_sup') $q$, 'No tienes permiso') then raise exception 'Sin permiso debe rechazar'; end if;
  if not pg_temp.falla($q$ select robot_tavil_sumar('rt_sup', 'LINEA_1') $q$, 'No tienes permiso') then raise exception 'Sin permiso no suma'; end if;

  -- ---------------------------------------------------------------------
  -- 0b. Switch por área (Pruebas arranca encendido; Aséptico, apagado)
  -- ---------------------------------------------------------------------
  if not robot_tavil_area_activo('PRUEBAS') then raise exception 'Pruebas debe arrancar encendido'; end if;
  if not pg_temp.falla($q$ select guardar_robot_tavil('rt_sup', 'PRUEBAS', false) $q$, 'Solo el dueño') then raise exception 'Solo la dueña cambia el switch'; end if;
  update areas set robot_tavil = false where id = v_area;
  if (robot_tavil_estado('rt_op') ->> 'habilitado')::boolean is distinct from false then raise exception 'Apagado: la pantalla debe decirlo'; end if;
  if not pg_temp.falla($q$ select robot_tavil_sumar('rt_op', 'LINEA_1') $q$, 'no está habilitado') then raise exception 'Apagado: no debe sumar'; end if;
  if exists (select 1 from listar_precarga_robot_tavil('rt_op', gen_random_uuid())) then raise exception 'Apagado: no hay precarga'; end if;
  update areas set robot_tavil = true where id = v_area;

  -- ---------------------------------------------------------------------
  -- 1. Sin corridas no hay líneas; con una corrida, la adopta sola
  -- ---------------------------------------------------------------------
  if jsonb_array_length(robot_tavil_estado('rt_op') -> 'lineas') <> 0 then raise exception 'Sin corridas no debe haber líneas'; end if;

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('RT-A', v_area, v_sis, v_tt1, v_grupo, current_date, time '07:00', now() - interval '3 hours')
  returning id into v_ta;
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en)
  values (v_ta, v_linea, v_sabor, 'RT-1', true, now() - interval '3 hours')
  returning id into v_c1;

  v_l := pg_temp.linea(robot_tavil_estado('rt_op'), v_cod);
  if v_l ->> 'estado' <> 'EN_CURSO' or v_l -> 'corrida' ->> 'id' <> v_c1::text then raise exception '1: debe contar en la corrida 1: %', v_l; end if;
  if (select turno_linea_id from robot_tavil_seguimiento where linea_id = v_linea) <> v_c1 then raise exception '1: falta el seguimiento'; end if;

  -- ---------------------------------------------------------------------
  -- 2. «+», «−» (anula, no borra) y Resto
  -- ---------------------------------------------------------------------
  perform robot_tavil_sumar('rt_op', v_cod);
  perform robot_tavil_sumar('rt_op', v_cod);
  perform robot_tavil_sumar('rt_op', v_cod);
  v_l := pg_temp.linea(robot_tavil_restar('rt_op', v_cod), v_cod);
  if (v_l -> 'corrida' ->> 'paletas')::int <> 2 then raise exception '2: deben quedar 2 paletas: %', v_l; end if;
  if (select count(*) from robot_tavil_paletas where turno_linea_id = v_c1 and anulada_en is not null) <> 1 then raise exception '2: el «−» anula una'; end if;
  v_l := pg_temp.linea(robot_tavil_guardar_resto('rt_op', v_cod, 15), v_cod);
  if (v_l -> 'corrida' ->> 'resto')::int <> 15 then raise exception '2: Resto 15'; end if;
  perform robot_tavil_guardar_resto('rt_op', v_cod, 14);
  if (select cajas from robot_tavil_resto where turno_linea_id = v_c1) <> 14 then raise exception '2: el Resto se reemplaza'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_guardar_resto('rt_op', %L, -1) $q$, v_cod), 'El Resto tiene que ser') then raise exception '2: Resto negativo'; end if;
  if not pg_temp.falla($q$ select robot_tavil_sumar('rt_op', 'NO_EXISTE') $q$, 'no existe en tu área') then raise exception '2: línea ajena'; end if;

  -- La precarga que ve el supervisor.
  select count(*) into v_n from listar_precarga_robot_tavil('rt_sup', v_ta) p
   where p.turno_linea_id = v_c1 and p.paletas = 2 and p.resto = 14 and p.ultima_paleta_por = 'Operador Ensayo' and p.resto_por = 'Operador Ensayo';
  if v_n <> 1 then raise exception '2: precarga del supervisor'; end if;

  -- Esperando su PT (detenida sin cerrar) sigue abierta para el robot.
  update turno_lineas set activa = false where id = v_c1;
  if not robot_tavil_corrida_abierta(v_c1) then raise exception '2: esperando su PT sigue abierta'; end if;
  update turno_lineas set activa = true where id = v_c1;

  -- ---------------------------------------------------------------------
  -- 3. Entregar: las paletas quedan sin corrida y pasan solas al turno siguiente
  -- ---------------------------------------------------------------------
  update turno_lineas set entregada_en = now() where id = v_c1;
  v_l := pg_temp.linea(robot_tavil_estado('rt_op'), v_cod);
  if v_l ->> 'estado' <> 'ENTREGADA' or not (v_l ->> 'puede_sumar')::boolean then raise exception '3: entregada y se puede sumar: %', v_l; end if;
  v_l := pg_temp.linea(robot_tavil_sumar('rt_op', v_cod), v_cod);
  v_l := pg_temp.linea(robot_tavil_sumar('rt_op', v_cod), v_cod);
  v_l := pg_temp.linea(robot_tavil_restar('rt_op', v_cod), v_cod);
  if (v_l ->> 'sin_corrida')::int <> 1 then raise exception '3: 1 paleta sin corrida: %', v_l; end if;
  if (v_l -> 'corrida' ->> 'paletas')::int <> 2 then raise exception '3: la corrida entregada no cambia'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_guardar_resto('rt_op', %L, 3) $q$, v_cod), 'el Resto no se puede cambiar') then raise exception '3: Resto con la línea entregada'; end if;

  update turnos set estado = 'CERRADO' where id = v_ta;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('RT-B', v_area, v_sis, v_tt2, v_grupo, current_date, time '15:00', now() - interval '1 hour')
  returning id into v_tb;
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en)
  values (v_tb, v_linea, v_sabor, 'RT-1', true, now() - interval '3 hours')
  returning id into v_c2;

  v_l := pg_temp.linea(robot_tavil_estado('rt_op'), v_cod);
  if v_l ->> 'estado' <> 'EN_CURSO' or v_l -> 'corrida' ->> 'id' <> v_c2::text then raise exception '3: debe pasar sola a la continuación: %', v_l; end if;
  if (v_l -> 'corrida' ->> 'paletas')::int <> 1 then raise exception '3: la paleta sin corrida pasa a la continuación'; end if;
  if (select anterior_turno_linea_id from robot_tavil_seguimiento where linea_id = v_linea) <> v_c1 then raise exception '3: anterior = corrida 1'; end if;

  -- ---------------------------------------------------------------------
  -- 4. Terminar: se bloquea hasta que haya un lote nuevo
  -- ---------------------------------------------------------------------
  update turno_lineas set activa = false, finalizada_en = now() where id = v_c2;
  v_l := pg_temp.linea(robot_tavil_estado('rt_op'), v_cod);
  if v_l ->> 'estado' <> 'TERMINADA' or (v_l ->> 'puede_sumar')::boolean then raise exception '4: terminada y bloqueada: %', v_l; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('rt_op', %L) $q$, v_cod), 'no tiene una corrida en curso') then raise exception '4: no suma'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_restar('rt_op', %L) $q$, v_cod), 'ya se cerró') then raise exception '4: no resta'; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_iniciar('rt_op', %L) $q$, v_cod), 'no tiene un lote nuevo') then raise exception '4: no hay lote para iniciar'; end if;

  -- ---------------------------------------------------------------------
  -- 5. Lote nuevo: pide «Iniciar» y después cuenta en él
  -- ---------------------------------------------------------------------
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en)
  values (v_tb, v_linea, v_sabor, 'RT-2', true, now())
  returning id into v_c3;
  v_l := pg_temp.linea(robot_tavil_estado('rt_op'), v_cod);
  if v_l ->> 'estado' <> 'LOTE_NUEVO' or v_l -> 'nueva' ->> 'lote' <> 'RT-2' or (v_l ->> 'puede_sumar')::boolean then raise exception '5: lote nuevo sin sumar: %', v_l; end if;
  if not pg_temp.falla(format($q$ select robot_tavil_sumar('rt_op', %L) $q$, v_cod), 'Iniciar con el lote') then raise exception '5: pide Iniciar'; end if;
  v_l := pg_temp.linea(robot_tavil_iniciar('rt_op', v_cod), v_cod);
  if v_l ->> 'estado' <> 'EN_CURSO' or v_l -> 'corrida' ->> 'id' <> v_c3::text then raise exception '5: cuenta en el lote nuevo: %', v_l; end if;
  if v_l -> 'anterior' ->> 'id' <> v_c2::text or (v_l -> 'anterior' ->> 'paletas')::int <> 1 then raise exception '5: aviso del lote anterior: %', v_l; end if;
  v_l := pg_temp.linea(robot_tavil_sumar('rt_op', v_cod), v_cod);
  if v_l -> 'anterior' <> 'null'::jsonb then raise exception '5: con paletas el aviso se va'; end if;

  -- Otro lote con el actual abierto: se puede seguir sumando en el actual hasta iniciarlo.
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, activa, activada_en)
  values (v_tb, v_linea, v_sabor, 'RT-3', true, now() + interval '1 minute')
  returning id into v_c4;
  v_l := pg_temp.linea(robot_tavil_sumar('rt_op', v_cod), v_cod);
  if v_l ->> 'estado' <> 'LOTE_NUEVO' or not (v_l ->> 'puede_sumar')::boolean or (v_l -> 'corrida' ->> 'paletas')::int <> 2 then
    raise exception '5: suma en el lote actual: %', v_l;
  end if;

  -- ---------------------------------------------------------------------
  -- 6. Una corrida cerrada hace más de 12 h ya no se muestra
  -- ---------------------------------------------------------------------
  -- (Borrar las corridas se lleva el seguimiento en cascada: se vuelve a poner en la 2.)
  delete from turno_lineas where id in (v_c3, v_c4);
  insert into robot_tavil_seguimiento (linea_id, turno_linea_id) values (v_linea, v_c2)
  on conflict (linea_id) do update set turno_linea_id = excluded.turno_linea_id;
  update turno_lineas set finalizada_en = now() - interval '11 hours' where id = v_c2;
  if pg_temp.linea(robot_tavil_estado('rt_op'), v_cod) ->> 'estado' <> 'TERMINADA' then raise exception '6: a las 11 h todavía se muestra'; end if;
  update turno_lineas set finalizada_en = now() - interval '13 hours' where id = v_c2;
  if pg_temp.linea(robot_tavil_estado('rt_op'), v_cod) is not null then raise exception '6: a las 13 h ya no se muestra'; end if;

  -- ---------------------------------------------------------------------
  -- 7. Nivel estimado de los tanques en el Panel
  -- ---------------------------------------------------------------------
  update turnos set estado = 'CERRADO' where id = v_tb;
  delete from robot_tavil_seguimiento where linea_id = v_linea;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('RT-C', v_area, v_sis, v_tt1, v_grupo, current_date, time '07:00', now())
  returning id into v_ta;
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, volumen_l, volumen_inicial_l)
  values (v_ta, 1, v_sabor, 'RT-E', 0, v_sis, 10000, 10000)
  returning id into v_prep;
  insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id)
  values (v_ta, 1, v_sabor, 'LISTO', 10000, 'RT-E', v_prep);
  select id, cajas_x_paleta, litros_x_caja into v_pres, v_cxp, v_lxc from presentaciones where cajas_x_paleta > 0 and litros_x_caja > 0 limit 1;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, lote_id, activa, activada_en)
  values (v_ta, v_linea, v_sabor, v_pres, 'RT-E', v_prep, true, now())
  returning id into v_c1;
  perform robot_tavil_estado('rt_op');
  perform robot_tavil_sumar('rt_op', v_cod);
  perform robot_tavil_sumar('rt_op', v_cod);
  perform robot_tavil_guardar_resto('rt_op', v_cod, 5);
  select count(*) into v_n from estimacion_tanques_robot_tavil('rt_sup', v_ta) e
   where e.numero_tanque = 1 and e.volumen_oficial_l = 10000 and e.litros_pendientes = (2 * v_cxp + 5) * v_lxc;
  if v_n <> 1 then raise exception '7: estimación del tanque 1: %', (select jsonb_agg(e) from estimacion_tanques_robot_tavil('rt_sup', v_ta) e); end if;
  update areas set robot_tavil = false where id = v_area;
  if exists (select 1 from estimacion_tanques_robot_tavil('rt_sup', v_ta)) then raise exception '7: apagado no estima'; end if;
  update areas set robot_tavil = true where id = v_area;

  raise notice 'ENSAYO ROBOT TAVIL: todo bien';
end $$;

rollback;
