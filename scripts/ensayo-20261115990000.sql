-- Ensayo de 20261115990000_preparacion_plc.sql (preparación con datos del PLC).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-20261115990000.sql
-- Sin Docker, con la base local (scripts/base-local, ver construir.mjs):
--   node correr.mjs --migracion ../../supabase/migrations/20261115990000_preparacion_plc.sql ../ensayo-20261115990000.sql
begin;

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

-- Personas del ensayo: la dueña, un supervisor de Aséptico y el Probador
-- (Pruebas, todos los permisos).
insert into usuarios (usuario, password_hash, nombre, puesto_id, activo, ve_errores)
select x.u, 'x', x.n, p.id, true, x.d
  from (values ('plc_duena', 'Dueña Ensayo', 'SUPERADMINISTRADOR', true),
               ('plc_sup', 'Supervisor Ensayo', 'SUPERVISOR', false),
               ('plc_prob', 'Probador Ensayo', 'PROBADOR', false)) x(u, n, pc, d)
  join puestos p on p.codigo = x.pc;

-- ---------------------------------------------------------------------
-- 1. Interruptor, permiso y usuario del bridge
-- ---------------------------------------------------------------------
do $$
declare
  v_pruebas uuid := (select id from areas where codigo = 'PRUEBAS');
  v_aseptico uuid := (select id from areas where codigo = 'ASEPTICO');
  v_fila record;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
begin
  if not preparacion_plc_area_activo('PRUEBAS') then raise exception '1: Pruebas nace encendido'; end if;
  if preparacion_plc_area_activo('ASEPTICO') then raise exception '1: Aséptico nace apagado'; end if;
  if preparacion_plc_area_activo(null) then raise exception '1: sin área es Aséptico (apagado)'; end if;
  if not pg_temp.falla($q$ select guardar_preparacion_plc('plc_sup', 'PRUEBAS', false) $q$, 'Solo el dueño') then
    raise exception '1: solo la dueña cambia el interruptor';
  end if;

  -- Permiso solo para el bridge: tema Administración, así «todos los permisos» no lo da.
  if not exists (select 1 from permisos where codigo = 'PLC_CARGAR' and tema = 'ADMINISTRACION') then raise exception '1: falta PLC_CARGAR (tema ADMINISTRACION)'; end if;
  if not tiene_permiso('plc-bridge', 'PLC_CARGAR') then raise exception '1: el bridge tiene PLC_CARGAR'; end if;
  if tiene_permiso('plc_prob', 'PLC_CARGAR') then raise exception '1: el Probador no recibe PLC_CARGAR por tener todos los permisos'; end if;
  if tiene_permiso('plc_sup', 'PLC_CARGAR') then raise exception '1: el supervisor no tiene PLC_CARGAR'; end if;
  if (select count(*) from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'INTEGRACION_PLC') <> 1 then
    raise exception '1: el puesto del bridge tiene un solo permiso';
  end if;

  -- El usuario del bridge entra como cualquiera, con su clave.
  if not exists (
    select 1 from usuarios u
      join usuario_roles ur on ur.usuario_id = u.id
      join roles r on r.id = ur.rol_id
      join areas a on a.id = ur.area_id
     where u.usuario = 'plc-bridge' and u.activo and not u.debe_completar_perfil and u.nombre = 'Bridge del PLC'
       and r.codigo = 'VISTA' and a.codigo = 'ASEPTICO'
  ) then raise exception '1: plc-bridge activo, con rol VISTA en Aséptico'; end if;
  update usuarios set password_hash = extensions.crypt('clave-ensayo', extensions.gen_salt('bf')) where usuario = 'plc-bridge';
  select * into v_fila from verificar_login('plc-bridge', 'clave-ensayo');
  if v_fila.token is null then raise exception '1: el bridge entra con su clave'; end if;

  -- Apagar descarta lo que no se registró (solo del área); el «desde» queda; al encender, now().
  update areas set preparacion_plc_desde = timestamptz '2020-01-01' where id = v_pruebas;
  insert into plc_cargas_tanque (area_id, numero_tanque, iniciada_en, ultima_lectura_en)
  values (v_pruebas, 1, now(), now()) returning id into v_c1;
  insert into plc_cargas_tanque (area_id, numero_tanque, estado, iniciada_en, terminada_en, ultima_lectura_en)
  values (v_pruebas, 2, 'PENDIENTE', now(), now(), now()) returning id into v_c2;
  insert into plc_cargas_tanque (area_id, numero_tanque, estado, iniciada_en, terminada_en, ultima_lectura_en)
  values (v_aseptico, 2, 'PENDIENTE', now(), now(), now()) returning id into v_c3;

  perform guardar_preparacion_plc('plc_duena', 'PRUEBAS', false);
  if preparacion_plc_area_activo('PRUEBAS') then raise exception '1: quedó apagado'; end if;
  if (select count(*) from plc_cargas_tanque
       where id in (v_c1, v_c2) and estado = 'DESCARTADA' and motivo_descarte = 'Se apagó la preparación con PLC.'
         and descartada_por = (select id from usuarios where usuario = 'plc_duena') and descartada_en is not null) <> 2 then
    raise exception '1: apagar descarta las dos cargas de Pruebas';
  end if;
  if (select terminada_en from plc_cargas_tanque where id = v_c1) is null then
    raise exception '1: apagar da por terminada la carga que seguía abierta (al encender, la próxima lectura abre otra)';
  end if;
  if (select estado from plc_cargas_tanque where id = v_c3) <> 'PENDIENTE' then raise exception '1: apagar Pruebas no toca Aséptico'; end if;
  if (select preparacion_plc_desde from areas where id = v_pruebas) <> timestamptz '2020-01-01' then raise exception '1: apagar no cambia el desde'; end if;
  if not exists (select 1 from auditoria where entidad = 'preparacion_plc' and entidad_id = v_pruebas::text and resumen = 'Apagó la preparación con PLC en PRUEBAS') then
    raise exception '1: apagar queda en la auditoría';
  end if;

  perform guardar_preparacion_plc('plc_duena', 'PRUEBAS', true);
  if (select preparacion_plc_desde from areas where id = v_pruebas) <> now() then raise exception '1: encender pone el desde'; end if;
  if not exists (select 1 from auditoria where entidad = 'preparacion_plc' and resumen = 'Prendió la preparación con PLC en PRUEBAS') then
    raise exception '1: encender queda en la auditoría';
  end if;
  if not pg_temp.falla($q$ select guardar_preparacion_plc('plc_duena', 'NO_EXISTE', true) $q$, 'Esa área no existe') then
    raise exception '1: área inexistente';
  end if;

  -- Limpieza para las secciones siguientes.
  delete from plc_cargas_tanque where id in (v_c1, v_c2, v_c3);
  raise notice '1. Interruptor, permiso y usuario del bridge: OK';
end $$;

-- ---------------------------------------------------------------------
-- 2. registrar_carga_plc: lo que reporta el bridge
-- ---------------------------------------------------------------------
-- Una lectura del bridge, como la manda plc-bridge/src/cargas.js.
create function pg_temp.lec(p_tanque int, p_prep boolean, p_f1 boolean, p_f2 boolean, p_f3 boolean,
                            p_kits numeric, p_ajuste numeric, p_setpoint numeric, p_momento timestamptz)
returns jsonb
language sql as $$
  select jsonb_build_object('momento', p_momento, 'tanque', p_tanque, 'preparacion', p_prep,
    'fase_1', p_f1, 'fase_2', p_f2, 'fase_3', p_f3, 'kits', p_kits, 'ajuste_l', p_ajuste, 'setpoint_l', p_setpoint);
$$;
-- La carga abierta en el PLC del área (null si no hay).
create function pg_temp.abierta(p_area text) returns plc_cargas_tanque
language sql as $$
  select c.* from plc_cargas_tanque c join areas a on a.id = c.area_id where a.codigo = p_area and c.terminada_en is null;
$$;

do $$
declare
  v_pruebas uuid := (select id from areas where codigo = 'PRUEBAS');
  t0 timestamptz := now() - interval '3 hours';
  v_r jsonb;
  v_c uuid; v_c1 uuid; v_c3 uuid;
  v_carga plc_cargas_tanque;
  v_aj plc_cargas_ajustes;
begin
  delete from plc_cargas_tanque where area_id = v_pruebas;

  -- 2.1 Apagado: no guarda nada.
  update areas set preparacion_plc = false where id = v_pruebas;
  v_r := registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, true, false, false, null, 0, 4800, t0));
  if (v_r ->> 'habilitado')::boolean is distinct from false then raise exception '2.1: apagado responde habilitado false: %', v_r; end if;
  if exists (select 1 from plc_cargas_tanque where area_id = v_pruebas) then raise exception '2.1: apagado no guarda'; end if;
  update areas set preparacion_plc = true where id = v_pruebas;

  -- 2.2 Permiso, área y lectura sin PREPARACION.
  if not pg_temp.falla(format($q$ select registrar_carga_plc('plc_sup', 'PRUEBAS', %L) $q$,
                              pg_temp.lec(2, true, true, false, false, null, 0, 4800, t0)), 'No tienes permiso para registrar cargas del PLC') then
    raise exception '2.2: sin permiso';
  end if;
  if not pg_temp.falla(format($q$ select registrar_carga_plc('plc-bridge', 'NO_EXISTE', %L) $q$,
                              pg_temp.lec(2, true, true, false, false, null, 0, 4800, t0)), 'Esa área no existe') then
    raise exception '2.2: área inexistente';
  end if;
  if not pg_temp.falla($q$ select registrar_carga_plc('plc-bridge', 'PRUEBAS', '{"tanque": 2}') $q$, 'no trae PREPARACION') then
    raise exception '2.2: lectura sin PREPARACION';
  end if;

  -- 2.3 PREPARACION sube: abre la carga; repetir la lectura no duplica.
  v_r := registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, true, false, false, null, 0, 4800, t0));
  v_c := (v_r ->> 'carga_id')::uuid;
  if not (v_r ->> 'habilitado')::boolean or v_r ->> 'estado' <> 'EN_CURSO' or v_c is null then raise exception '2.3: %', v_r; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, true, false, false, null, 0, 4800, t0));
  if (select count(*) from plc_cargas_tanque where area_id = v_pruebas) <> 1 then raise exception '2.3: repetir la lectura no duplica'; end if;
  select * into v_carga from plc_cargas_tanque where id = v_c;
  if v_carga.numero_tanque <> 2 or v_carga.estado <> 'EN_CURSO' or v_carga.agua_formula_l <> 4800 or v_carga.iniciada_en <> t0
     or v_carga.terminada_en is not null then
    raise exception '2.3: datos de la carga: %', row_to_json(v_carga);
  end if;

  -- 2.4 Kits: se anotan en la fase 2 y quedan listos cuando baja.
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, true, false, 2, 0, 4800, t0 + interval '10 min'));
  select * into v_carga from plc_cargas_tanque where id = v_c;
  if v_carga.kits <> 2 or v_carga.kits_listos_en is not null or not v_carga.fase_2_vista then raise exception '2.4: kits 2 sin listos: %', row_to_json(v_carga); end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, true, false, 2.5, 0, 4800, t0 + interval '11 min'));
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, true, false, 0, 0, 4800, t0 + interval '12 min'));
  if (select kits from plc_cargas_tanque where id = v_c) <> 2.5 then raise exception '2.4: kits 2,5 y un 0 no los pisa'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, false, 2.5, 0, 4800, t0 + interval '15 min'));
  if (select kits_listos_en from plc_cargas_tanque where id = v_c) is distinct from t0 + interval '15 min' then raise exception '2.4: listos al bajar la fase 2'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, false, 3, 0, 4800, t0 + interval '16 min'));
  if (select kits from plc_cargas_tanque where id = v_c) <> 2.5 then raise exception '2.4: listos ya no cambian'; end if;

  -- 2.5 Ajustes: uno por cada vez que el valor vuelve a cero, con el último valor.
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, 100, 4800, t0 + interval '20 min'));
  select * into v_aj from plc_cargas_ajustes where carga_id = v_c and hecho_en is null;
  if v_aj.litros is distinct from 100::numeric or v_aj.iniciado_en <> t0 + interval '20 min' then raise exception '2.5: ajuste abierto de 100'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, 120, 4800, t0 + interval '21 min'));
  if (select count(*) from plc_cargas_ajustes where carga_id = v_c) <> 1 or (select litros from plc_cargas_ajustes where id = v_aj.id) <> 120 then
    raise exception '2.5: el mismo ajuste pasa a 120';
  end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, null, 4800, t0 + interval '22 min'));
  if (select hecho_en from plc_cargas_ajustes where id = v_aj.id) is not null then raise exception '2.5: un ajuste sin dato no cierra'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, 0, 4800, t0 + interval '23 min'));
  select * into v_aj from plc_cargas_ajustes where id = v_aj.id;
  if v_aj.hecho_en is distinct from t0 + interval '23 min' or v_aj.ajuste_volumen_id is not null or v_aj.no_sumado_motivo is not null then
    raise exception '2.5: cerrado sin lote, espera: %', row_to_json(v_aj);
  end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, 50, 4800, t0 + interval '30 min'));
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2.5, 0, 4800, t0 + interval '31 min'));
  if (select count(*) from plc_cargas_ajustes where carga_id = v_c and hecho_en is not null) <> 2 then raise exception '2.5: dos ajustes cerrados'; end if;

  -- 2.6 PREPARACION baja: PENDIENTE con la hora del operador (el PLC pone los kits en 0; no los pisa).
  v_r := registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 4800, t0 + interval '40 min'));
  select * into v_carga from plc_cargas_tanque where id = v_c;
  if v_carga.estado <> 'PENDIENTE' or v_carga.terminada_en <> t0 + interval '40 min' or v_carga.kits <> 2.5 then
    raise exception '2.6: terminada: %', row_to_json(v_carga);
  end if;
  v_r := registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 4800, t0 + interval '41 min'));
  if v_r ->> 'carga_id' is not null or (select count(*) from plc_cargas_tanque where area_id = v_pruebas) <> 1 then
    raise exception '2.6: sin preparación no hay carga abierta: %', v_r;
  end if;

  -- 2.7 Otro tanque sin que baje PREPARACION: termina la anterior y abre otra.
  v_c1 := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(1, true, true, false, false, null, 0, 3000, t0 + interval '50 min')) ->> 'carga_id')::uuid;
  v_c3 := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(3, true, true, false, false, null, 0, 3000, t0 + interval '55 min')) ->> 'carga_id')::uuid;
  if v_c1 = v_c3 then raise exception '2.7: otra carga para el tanque 3'; end if;
  if (select estado from plc_cargas_tanque where id = v_c1) <> 'PENDIENTE'
     or (select terminada_en from plc_cargas_tanque where id = v_c1) <> t0 + interval '55 min' then
    raise exception '2.7: la del tanque 1 queda PENDIENTE';
  end if;
  if (pg_temp.abierta('PRUEBAS')).id is distinct from v_c3 then raise exception '2.7: la abierta es la del tanque 3'; end if;

  -- 2.8 Reinicio del bridge con un ajuste abierto: la primera lectura (PREPARACION en falso) lo cierra.
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(3, true, false, false, true, 2, 80, 3000, t0 + interval '60 min'));
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, t0 + interval '70 min'));
  if (select hecho_en from plc_cargas_ajustes where carga_id = v_c3) is distinct from t0 + interval '70 min' then
    raise exception '2.8: el ajuste abierto se cierra con la hora de la lectura';
  end if;
  select * into v_carga from plc_cargas_tanque where id = v_c3;
  if v_carga.estado <> 'PENDIENTE' or v_carga.terminada_en <> t0 + interval '70 min' or v_carga.kits_listos_en is null then
    raise exception '2.8: terminada, con los kits listos: %', row_to_json(v_carga);
  end if;

  -- 2.9 Un momento en el futuro no se guarda en el futuro.
  v_c := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(1, true, true, false, false, null, 0, 1000, now() + interval '1 day')) ->> 'carga_id')::uuid;
  if (select iniciada_en from plc_cargas_tanque where id = v_c) > now() then raise exception '2.9: el futuro se guarda como ahora'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, now()));

  -- 2.10 Kits listos sin haber visto la fase 2 (el bridge arrancó en la fase 3).
  v_c := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 2, 0, 4000, now())) ->> 'carga_id')::uuid;
  if (select kits_listos_en from plc_cargas_tanque where id = v_c) is null then raise exception '2.10: con la fase 3, los kits ya están listos'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, now()));

  -- 2.11 Una carga descartada que el PLC sigue preparando no abre otra.
  v_c := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(1, true, true, false, false, null, 0, 2000, now())) ->> 'carga_id')::uuid;
  update plc_cargas_tanque set estado = 'DESCARTADA', descartada_en = now() where id = v_c;
  v_r := registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(1, true, false, true, false, 2, 0, 2000, now()));
  if (select count(*) from plc_cargas_tanque where area_id = v_pruebas and numero_tanque = 1 and terminada_en is null) <> 1
     or (pg_temp.abierta('PRUEBAS')).id <> v_c then
    raise exception '2.11: sigue la descartada, sin una nueva';
  end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, now()));
  if (select estado from plc_cargas_tanque where id = v_c) <> 'DESCARTADA' then raise exception '2.11: al terminar sigue descartada'; end if;

  delete from plc_cargas_tanque where area_id = v_pruebas;
  raise notice '2. registrar_carga_plc: OK';
end $$;

-- ---------------------------------------------------------------------
-- 3. Desde la tarjeta: estado, registrar y descartar
-- ---------------------------------------------------------------------
-- Una carga hecha en la HMI: kits en la fase 2 (si vienen), un ajuste por
-- cada valor de p_ajustes y, si p_terminar, PREPARACION baja (PENDIENTE).
create function pg_temp.carga(p_tanque int, p_kits numeric, p_ajustes numeric[], p_desde timestamptz, p_terminar boolean default true)
returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_t timestamptz := p_desde;
  v_a numeric;
begin
  v_id := (registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(p_tanque, true, true, false, false, null, 0, 4800, v_t)) ->> 'carga_id')::uuid;
  if p_kits is not null then
    v_t := v_t + interval '1 min';
    perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(p_tanque, true, false, true, false, p_kits, 0, 4800, v_t));
    v_t := v_t + interval '1 min';
    perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(p_tanque, true, false, false, false, p_kits, 0, 4800, v_t));
  end if;
  foreach v_a in array coalesce(p_ajustes, '{}'::numeric[]) loop
    v_t := v_t + interval '1 min';
    perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(p_tanque, true, false, false, true, p_kits, v_a, 4800, v_t));
    v_t := v_t + interval '1 min';
    perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(p_tanque, true, false, false, true, p_kits, 0, 4800, v_t));
  end loop;
  if p_terminar then
    perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, v_t + interval '1 min'));
  end if;
  return v_id;
end;
$$;
-- Lo que devuelve estado_preparacion_plc para un tanque.
create function pg_temp.tanque_plc(p_turno uuid, p_n int) returns jsonb
language sql as $$
  select e from jsonb_array_elements(estado_preparacion_plc('plc_sup', p_turno) -> 'tanques') e where (e ->> 'numero_tanque')::int = p_n;
$$;
-- El lote del tanque en el turno.
create function pg_temp.lote_del_tanque(p_turno uuid, p_n int) returns preparaciones
language sql as $$
  select p.* from preparaciones p join recepcion_tanques rt on rt.lote_id = p.id where rt.turno_id = p_turno and rt.numero_tanque = p_n;
$$;

do $$
declare
  v_pruebas uuid := (select id from areas where codigo = 'PRUEBAS');
  v_sabor uuid;
  v_vol numeric;
  v_turno uuid;
  t0 timestamptz := now() - interval '150 min';
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_g uuid; v_h uuid; v_i uuid;
  v_lote preparaciones;
  v_t jsonb;
  v_r jsonb;
  v_vi numeric;
  v_linea uuid;
begin
  -- Armado: un turno abierto en Pruebas con los 3 tanques Limpios; Calidad libera apagado.
  select id, volumen into v_sabor, v_vol from sabores where activo and volumen > 0 order by nombre limit 1;
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select 'plc_vista', 'x', 'Vista Ensayo', p.id, true from puestos p where p.codigo = 'SOLO_VISTA';
  update areas set calidad_libera = false where id = v_pruebas;
  update turnos set estado = 'CERRADO' where area_id = v_pruebas and estado = 'ABIERTO';
  delete from plc_cargas_tanque where area_id = v_pruebas;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  values ('PLC-A', v_pruebas, (select id from usuarios where usuario = 'plc_sup'), (select id from turno_tipos where codigo = 'TURNO_1'),
          (select id from grupos order by codigo limit 1), current_date, time '07:00', now() - interval '3 hours')
  returning id into v_turno;
  insert into recepcion_tanques (turno_id, numero_tanque, condicion) select v_turno, n, 'LIMPIO' from generate_series(1, 3) n;

  -- 3.13 Interruptor apagado y permiso.
  update areas set preparacion_plc = false where id = v_pruebas;
  v_r := estado_preparacion_plc('plc_sup', v_turno);
  if (v_r ->> 'habilitado')::boolean or jsonb_array_length(v_r -> 'tanques') <> 0 then raise exception '3.13: apagado, sin tanques: %', v_r; end if;
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'X1', null, null, false, false) $q$, v_turno, gen_random_uuid(), v_sabor),
                       'no está habilitada en esta área') then
    raise exception '3.13: apagado no registra';
  end if;
  update areas set preparacion_plc = true where id = v_pruebas;
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_vista', %L, %L, %L, 'X1', null, null, false, false) $q$, v_turno, gen_random_uuid(), v_sabor),
                       'No tienes permiso para cargar Preparación') then
    raise exception '3.13: registrar sin TURNO_CARGAR';
  end if;
  if not pg_temp.falla(format($q$ select descartar_carga_plc('plc_vista', %L, %L) $q$, v_turno, gen_random_uuid()), 'No tienes permiso para cargar Preparación') then
    raise exception '3.13: descartar sin TURNO_CARGAR';
  end if;

  -- 3.1 Cola del tanque 1: la más antigua primero.
  v_a := pg_temp.carga(1, 2, array[100], t0);
  v_b := pg_temp.carga(1, 2.5, null, t0 + interval '30 min');
  v_t := pg_temp.tanque_plc(v_turno, 1);
  if jsonb_array_length(v_t -> 'cola') <> 2 or v_t -> 'cola' -> 0 ->> 'id' <> v_a::text or v_t -> 'cola' -> 1 ->> 'id' <> v_b::text then
    raise exception '3.1: la cola en orden: %', v_t;
  end if;
  if (v_t -> 'cola' -> 0 ->> 'kits')::numeric <> 2 or not (v_t -> 'cola' -> 0 ->> 'kits_listos')::boolean
     or (v_t -> 'cola' -> 0 ->> 'agua_formula_l')::numeric <> 4800 or v_t -> 'cola' -> 0 ->> 'estado' <> 'PENDIENTE'
     or jsonb_array_length(v_t -> 'cola' -> 0 -> 'ajustes') <> 1 or (v_t -> 'cola' -> 0 -> 'ajustes' -> 0 ->> 'litros')::numeric <> 100
     or (v_t -> 'cola' -> 0 -> 'ajustes' -> 0 ->> 'sumado')::boolean then
    raise exception '3.1: datos de la carga en la cola: %', v_t -> 'cola' -> 0;
  end if;
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'B1', null, null, false, false) $q$, v_turno, v_b, v_sabor),
                       'Primero registra la carga más antigua del Tanque 1') then
    raise exception '3.1: la más antigua primero';
  end if;

  -- 3.3 Registrar sobre el tanque Limpio: lote En Preparación con los kits y el ajuste.
  perform confirmar_carga_plc('plc_sup', v_turno, v_a, v_sabor, 'A1', null, null, false, false);
  v_lote := pg_temp.lote_del_tanque(v_turno, 1);
  if (select condicion from recepcion_tanques where turno_id = v_turno and numero_tanque = 1) <> 'EN_PREPARACION' then raise exception '3.3: tanque En Preparación'; end if;
  if v_lote.tambores <> 2 or v_lote.volumen_inicial_l <> 2 * v_vol + 100 or v_lote.volumen_l <> 2 * v_vol + 100 or v_lote.lote <> 'A1'
     or v_lote.liberado_en is not null then
    raise exception '3.3: el lote: %', row_to_json(v_lote);
  end if;
  if not exists (select 1 from preparaciones_ajuste_volumen av join usuarios u on u.id = av.usuario_id
                  where av.lote_id = v_lote.id and av.origen = 'PLC' and av.litros = 100 and u.usuario = 'plc-bridge' and av.turno_id = v_turno) then
    raise exception '3.3: el ajuste del PLC suma con su línea';
  end if;
  if not exists (select 1 from plc_cargas_tanque where id = v_a and estado = 'CONFIRMADA' and preparacion_id = v_lote.id and kits_usados = 2
                    and confirmada_por = (select id from usuarios where usuario = 'plc_sup')) then
    raise exception '3.3: la carga queda registrada';
  end if;
  if (select ajuste_volumen_id from plc_cargas_ajustes where carga_id = v_a) is null then raise exception '3.3: el ajuste queda ligado a su línea'; end if;

  -- 3.14 Desglose del lote En Preparación.
  v_t := pg_temp.tanque_plc(v_turno, 1);
  if v_t -> 'carga_del_lote' ->> 'id' <> v_a::text then raise exception '3.14: la carga del lote'; end if;
  if (v_t -> 'desglose' ->> 'unidades')::numeric <> 2 or (v_t -> 'desglose' ->> 'litros_por_unidad')::numeric <> v_vol
     or (v_t -> 'desglose' ->> 'resto_l')::numeric <> 0 or (v_t -> 'desglose' ->> 'desvase_l')::numeric <> 0
     or (v_t -> 'desglose' ->> 'total_l')::numeric <> 2 * v_vol + 100
     or jsonb_array_length(v_t -> 'desglose' -> 'ajustes') <> 1 or v_t -> 'desglose' -> 'ajustes' -> 0 ->> 'origen' <> 'PLC' then
    raise exception '3.14: desglose: %', v_t -> 'desglose';
  end if;
  if jsonb_array_length(v_t -> 'cola') <> 1 then raise exception '3.14: en la cola queda la otra'; end if;

  -- 3.5a Encima de un lote sin liberar: «Libera primero».
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'B1', null, null, false, false) $q$, v_turno, v_b, v_sabor),
                       'Libera primero el lote A1 del Tanque 1') then
    raise exception '3.5: libera primero';
  end if;

  -- 3.4 + 3.14 Liberado y con 1.200 L de resto; los kits se corrigen a 3 (el PLC marcó 2,5).
  perform liberar_lote('plc_sup', v_turno, v_lote.id);
  update preparaciones set volumen_l = 1200 where id = v_lote.id;
  perform confirmar_carga_plc('plc_sup', v_turno, v_b, v_sabor, 'B1', 3, null, false, false);
  v_lote := pg_temp.lote_del_tanque(v_turno, 1);
  if v_lote.tambores <> 3 or v_lote.resto_heredado_l <> 1200 or v_lote.volumen_inicial_l <> 3 * v_vol + 1200 then
    raise exception '3.4: kits corregidos y resto: %', row_to_json(v_lote);
  end if;
  if not exists (select 1 from plc_cargas_tanque where id = v_b and kits = 2.5 and kits_usados = 3) then raise exception '3.4: quedan los dos kits'; end if;
  if not exists (select 1 from auditoria where entidad = 'plc_cargas_tanque' and entidad_id = v_b::text
                    and resumen = 'Registró la carga del PLC del Tanque 1: 3 kits (el PLC marcó 2,5)') then
    raise exception '3.4: la auditoría dice la diferencia';
  end if;
  if (pg_temp.tanque_plc(v_turno, 1) -> 'desglose' ->> 'resto_l')::numeric <> 1200 then raise exception '3.14: el resto en el desglose'; end if;

  -- 3.2 Kits todavía cargándose (fase 2 en curso); sin kits del PLC.
  v_c := pg_temp.carga(2, null, null, t0 + interval '60 min', false);
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, true, false, 2, 0, 4800, t0 + interval '61 min'));
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'C1', null, null, false, false) $q$, v_turno, v_c, v_sabor),
                       'El PLC todavía está cargando los kits') then
    raise exception '3.2: con los kits sin terminar';
  end if;
  v_d := pg_temp.carga(3, null, null, t0 + interval '65 min');
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'D1', null, null, false, false) $q$, v_turno, v_d, v_sabor),
                       'Faltan los kits: el PLC no los registró') then
    raise exception '3.2: sin kits';
  end if;

  -- 3.12 / 3.11 Descartar una pendiente; dos veces no.
  v_r := descartar_carga_plc('plc_sup', v_turno, v_d);
  if not (v_r ->> 'habilitado')::boolean then raise exception '3.12: descartar devuelve el estado'; end if;
  if not exists (select 1 from plc_cargas_tanque where id = v_d and estado = 'DESCARTADA' and motivo_descarte is not null
                    and descartada_por = (select id from usuarios where usuario = 'plc_sup')) then
    raise exception '3.12: descartada';
  end if;
  if not pg_temp.falla(format($q$ select descartar_carga_plc('plc_sup', %L, %L) $q$, v_turno, v_d), 'ya se registró o se descartó') then
    raise exception '3.11: descartar dos veces';
  end if;

  -- 3.6 Tanque en CIP: registrar la carga lo da por terminado.
  update recepcion_tanques set condicion = 'CIP', cip_iniciado_en = now() where turno_id = v_turno and numero_tanque = 2;
  perform confirmar_carga_plc('plc_sup', v_turno, v_c, v_sabor, 'C1', null, null, false, false);
  if not exists (select 1 from recepcion_tanques where turno_id = v_turno and numero_tanque = 2 and condicion = 'EN_PREPARACION' and cip_finalizado_en is not null) then
    raise exception '3.6: CIP terminado y En Preparación';
  end if;

  -- 3.7a / 3.8 Registrar y liberar (terminada en el PLC): con Calidad libera, no.
  v_e := pg_temp.carga(3, 1, array[80], t0 + interval '80 min');
  update areas set calidad_libera = true where id = v_pruebas;
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'E1', null, null, false, true) $q$, v_turno, v_e, v_sabor),
                       'En esta área libera Calidad') then
    raise exception '3.7: con Calidad libera no se libera';
  end if;
  update areas set calidad_libera = false where id = v_pruebas;
  perform confirmar_carga_plc('plc_sup', v_turno, v_e, v_sabor, 'E1', null, null, false, true);
  v_lote := pg_temp.lote_del_tanque(v_turno, 3);
  if v_lote.liberado_en is null or v_lote.volumen_inicial_l <> v_vol + 80
     or (select condicion from recepcion_tanques where turno_id = v_turno and numero_tanque = 3) <> 'LISTO' then
    raise exception '3.8: liberado con el ajuste sumado: %', row_to_json(v_lote);
  end if;
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'E2', null, null, false, false) $q$, v_turno, v_e, v_sabor),
                       'ya se registró o se descartó') then
    raise exception '3.11: registrar dos veces';
  end if;

  -- 3.7b / 3.9 Registrar con el PLC en curso: los ajustes siguientes se suman hasta liberar.
  perform liberar_lote('plc_sup', v_turno, (pg_temp.lote_del_tanque(v_turno, 2)).id);
  v_f := pg_temp.carga(2, 1.5, null, t0 + interval '100 min', false);
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'F1', null, null, false, true) $q$, v_turno, v_f, v_sabor),
                       'El PLC sigue con esta preparación') then
    raise exception '3.7: en curso no se libera';
  end if;
  perform confirmar_carga_plc('plc_sup', v_turno, v_f, v_sabor, 'F1', null, null, false, false);
  v_lote := pg_temp.lote_del_tanque(v_turno, 2);
  v_vi := v_lote.volumen_inicial_l;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 1.5, 60, 4800, t0 + interval '110 min'));
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 1.5, 0, 4800, t0 + interval '111 min'));
  if (select volumen_inicial_l from preparaciones where id = v_lote.id) <> v_vi + 60 then raise exception '3.9: el ajuste de 60 se suma enseguida'; end if;
  if not exists (select 1 from preparaciones_ajuste_volumen where lote_id = v_lote.id and origen = 'PLC' and litros = 60 and turno_id = v_turno) then
    raise exception '3.9: con su línea, en el turno abierto';
  end if;
  perform liberar_lote('plc_sup', v_turno, v_lote.id);
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 1.5, 40, 4800, t0 + interval '115 min'));
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(2, true, false, false, true, 1.5, 0, 4800, t0 + interval '116 min'));
  if (select volumen_inicial_l from preparaciones where id = v_lote.id) <> v_vi + 60 then raise exception '3.9: después de liberar no se suma'; end if;
  if not exists (select 1 from plc_cargas_ajustes where carga_id = v_f and litros = 40 and ajuste_volumen_id is null and no_sumado_motivo is not null) then
    raise exception '3.9: el ajuste queda anotado sin sumar';
  end if;
  if pg_temp.tanque_plc(v_turno, 2) -> 'carga_del_lote' ->> 'id' <> v_f::text then raise exception '3.9: el tanque liberado muestra la carga de su lote'; end if;
  perform registrar_carga_plc('plc-bridge', 'PRUEBAS', pg_temp.lec(null, false, false, false, false, 0, 0, 0, t0 + interval '120 min'));
  if (select estado from plc_cargas_tanque where id = v_f) <> 'CONFIRMADA' then raise exception '3.9: al terminar sigue registrada'; end if;

  -- 3.10 Registrar para Vacío: nace lista con los ajustes sumados.
  update preparaciones set cerrado_en = now() where id = (pg_temp.lote_del_tanque(v_turno, 3)).id;
  update recepcion_tanques set condicion = 'LIMPIO', lote_id = null, lote = null, sabor_id = null, volumen_l = null
   where turno_id = v_turno and numero_tanque = 3;
  v_g := pg_temp.carga(3, 2, array[50], t0 + interval '125 min');
  perform confirmar_carga_plc('plc_sup', v_turno, v_g, v_sabor, 'G1', null, null, true, false);
  v_lote := pg_temp.lote_del_tanque(v_turno, 3);
  if not v_lote.para_vacio or v_lote.liberado_en is null or v_lote.volumen_inicial_l <> 2 * v_vol + 50
     or (select condicion from recepcion_tanques where turno_id = v_turno and numero_tanque = 3) <> 'LISTO' then
    raise exception '3.10: Vacío, listo y con el ajuste: %', row_to_json(v_lote);
  end if;

  -- 3.5b Encima de un lote de Vacío, no.
  v_h := pg_temp.carga(3, 1, null, t0 + interval '135 min');
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'H1', null, null, false, false) $q$, v_turno, v_h, v_sabor),
                       'El Tanque 3 tiene un lote de Vacío') then
    raise exception '3.5: Vacío bloquea';
  end if;

  -- 3.5c Una línea parada sin PT que tomó del tanque 2.
  select id into v_linea from lineas where area_id = v_pruebas and activo order by codigo limit 1;
  insert into turno_lineas (turno_id, linea_id, sabor_id, lote, lote_id, activa, activada_en)
  values (v_turno, v_linea, v_sabor, 'F1', (pg_temp.lote_del_tanque(v_turno, 2)).id, false, now() - interval '30 min');
  v_i := pg_temp.carga(2, 1, null, t0 + interval '140 min');
  if not pg_temp.falla(format($q$ select confirmar_carga_plc('plc_sup', %L, %L, %L, 'I1', null, null, false, false) $q$, v_turno, v_i, v_sabor),
                       'está parada sin Producto Terminado') then
    raise exception '3.5: línea parada sin PT bloquea';
  end if;

  raise notice '3. Estado, registrar y descartar: OK';
end $$;

rollback;
