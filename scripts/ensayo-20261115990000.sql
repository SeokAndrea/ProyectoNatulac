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

rollback;
