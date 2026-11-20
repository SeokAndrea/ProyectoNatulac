begin;

do $$
declare
  v_area uuid := (select id from areas where codigo = 'PRUEBAS');
  v_u uuid;
  v_turno uuid;
  v_relevo uuid;
  v_corrida uuid;
  v_linea lineas;
  v_p uuid;
  v_falla uuid;
  v_sub uuid;
  v_sis uuid;
  v_eq uuid;
  v_inicio text := '2026-11-18T08:00:00';
  v_rechazo boolean := false;
begin
  select * into strict v_linea from lineas where area_id = v_area and activo order by codigo limit 1;
  update areas set catalogo_modular = true where id = v_area;
  insert into usuarios (usuario, password_hash, nombre, puesto_id, ve_errores)
  select 'ens_cip_real', 'x', 'Ensayo CIP', id, true from puestos where codigo = 'PROBADOR'
  returning id into v_u;
  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, created_at)
  select 'ENS-CIP-REAL', v_area, v_u, tt.id, g.id, '2026-11-18', '07:00', '2026-11-18 07:00-04'
  from turno_tipos tt cross join grupos g where tt.codigo = 'TURNO_1' order by g.codigo limit 1
  returning id into v_turno;
  insert into catalogo_equipos (sufijo, nombre, tipo) values ('ECIP', 'Equipo ensayo CIP', 'SERVICIOS') returning id into v_eq;
  insert into catalogo_sistemas (equipo_id, sufijo, nombre) values (v_eq, 'SIP', 'Sistema CIP') returning id into v_sis;
  insert into catalogo_subsistemas (sistema_id, sufijo, nombre) values (v_sis, 'UCP', 'Subsistema CIP') returning id into v_sub;
  insert into catalogo_fallas (subsistema_id, numero, nombre) values (v_sub, 1, 'Falla de ensayo') returning id into v_falla;

  -- Se conserva el comienzo de la parada que originó el lavado.
  insert into turno_lineas(turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
  select v_turno, v_linea.id, s.id, p.id, 'ENS-CIP-REAL', true, timestamptz '2026-11-18 07:00-04'
  from sabores s cross join presentaciones p limit 1 returning id into v_corrida;
  v_p := abrir_parada_mantenimiento('ens_cip_real', v_linea.codigo, 'FALLA_EQUIPO', 'Falla anterior',
    '2026-11-18T07:45:00', 'MANTENIMIENTO', v_falla);
  perform poner_linea_en_cip('ens_cip_real', v_turno, v_linea.codigo, 'FALLA_MECANICA',
    p_turno_linea_id => v_corrida, p_lote_sigue => true, p_inicio_real => v_inicio,
    p_falla_id => v_falla, p_parada_id => v_p);
  if not exists (select 1 from paradas where id = v_p and not pendiente
    and inicio = timestamptz '2026-11-18 07:45-04' and cip_inicio_real = timestamptz '2026-11-18 08:00-04') then
    raise exception 'Debe reutilizar la parada y conservar el inicio real del lavado.';
  end if;
  perform terminar_parada('ens_cip_real', v_p, 'FALLA_EQUIPO', null, 'Se reparó',
    '2026-11-18T08:45:00', p_reparacion_min => 45, p_falla_final_id => v_falla);
  if not exists (select 1 from paradas where id = v_p and fin is null and reparacion_min = 45 and falla_final_id = v_falla) then
    raise exception 'La reparación dentro del CIP no debe cerrar la parada.';
  end if;
  perform terminar_cip('ens_cip_real', v_turno, v_linea.codigo, '2026-11-18T11:20:00', 'Espera de material');
  if not exists (select 1 from paradas where id = v_p and fin = timestamptz '2026-11-18 11:00-04'
    and cip_confirmado_en > fin and reparacion_min = 45) then
    raise exception 'La confirmación tardía no debe extender los minutos del lavado.';
  end if;
  if not exists (select 1 from paradas where linea_id = v_linea.id and tipo_nombre = 'Espera después de CIP'
    and inicio = timestamptz '2026-11-18 11:00-04' and fin = timestamptz '2026-11-18 11:20-04') then
    raise exception 'La espera debe quedar separada y sin solapar el lavado.';
  end if;
  if not exists (select 1 from turno_lineas where id = v_corrida and activa and pausada_en is null) then
    raise exception 'Con lavado y reparación terminados debe continuar la corrida.';
  end if;
  update turno_lineas set activa = false, finalizada_en = now() where id = v_corrida;

  -- El suministro eléctrico también se registra directamente como parada.
  perform poner_linea_en_cip('ens_cip_real', v_turno, v_linea.codigo, 'SUMINISTRO_ELECTRICO',
    p_inicio_real => '2026-11-18T12:00:00');
  select le.parada_id into v_p from lineas_estado le where le.turno_id = v_turno and le.linea_id = v_linea.id;
  perform terminar_cip('ens_cip_real', v_turno, v_linea.codigo);
  if not exists (select 1 from paradas where id = v_p and not pendiente and fin - inicio = interval '180 minutes') then
    raise exception 'El CIP eléctrico debe guardar 180 minutos sin pendiente.';
  end if;

  -- Un CIP recién registrado permanece abierto y se clasifica como programado.
  perform poner_linea_en_cip('ens_cip_real', v_turno, v_linea.codigo, 'HORAS_36');
  select le.parada_id into v_p from lineas_estado le where le.turno_id = v_turno and le.linea_id = v_linea.id;
  if not exists (select 1 from paradas where id = v_p and clase = 'PROGRAMADA' and not pendiente) then
    raise exception 'La limpieza por 36 horas debe ser programada y sin pendiente.';
  end if;
  begin
    perform terminar_cip('ens_cip_real', v_turno, v_linea.codigo);
  exception when others then
    if sqlerrm not like '%todavía no cumple los 180 minutos%' then raise; end if;
    v_rechazo := true;
  end;
  if not v_rechazo then raise exception 'El cierre anticipado debe fallar.'; end if;
  v_rechazo := false;
  begin
    insert into turno_lineas(turno_id, linea_id, sabor_id, presentacion_id, lote, activa, activada_en)
    select v_turno, v_linea.id, s.id, p.id, 'ENS-CIP-REAL', true, now()
    from sabores s cross join presentaciones p limit 1;
  exception when others then
    if sqlerrm not like '%sigue en lavado o reparación%' then raise; end if;
    v_rechazo := true;
  end;
  if not v_rechazo then raise exception 'El arranque anticipado debe fallar.'; end if;

  -- Simula el fin del lavado y el relevo con la misma parada aún en reparación.
  update paradas set cip_inicio_real = timestamptz '2026-11-18 08:00-04',
    inicio = timestamptz '2026-11-18 08:00-04', responsable = 'MANTENIMIENTO'
  where id = v_p;
  v_relevo := abrir_turno(v_u, 'PRUEBAS', 'TURNO_2', (select codigo from grupos where id =
    (select grupo_id from turnos where id = v_turno)), false);
  if not exists (select 1 from lineas_estado where turno_id = v_relevo and parada_id = v_p and condicion = 'CIP') then
    raise exception 'El relevo debe conservar la parada ligada al CIP.';
  end if;
  perform terminar_cip('ens_cip_real', v_relevo, v_linea.codigo);
  if not exists (select 1 from paradas where id = v_p and fin is null and cip_confirmado_en is not null) then
    raise exception 'Confirmar el lavado no debe cerrar una reparación pendiente.';
  end if;
  perform terminar_parada('ens_cip_real', v_p, 'LIMPIEZA_INTERMEDIA', null,
    'Se reparó después del lavado', '2026-11-18T11:40:00', p_reparacion_min => 65);
  if not exists (select 1 from paradas where id = v_p and fin - inicio = interval '220 minutes' and reparacion_min = 65) then
    raise exception 'La reparación más larga debe extender la parada sin sumar dos veces el solape.';
  end if;

  -- Un CIP anterior a esta migración conserva su pendiente y el cierre previo.
  v_p := anotar_parada('ens_cip_real', v_linea.codigo, 'LIMPIEZA_INTERMEDIA');
  update lineas_estado set condicion = 'CIP', parada_id = v_p, cip_iniciado_en = now(), cip_finalizado_en = null
  where turno_id = v_relevo and linea_id = v_linea.id;
  v_rechazo := false;
  begin
    perform terminar_cip('ens_cip_real', v_relevo, v_linea.codigo);
  exception when others then
    if sqlerrm not like '%parada pendiente%' then raise; end if;
    v_rechazo := true;
  end;
  if not v_rechazo then raise exception 'El CIP anterior requiere completar su pendiente.'; end if;
  perform completar_parada('ens_cip_real', v_p, 1);
  perform terminar_cip('ens_cip_real', v_relevo, v_linea.codigo);
end;
$$;

rollback;
