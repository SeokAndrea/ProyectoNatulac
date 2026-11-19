-- Ejecutar contra una copia local con la migración 20261119090000 aplicada.
begin;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_linea uuid;
  v_codigo text;
  v_usuario uuid;
  v_equipo uuid;
  v_sistema uuid;
  v_subsistema uuid;
  v_falla_a uuid;
  v_falla_b uuid;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_turno uuid;
  v_corrida uuid;
  v_pausada jsonb;
  v_operacion_a uuid := gen_random_uuid();
  v_operacion_b uuid := gen_random_uuid();
  v_operacion_c uuid := gen_random_uuid();
  v_operacion_pausa uuid := gen_random_uuid();
  v_rechazada uuid := gen_random_uuid();
  v_inicio text := to_char((now() - interval '4 hours') at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS');
  v_medio text := to_char((now() - interval '3 hours') at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS');
  v_fin text := to_char((now() - interval '2 hours') at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS');
begin
  select id, codigo into strict v_linea, v_codigo
  from lineas where area_id = v_area and activo order by codigo limit 1;
  update areas set catalogo_modular = true where id = v_area;
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
  select 'ens_parada_exacta', 'x', 'Ensayo paradas', id from puestos where codigo = 'PROBADOR'
  returning id into v_usuario;

  insert into catalogo_equipos(sufijo, nombre, tipo)
  values ('ZZPE', 'Equipo de ensayo', 'SERVICIOS') returning id into v_equipo;
  insert into catalogo_sistemas(equipo_id, sufijo, nombre)
  values (v_equipo, 'ZZS', 'Sistema de ensayo') returning id into v_sistema;
  insert into catalogo_subsistemas(sistema_id, sufijo, nombre)
  values (v_sistema, 'ZZU', 'Sensores') returning id into v_subsistema;
  insert into catalogo_fallas(subsistema_id, numero, nombre)
  values (v_subsistema, 1, 'Falla A') returning id into v_falla_a;
  insert into catalogo_fallas(subsistema_id, numero, nombre)
  values (v_subsistema, 2, 'Falla B') returning id into v_falla_b;

  v_a := anotar_parada('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', v_inicio, v_medio,
    'Parada A', p_falla_id => v_falla_a, p_operacion_id => v_operacion_a);
  v_b := anotar_parada('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', v_medio, v_fin,
    'Parada B', p_falla_id => v_falla_b, p_operacion_id => v_operacion_b);
  if v_a = v_b or not exists (select 1 from paradas where id = v_a and falla_produccion_id = v_falla_a)
    or not exists (select 1 from paradas where id = v_b and falla_produccion_id = v_falla_b) then
    raise exception 'Cada falla debe guardarse con la parada que le corresponde.';
  end if;
  if anotar_parada('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', v_inicio, v_medio,
    'Parada A', p_falla_id => v_falla_a, p_operacion_id => v_operacion_a) is distinct from v_a then
    raise exception 'El reintento debe devolver el mismo identificador.';
  end if;
  if (select count(*) from auditoria where entidad = 'paradas' and accion = 'CREAR'
      and entidad_id = v_a::text and despues->>'falla_id' = v_falla_a::text) <> 1 then
    raise exception 'La creación debe quedar auditada una sola vez con la falla.';
  end if;

  begin
    perform anotar_parada('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', v_inicio, v_medio,
      'Parada A', p_falla_id => v_falla_b, p_operacion_id => v_operacion_a);
    raise exception 'Se aceptó reutilizar la operación con otra falla.';
  exception when others then
    if sqlerrm <> 'Este identificador ya se usó en otra operación de parada.' then raise; end if;
  end;

  begin
    perform abrir_parada_mantenimiento('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', 'Inválida',
      p_falla_id => gen_random_uuid(), p_operacion_id => v_rechazada);
    raise exception 'Se aceptó una falla inexistente.';
  exception when others then
    if sqlerrm <> 'La falla no está activa o no corresponde a esta línea.' then raise; end if;
  end;
  if exists (select 1 from paradas where linea_id = v_linea and nota = 'Inválida')
    or exists (select 1 from paradas_operaciones where id = v_rechazada) then
    raise exception 'La solicitud rechazada dejó datos guardados.';
  end if;

  v_c := abrir_parada_mantenimiento('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', 'Línea libre',
    p_responsable => 'POR_DEFINIR', p_falla_id => v_falla_a, p_operacion_id => v_operacion_c);
  if abrir_parada_mantenimiento('ens_parada_exacta', v_codigo, 'FALLA_EQUIPO', 'Línea libre',
    p_responsable => 'POR_DEFINIR', p_falla_id => v_falla_a, p_operacion_id => v_operacion_c) is distinct from v_c
    or not exists (select 1 from paradas where id = v_c and falla_produccion_id = v_falla_a and sin_corrida) then
    raise exception 'La apertura sin corrida debe guardar la falla y admitir reintentos.';
  end if;
  update paradas set fin = now() where id = v_c;

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  select 'ENS-PAR-EXACTA', v_area, v_usuario, tt.id, g.id, current_date, time '07:00', now() - interval '1 hour'
  from turno_tipos tt cross join grupos g where tt.codigo = 'TURNO_1' order by g.codigo limit 1
  returning id into v_turno;
  insert into turno_lineas (turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  select v_turno, v_linea, s.id, p.id, 'ENS-PAR-EXACTA', true, now() - interval '1 hour'
  from sabores s cross join presentaciones p limit 1
  returning id into v_corrida;

  v_pausada := pausar_linea('ens_parada_exacta', v_turno, v_corrida, 'Corrida en curso', 'FALLA_EQUIPO',
    'POR_DEFINIR', p_falla_id => v_falla_b, p_operacion_id => v_operacion_pausa);
  if pausar_linea('ens_parada_exacta', v_turno, v_corrida, 'Corrida en curso', 'FALLA_EQUIPO',
    'POR_DEFINIR', p_falla_id => v_falla_b, p_operacion_id => v_operacion_pausa) is distinct from v_pausada
    or not exists (select 1 from lineas_estado le join paradas p on p.id = le.parada_id
      where le.turno_id = v_turno and le.linea_id = v_linea and p.falla_produccion_id = v_falla_b) then
    raise exception 'La pausa debe guardar la falla con el registro exacto y admitir reintentos.';
  end if;
end;
$$;

rollback;
