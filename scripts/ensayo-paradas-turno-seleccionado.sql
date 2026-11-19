begin;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_usuario uuid;
  v_linea text := (select codigo from lineas where area_id = v_area and activo order by codigo limit 1);
  v_tipo uuid := (select id from turno_tipos where codigo = 'TURNO_2');
  v_grupo uuid := (select id from grupos order by codigo limit 1);
  v_dia uuid;
  v_noche uuid;
  v_parada uuid;
  v_ventana record;
  v_rechazo boolean := false;
begin
  insert into usuarios (usuario, password_hash, nombre, puesto_id)
  select 'ens_turno_parada', 'x', 'Ensayo turno parada', id from puestos where codigo = 'PROBADOR'
  returning id into v_usuario;

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, esquema,
                      fecha, hora_inicio, created_at, estado, fecha_fin, hora_fin)
  values ('ENS-T2-DIA', v_area, v_usuario, v_tipo, v_grupo, '12x12',
          '2026-11-17', '15:00', '2026-11-17 15:00-04', 'CERRADO', '2026-11-17', '19:05')
  returning id into v_dia;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, esquema,
                      fecha, hora_inicio, created_at, estado, fecha_fin, hora_fin)
  values ('ENS-T2-NOCHE', v_area, v_usuario, v_tipo, v_grupo, '12x12',
          '2026-11-17', '18:45', '2026-11-17 18:45-04', 'CERRADO', '2026-11-17', '22:40')
  returning id into v_noche;

  select * into strict v_ventana from ventana_paradas_turno(v_noche);
  if v_ventana.desde <> timestamptz '2026-11-17 19:00-04'
     or v_ventana.hasta <> timestamptz '2026-11-17 22:30-04' then
    raise exception 'La ventana nocturna debe ser 19:00 a 22:30.';
  end if;
  select * into strict v_ventana from ventana_paradas_turno(v_dia);
  if v_ventana.hasta <> timestamptz '2026-11-17 19:00-04' then
    raise exception 'El T2 diurno debe terminar a las 19:00.';
  end if;
  if turno_anterior_json('PRUEBAS', v_noche) ->> 'id' is distinct from v_dia::text then
    raise exception 'El turno anterior al T2 nocturno debe ser el T2 diurno.';
  end if;

  begin
    perform anotar_parada('ens_turno_parada', v_linea, null, p_nota => 'Pendiente', p_turno_id => v_noche);
  exception when others then
    if sqlerrm not like '%cerró hace más de 30 minutos%' then raise; end if;
    v_rechazo := true;
  end;
  if not v_rechazo then raise exception 'Debe rechazar la anotación sin corrección abierta.'; end if;

  insert into turno_correcciones(turno_id, usuario_id, motivo)
  values (v_noche, v_usuario, 'Ensayo local');
  v_parada := anotar_parada('ens_turno_parada', v_linea, null, p_nota => 'Pendiente', p_turno_id => v_noche);
  if not exists (select 1 from paradas where id = v_parada and turno_id = v_noche and pendiente
                 and inicio < timestamptz '2026-11-17 22:30-04') then
    raise exception 'El pendiente debe pertenecer al turno elegido.';
  end if;
  v_parada := anotar_parada('ens_turno_parada', v_linea, null, '2026-11-17T19:10:00',
    '2026-11-17T19:20:00', 'Carga retrospectiva', p_turno_id => v_noche);
  if not exists (select 1 from paradas where id = v_parada and inicio = timestamptz '2026-11-17 19:10-04') then
    raise exception 'La anotación debe conservar su fecha y hora.';
  end if;

  v_rechazo := false;
  begin
    perform anotar_parada('ens_turno_parada', v_linea, null, '2026-11-17T18:50:00',
      '2026-11-17T19:10:00', 'Cruza el relevo', p_turno_id => v_noche);
  exception when others then
    if sqlerrm not like '%dentro del turno seleccionado%' then raise; end if;
    v_rechazo := true;
  end;
  if not v_rechazo then raise exception 'Debe rechazar horas fuera del turno.'; end if;
end;
$$;

rollback;
