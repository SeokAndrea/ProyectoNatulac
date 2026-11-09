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

rollback;
