-- Ensayo de 20261114590000_sif_frecuencia.sql (frecuencia y ventana de las SIF).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   docker exec -i natulac-local-db-1 psql -U postgres -d natulac -v ON_ERROR_STOP=1 < scripts/ensayo-sif-frecuencia.sql
begin;

-- Una parada de falla en el instante dado; devuelve la solicitud a la que quedó unida (o null).
create function pg_temp.par(p_linea uuid, p_tipo uuid, p_inicio timestamptz) returns uuid
language sql as $$
  insert into paradas (linea_id, tipo_id, clase, tipo_nombre, inicio, fin, responsable)
  values (p_linea, p_tipo, 'NO_PROGRAMADA', 'Falla de ensayo', p_inicio, p_inicio + interval '5 minutes', 'OPERACIONAL')
  returning sif_id;
$$;
create function pg_temp.estado(p_sif uuid) returns text
language sql as $$ select estado from solicitudes_intervencion where id = p_sif; $$;
-- Deja la línea limpia entre un caso y otro.
create function pg_temp.limpiar(p_linea uuid) returns void
language sql as $$
  update paradas set sif_id = null where linea_id = p_linea;
  delete from solicitudes_intervencion where linea_id = p_linea;
  delete from paradas where linea_id = p_linea;
$$;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_linea uuid := (select id from lineas where area_id = (select id from areas where codigo = 'PRUEBAS') order by codigo limit 1);
  v_tipo uuid := (select t.id from paradas_tipos t where t.activo and tipo_cuenta_para_sif(t.id) order by t.codigo limit 1);
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_dia timestamptz := timestamptz '2025-03-04 11:00:00+00';   -- martes 4/3/2025, 7:00 en Caracas
  v_n int;
  v_tur uuid;
  v_tt1 uuid := (select id from turno_tipos where codigo = 'TURNO_1');
  v_tt2 uuid := (select id from turno_tipos where codigo = 'TURNO_2');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_sis uuid := usuario_sistema_id();
  v_msg text;
  v_cuerpo text;
begin
  if v_linea is null or v_tipo is null then raise exception 'Faltan una línea de Pruebas o un tipo de falla que cuente para la SIF.'; end if;
  delete from sif_config where area_id = v_area;
  delete from esquema_turnos_historial where area_id = v_area;
  update areas set esquema_turnos = '3x8' where id = v_area;

  -- ---------------------------------------------------------------------
  -- 0. Permiso y funciones
  -- ---------------------------------------------------------------------
  if not exists (select 1 from permisos where codigo = 'SIF_CONFIGURAR' and tema = 'MANTENIMIENTO') then raise exception 'Falta el permiso SIF_CONFIGURAR'; end if;
  if not exists (select 1 from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'JEFE_MANTENIMIENTO' and pp.permiso_codigo = 'SIF_CONFIGURAR') then
    raise exception 'El Jefe de Mantenimiento debe tener SIF_CONFIGURAR';
  end if;
  if exists (select 1 from puesto_permisos pp join puestos p on p.id = pp.puesto_id where p.codigo = 'TECNICO_MANTENIMIENTO' and pp.permiso_codigo = 'SIF_CONFIGURAR') then
    raise exception 'El Técnico no debe tener SIF_CONFIGURAR';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. Sin configuración = como hoy: la 3.ª en la jornada es Inspección y la 4.ª Intervención
  -- ---------------------------------------------------------------------
  perform pg_temp.limpiar(v_linea);
  if (select count(*) from leer_config_sif('local', 'PRUEBAS') c where c.ventana = 'DIA' and c.inspeccion_en = 3 and c.intervencion_en = 4) <> 1 then
    raise exception '1.0 Sin fila debe leerse DIA 3 4';
  end if;
  v_s1 := pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour');
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '2 hours');
  if v_s1 is not null or v_s2 is not null then raise exception '1.1 La 1.ª y la 2.ª no generan nada'; end if;
  v_s3 := pg_temp.par(v_linea, v_tipo, v_dia + interval '3 hours');
  if v_s3 is null or pg_temp.estado(v_s3) <> 'INSPECCION' then raise exception '1.2 La 3.ª debe nacer como Inspección'; end if;
  if (select count(*) from paradas where sif_id = v_s3) <> 3 then raise exception '1.3 La Inspección debe sumar las 3 paradas'; end if;
  v_s4 := pg_temp.par(v_linea, v_tipo, v_dia + interval '4 hours');
  if v_s4 is distinct from v_s3 or pg_temp.estado(v_s3) <> 'PENDIENTE' then raise exception '1.4 La 4.ª debe subir la misma a Intervención'; end if;
  select cuerpo into v_cuerpo from correos_pendientes order by ctid desc limit 1;
  if v_cuerpo not like '%inspección a la 3.ª vez e intervención a la 4.ª%jornada%' then raise exception '1.5 El correo debe decir la regla: %', v_cuerpo; end if;

  -- 3 paradas en tres jornadas distintas: nada
  perform pg_temp.limpiar(v_linea);
  if pg_temp.par(v_linea, v_tipo, v_dia) is not null or pg_temp.par(v_linea, v_tipo, v_dia + interval '1 day') is not null
     or pg_temp.par(v_linea, v_tipo, v_dia + interval '2 days') is not null then raise exception '1.6 En jornadas distintas no debe haber SIF'; end if;

  -- ---------------------------------------------------------------------
  -- 2. guardar_config_sif: permisos, reglas y auditoría
  -- ---------------------------------------------------------------------
  insert into usuarios (usuario, password_hash, nombre, puesto_id, activo)
  select x.u, 'x', x.u, p.id, true
    from (values ('sf_jefe', 'JEFE_MANTENIMIENTO'), ('sf_tecnico', 'TECNICO_MANTENIMIENTO'), ('sf_super', 'SUPERADMINISTRADOR')) x(u, pc)
    join puestos p on p.codigo = x.pc;

  begin
    perform guardar_config_sif('sf_tecnico', 'PRUEBAS', 'TURNO', 2, 3, 'Ensayo');
    raise exception '2.1 Sin permiso debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'No tienes permiso para configurar las SIF.' then raise exception '2.1 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 3, 3, 'Ensayo');
    raise exception '2.2 intervención = inspección debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'La intervención tiene que ser después de la inspección%' then raise exception '2.2 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 4, 3, 'Ensayo');
    raise exception '2.3 intervención menor debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'La intervención tiene que ser después%' then raise exception '2.3 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 1, 3, 'Ensayo');
    raise exception '2.4 inspección 1 debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'La inspección tiene que ser entre%' then raise exception '2.4 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 5, 16, 'Ensayo');
    raise exception '2.5 intervención 16 debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'La intervención puede ser hasta%' then raise exception '2.5 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'MES', 2, 3, 'Ensayo');
    raise exception '2.6 ventana MES debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'Elige si se cuenta%' then raise exception '2.6 mensaje: %', v_msg; end if;
  end;
  begin
    perform guardar_config_sif('sf_jefe', 'MANTENIMIENTO', 'TURNO', 2, 3, 'Ensayo');
    raise exception '2.7 área que no es de producción debía rechazar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'Esa área no existe o no es de producción.' then raise exception '2.7 mensaje: %', v_msg; end if;
  end;
  if exists (select 1 from sif_config where area_id = v_area) then raise exception '2.8 Los rechazos no deben guardar nada'; end if;

  perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 2, 3, 'Ensayo');
  if (select count(*) from leer_config_sif('sf_tecnico', 'PRUEBAS') c where c.ventana = 'TURNO' and c.inspeccion_en = 2 and c.intervencion_en = 3) <> 1 then
    raise exception '2.9 leer_config_sif debe devolver lo guardado (y lo puede leer quien no configura)';
  end if;
  if not exists (select 1 from auditoria where usuario = 'sf_jefe' and entidad = 'sif_config' and entidad_id = v_area::text
                 and antes->>'ventana' = 'DIA' and despues->>'ventana' = 'TURNO' and (despues->>'inspeccion_en')::int = 2) then
    raise exception '2.10 Falta la auditoría con antes y después';
  end if;
  perform guardar_config_sif('sf_super', 'PRUEBAS', 'TURNO', 2, 3, 'Ensayo');   -- el Super Admin también puede

  -- ---------------------------------------------------------------------
  -- 3. TURNO 2/3 con turnos teóricos (3x8): martes 4/3/2025 sin turnos reales
  --    T1 = 11:00Z-19:00Z, T2 = 19:00Z-02:30Z, T3 = 02:30Z-11:00Z
  -- ---------------------------------------------------------------------
  perform pg_temp.limpiar(v_linea);
  v_s1 := pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour');       -- T1
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '2 hours');      -- T1
  if v_s1 is not null or v_s2 is null or pg_temp.estado(v_s2) <> 'INSPECCION' then raise exception '3.1 La 2.ª en el mismo turno debe ser Inspección'; end if;
  select cuerpo into v_cuerpo from correos_pendientes order by ctid desc limit 1;
  if v_cuerpo not like 'La misma falla se repitió 2 veces en el turno: hay que inspeccionar.%' or v_cuerpo not like '%contadas por turno%' then
    raise exception '3.2 El correo debe decir 2 veces y el turno: %', v_cuerpo;
  end if;
  v_s3 := pg_temp.par(v_linea, v_tipo, v_dia + interval '3 hours');
  if v_s3 is distinct from v_s2 or pg_temp.estado(v_s2) <> 'PENDIENTE' then raise exception '3.3 La 3.ª sube a Intervención'; end if;
  select cuerpo into v_cuerpo from correos_pendientes order by ctid desc limit 1;
  if v_cuerpo not like 'La falla llegó a la 3.ª: la inspección pasa a intervención.%' then raise exception '3.4 El correo debe decir la 3.ª: %', v_cuerpo; end if;

  -- Dos veces en turnos distintos (T1 y T2, luego T3): no
  perform pg_temp.limpiar(v_linea);
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour') is not null
     or pg_temp.par(v_linea, v_tipo, v_dia + interval '9 hours') is not null       -- 20:00Z = 16:00 locales, T2
     or pg_temp.par(v_linea, v_tipo, v_dia + interval '16 hours') is not null then  -- 03:00Z = 23:00 locales, T3 (el T2 acaba 22:30)
    raise exception '3.5 En turnos distintos no debe haber SIF';
  end if;
  -- T3 cruza la medianoche: 23:00 y 04:00 locales son el mismo turno
  perform pg_temp.limpiar(v_linea);
  v_s1 := pg_temp.par(v_linea, v_tipo, v_dia + interval '16 hours');           -- 03:00Z del 5/3 = 23:00 locales
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '21 hours');           -- 08:00Z del 5/3 = 04:00 locales
  if v_s2 is null then raise exception '3.6 El T3 cruza la medianoche: debe ser el mismo turno'; end if;

  -- Revisada y la falla vuelve: en el mismo turno sube; en otro turno no
  perform pg_temp.limpiar(v_linea);
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour');
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '2 hours');
  update solicitudes_intervencion set estado = 'REVISADA', revisada_en = v_dia + interval '2 hours 30 minutes' where id = v_s2;
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '9 hours') is not null then raise exception '3.7 Otro turno no debe reabrir la revisada'; end if;
  v_s3 := pg_temp.par(v_linea, v_tipo, v_dia + interval '3 hours');
  if v_s3 is distinct from v_s2 or pg_temp.estado(v_s2) <> 'PENDIENTE' then raise exception '3.8 Revisada y vuelve en el mismo turno: Intervención'; end if;

  -- Cerrada en el turno y la falla vuelve: nace una Intervención; en otro turno no
  perform pg_temp.limpiar(v_linea);
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour');
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '2 hours');
  update solicitudes_intervencion set estado = 'CERRADA', cierre = v_dia + interval '3 hours' where id = v_s2;
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '9 hours') is not null then raise exception '3.9 Cerrada en otro turno: no cuenta'; end if;
  v_s3 := pg_temp.par(v_linea, v_tipo, v_dia + interval '4 hours');
  if v_s3 is null or v_s3 = v_s2 or pg_temp.estado(v_s3) <> 'PENDIENTE' then raise exception '3.10 Cerrada en el turno y vuelve: Intervención nueva'; end if;

  -- ---------------------------------------------------------------------
  -- 4. TURNO con turnos REALES: manda el turno registrado, no el teórico
  --    Martes 1/12/2026: T1 abierto a las 6:30 (cerrado 15:10), T2 abierto a las 15:12.
  --    El T1 real cuenta desde 6:30 y termina a las 15:00 (cuando empieza el T2).
  -- ---------------------------------------------------------------------
  perform pg_temp.limpiar(v_linea);
  insert into turnos (codigo, area_id, supervisor_id, fecha, hora_inicio, turno_tipo_id, grupo_id, estado, fecha_fin, hora_fin, created_at)
  values ('ENS-T1', v_area, v_sis, date '2026-12-01', time '06:30', v_tt1, v_grupo, 'CERRADO', date '2026-12-01', time '15:10', timestamptz '2026-12-01 06:30-04'),
         ('ENS-T2', v_area, v_sis, date '2026-12-01', time '15:12', v_tt2, v_grupo, 'ABIERTO', null, null, timestamptz '2026-12-01 15:12-04');
  -- 6:45 y 8:00 locales: mismo turno real (el teórico los separaría, 6:45 sería del T3)
  v_s1 := pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 06:45-04');
  v_s2 := pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 08:00-04');
  if v_s1 is not null or v_s2 is null then raise exception '4.1 6:45 y 8:00 son del mismo turno real'; end if;
  perform pg_temp.limpiar(v_linea);
  -- 14:55 (T1) y 15:05 (T2, aunque el T1 se cerró a las 15:10): turnos distintos
  if pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 14:55-04') is not null
     or pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 15:05-04') is not null then
    raise exception '4.2 14:55 y 15:05 son de turnos distintos';
  end if;
  -- 15:20 y 21:00 (T2 abierto, termina a las 22:30 oficiales): el mismo turno
  v_s3 := pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 21:00-04');
  if v_s3 is null then raise exception '4.3 15:05 y 21:00 son del T2 abierto: Inspección'; end if;
  perform pg_temp.limpiar(v_linea);
  -- 22:50 con el T2 abierto pero ya pasada su hora de fin: turno teórico (T3), no el T2
  if pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 21:00-04') is not null
     or pg_temp.par(v_linea, v_tipo, timestamptz '2026-12-01 22:50-04') is not null then
    raise exception '4.4 Pasadas las 22:30 el T2 abierto ya no contiene el instante';
  end if;

  -- ---------------------------------------------------------------------
  -- 5. TURNO teórico en 12x12: 7:00-19:00 y 19:00-7:00
  -- ---------------------------------------------------------------------
  perform pg_temp.limpiar(v_linea);
  update areas set esquema_turnos = '12x12' where id = v_area;
  v_dia := timestamptz '2025-04-08 11:00:00+00';                               -- martes 8/4/2025, 7:00 locales
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour') is not null then raise exception '5.1'; end if;
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '9 hours') is null then raise exception '5.2 8:00 y 16:00 locales son el mismo turno de 12 h'; end if;
  perform pg_temp.limpiar(v_linea);
  if pg_temp.par(v_linea, v_tipo, v_dia + interval '9 hours') is not null
     or pg_temp.par(v_linea, v_tipo, v_dia + interval '13 hours') is not null then   -- 16:00 y 20:00 locales
    raise exception '5.3 16:00 y 20:00 locales son turnos distintos en 12x12';
  end if;
  update areas set esquema_turnos = '3x8' where id = v_area;

  -- ---------------------------------------------------------------------
  -- 6. SEMANA 3/4: de lunes 7:00 a lunes 7:00 (hora de planta)
  -- ---------------------------------------------------------------------
  perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'SEMANA', 3, 4, 'Ensayo');
  perform pg_temp.limpiar(v_linea);
  -- Semana del lunes 3/3/2025: lunes, miércoles y viernes (días distintos)
  v_s1 := pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-03 12:00+00');
  v_s2 := pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-05 12:00+00');
  v_s3 := pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-07 12:00+00');
  if v_s1 is not null or v_s2 is not null or v_s3 is null or pg_temp.estado(v_s3) <> 'INSPECCION' then
    raise exception '6.1 La 3.ª en días distintos de la misma semana es Inspección';
  end if;
  if (select fecha_jornada from solicitudes_intervencion where id = v_s3) <> date '2025-03-07' then raise exception '6.2 La jornada de la solicitud es la del día de la 3.ª'; end if;
  v_s4 := pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-08 12:00+00');
  if v_s4 is distinct from v_s3 or pg_temp.estado(v_s3) <> 'PENDIENTE' then raise exception '6.3 La 4.ª de la semana sube a Intervención'; end if;
  select cuerpo into v_cuerpo from correos_pendientes order by ctid desc limit 1;
  if v_cuerpo not like '%contadas por semana%' then raise exception '6.4 El correo dice semana: %', v_cuerpo; end if;

  -- En semanas distintas: no. Domingo 9/3 12:00Z y lunes 10/3 08:00Z (4:00 locales, todavía jornada del domingo) son de la
  -- semana 1; el lunes 10/3 15:00Z (11:00 locales) ya es de la semana 2. Con dos en cada semana no hay SIF.
  perform pg_temp.limpiar(v_linea);
  if pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-09 12:00+00') is not null
     or pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-10 08:00+00') is not null
     or pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-10 15:00+00') is not null
     or pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-12 15:00+00') is not null then
    raise exception '6.5 Dos y dos en semanas distintas no deben generar SIF';
  end if;
  -- La del domingo de madrugada del lunes sí cuenta con la semana anterior: 3 en la semana 1 -> Inspección
  perform pg_temp.limpiar(v_linea);
  perform pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-08 12:00+00');
  perform pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-09 12:00+00');
  if pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-10 08:00+00') is null then raise exception '6.6 Lunes 4:00 locales es la jornada del domingo: semana anterior'; end if;

  -- Revisada en la semana y la falla vuelve otro día de esa semana: Intervención
  perform pg_temp.limpiar(v_linea);
  perform pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-03 12:00+00');
  perform pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-04 12:00+00');
  v_s3 := pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-05 12:00+00');
  update solicitudes_intervencion set estado = 'REVISADA', revisada_en = timestamptz '2025-03-05 13:00+00' where id = v_s3;
  if pg_temp.par(v_linea, v_tipo, timestamptz '2025-03-07 12:00+00') is distinct from v_s3 or pg_temp.estado(v_s3) <> 'PENDIENTE' then
    raise exception '6.7 Revisada el miércoles y vuelve el viernes: Intervención';
  end if;

  -- ---------------------------------------------------------------------
  -- 7. DIA con 2/5 (umbrales propios): igual que hoy pero con otros números
  -- ---------------------------------------------------------------------
  perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'DIA', 2, 5, 'Ensayo');
  perform pg_temp.limpiar(v_linea);
  v_dia := timestamptz '2025-03-04 11:00:00+00';
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '1 hour');
  v_s2 := pg_temp.par(v_linea, v_tipo, v_dia + interval '2 hours');
  if v_s2 is null or pg_temp.estado(v_s2) <> 'INSPECCION' then raise exception '7.1 La 2.ª es Inspección'; end if;
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '3 hours');
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '4 hours');
  if pg_temp.estado(v_s2) <> 'INSPECCION' then raise exception '7.2 La 4.ª todavía no sube'; end if;
  perform pg_temp.par(v_linea, v_tipo, v_dia + interval '5 hours');
  if pg_temp.estado(v_s2) <> 'PENDIENTE' then raise exception '7.3 La 5.ª sube a Intervención'; end if;
  select cuerpo into v_cuerpo from correos_pendientes order by ctid desc limit 1;
  if v_cuerpo not like 'La falla llegó a la 5.ª:%' then raise exception '7.4 El correo dice la 5.ª: %', v_cuerpo; end if;

  -- ---------------------------------------------------------------------
  -- 8. Lo que ya existe no cambia al guardar otra configuración
  -- ---------------------------------------------------------------------
  v_n := (select count(*) from solicitudes_intervencion where linea_id = v_linea);
  perform guardar_config_sif('sf_jefe', 'PRUEBAS', 'TURNO', 2, 3, 'Ensayo');
  if (select count(*) from solicitudes_intervencion where linea_id = v_linea) <> v_n or pg_temp.estado(v_s2) <> 'PENDIENTE' then
    raise exception '8.1 Guardar no debe tocar las solicitudes existentes';
  end if;

  -- Aséptico no se ve afectado por la configuración de Pruebas
  if (select count(*) from leer_config_sif('sf_jefe', 'ASEPTICO') c where c.ventana = 'DIA' and c.inspeccion_en = 3 and c.intervencion_en = 4) <> 1 then
    raise exception '8.2 Aséptico sigue con los valores por defecto';
  end if;

  raise notice 'ENSAYO SIF FRECUENCIA: todo bien';
end $$;

rollback;
