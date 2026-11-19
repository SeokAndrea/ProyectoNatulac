-- El T2 de 12x12 se reparte a las 19:00. La anotaci?n valida el turno elegido.
create or replace function ventana_paradas_turno(p_turno_id uuid)
returns table (desde timestamptz, hasta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select tu.id, tu.area_id, tu.created_at, tu.estado,
           tt.hora_inicio is not null as con_horario,
           tu.esquema = '12x12' and tt.codigo = 'TURNO_2' as t2_partido,
           tu.hora_inicio >= time '17:00' as t2_noche,
           tu.fecha,
           (tu.fecha + tt.hora_inicio) at time zone 'America/Caracas' as of_ini,
           ((tu.fecha + case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end) + tt.hora_fin)
             at time zone 'America/Caracas' as of_fin,
           case when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
                then (tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas' end as cierre
    from turnos tu
    join turno_tipos tt on tt.id = tu.turno_tipo_id
    where tu.id = p_turno_id
  ),
  r as (
    select b.*,
           b.con_horario and b.of_ini >= timestamptz '2026-10-28 00:00:00-04' as nueva_regla,
           -- El turno anterior del área: hasta cuándo contó (regla de antes).
           (select case when an.estado = 'CERRADO' and an.fecha_fin is not null and an.hora_fin is not null
                        then (an.fecha_fin + an.hora_fin) at time zone 'America/Caracas'
                        else b.created_at end
            from turnos an
            where an.area_id = b.area_id and an.created_at < b.created_at
            order by an.created_at desc
            limit 1) as cierre_anterior,
           -- El turno siguiente del área, si ya va con la regla nueva: desde cuándo cuenta (su hora
           -- oficial, o su apertura si fue antes). Con la regla de antes (o 12x12): null.
           (select case when st.hora_inicio is not null
                             and (sg.fecha + st.hora_inicio) at time zone 'America/Caracas' >= timestamptz '2026-10-28 00:00:00-04'
                        then case when sg.esquema = '12x12' and st.codigo = 'TURNO_2' and sg.hora_inicio >= time '17:00'
                                  then (sg.fecha + time '19:00') at time zone 'America/Caracas'
                                  else least(sg.created_at, (sg.fecha + st.hora_inicio) at time zone 'America/Caracas') end end
            from turnos sg
            join turno_tipos st on st.id = sg.turno_tipo_id
            where sg.area_id = b.area_id and sg.created_at > b.created_at
            order by sg.created_at
            limit 1) as inicio_siguiente
    from b
  )
  select
    case when r.nueva_regla and r.t2_partido and r.t2_noche
           then (r.fecha + time '19:00') at time zone 'America/Caracas'
         when r.nueva_regla then least(r.created_at, r.of_ini)
         -- Regla de 20261111590000.
         else least(r.created_at, greatest(r.of_ini, r.cierre_anterior)) end,
    case when r.nueva_regla and r.t2_partido then greatest(
           case when r.t2_noche then (r.fecha + time '19:00') at time zone 'America/Caracas'
                else least(r.created_at, r.of_ini) end,
           least(coalesce(r.cierre, now()), r.inicio_siguiente,
                 (r.fecha + case when r.t2_noche then time '22:30' else time '19:00' end) at time zone 'America/Caracas'))
         when r.cierre is null then now()
         -- Lo cerraron después de que empezó el siguiente: termina ahí (nunca antes de su propio comienzo).
         when r.inicio_siguiente is not null
           then greatest(least(r.cierre, r.inicio_siguiente),
                         case when r.nueva_regla then least(r.created_at, r.of_ini)
                              else least(r.created_at, greatest(r.of_ini, r.cierre_anterior)) end)
         else r.cierre end
  from r;
$$;
revoke execute on function ventana_paradas_turno(uuid) from public, anon, authenticated;

drop function anotar_parada(text, text, text, text, text, text, text, text, uuid, uuid);
create or replace function anotar_parada(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_inicio text default null,
  p_fin text default null,
  p_nota text default null,
  p_pagina text default 'Registrar Paradas',
  p_responsable text default null,
  p_falla_id uuid default null,
  p_operacion_id uuid default null,
  p_turno_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repetida jsonb;
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo paradas_tipos;
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_ini timestamptz;
  v_fin timestamptz;
  v_turno_id uuid;
  v_ventana record;
  v_marca timestamptz := now();
  v_id uuid;
  -- Quién la registra decide de quién es (20261112150000), no si trae horas.
  v_origen text := case when es_de_mantenimiento(lower(p_usuario)) then 'MANTENIMIENTO' else 'MANUAL' end;
  -- Responsable elegido en Anotar (20261113290000); sin él, lo decide quién la registra (trigger).
  v_responsable text := nullif(btrim(coalesce(p_responsable, '')), '');
begin
  perform exigir_usuario('anotar_parada', p_usuario);
  if v_responsable is not null and v_responsable not in ('OPERACIONAL', 'MANTENIMIENTO') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    raise exception 'Usuario no válido.';
  end if;
  v_repetida := reclamar_operacion_parada(p_operacion_id, v_usuario_id, 'anotar_parada',
    jsonb_build_array(p_linea_codigo, p_tipo_codigo, p_inicio, p_fin, p_nota, p_pagina, p_responsable, p_falla_id)
      || case when p_turno_id is null then '[]'::jsonb else jsonb_build_array(p_turno_id) end);
  if v_repetida is not null then
    return (v_repetida #>> '{}')::uuid;
  end if;
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;

  if coalesce(p_tipo_codigo, '') = '' then
    -- Tiempo ocioso de texto libre (el catálogo no tiene tipos de ocioso),
    -- igual que registrar_parada: sin tipo ni tiempo guía, con detalle obligatorio.
    if v_nota is null then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.codigo = 'POR_CLASIFICAR' then
      raise exception 'Elige el tipo de la parada.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_linea_id, v_area_id);
    v_clase := v_tipo.clase;
    if v_clase = 'OCIOSO' and v_nota is null then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
  end if;
  if p_falla_id is not null then
    select nombre, clase into v_nombre, v_clase
    from falla_para_registrar_parada(p_usuario, v_linea_id, p_tipo_codigo, p_falla_id);
  elsif p_operacion_id is not null and p_tipo_codigo = 'FALLA_EQUIPO' then
    raise exception 'Elige la falla del equipo.';
  end if;
  v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_ini := hora_planta_a_timestamptz(p_inicio, 'inicio');
  v_fin := hora_planta_a_timestamptz(p_fin, 'fin');

  if p_turno_id is not null then
    select tu.id into v_turno_id
    from turnos tu
    where tu.id = p_turno_id and tu.area_id = v_area_id
    for share;
    if not found then
      raise exception 'El turno seleccionado no corresponde al ?rea de la l?nea.';
    end if;
    perform exigir_turno_escribible(p_usuario, v_turno_id, true);
    select * into v_ventana from ventana_paradas_turno(v_turno_id);
    if v_ventana.hasta <= v_ventana.desde
       or (v_ini is null and v_fin is not null)
       or (v_ini is not null and (v_fin is null or v_ini < v_ventana.desde
                                  or v_fin > v_ventana.hasta or v_fin <= v_ini)) then
      raise exception 'Pon las horas de inicio y fin dentro del turno seleccionado.';
    end if;
    v_marca := least(now(), v_ventana.hasta - interval '1 microsecond');
  end if;

  if v_ini is null then
    -- +1 pendiente. No se acepta otro igual sin completar en la línea.
    perform pg_advisory_xact_lock(hashtextextended('parada pendiente:' || v_linea_id::text, 0));
    if exists (
      select 1 from paradas
      where linea_id = v_linea_id and tipo_id is not distinct from v_tipo.id and clase = v_clase and pendiente
        and (p_falla_id is null or falla_produccion_id = p_falla_id)
    ) then
      raise exception 'Ya hay una parada «%» sin completar en %. Pon cuánto duró antes de sumar otra.', v_nombre, v_linea_nombre;
    end if;

    if p_turno_id is null then
      select tu.id into v_turno_id
      from turnos tu
      where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
      order by tu.fecha desc, tu.hora_inicio desc
      limit 1;
    end if;

    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       falla_produccion_id, falla_final_id,
                         inicio, fin, pendiente, creado_por, responsable)
    values (v_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia, v_nota,
          p_falla_id, case when es_de_mantenimiento(p_usuario) then p_falla_id end,
            v_marca, v_marca, true, v_usuario_id, v_responsable)
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
      format('+1 «%s» en %s (pendiente de minutos)', v_nombre, v_linea_nombre),
      null,
      jsonb_build_object('turno_id', p_turno_id, 'falla_id', p_falla_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre, 'pendiente', true, 'nota', v_nota)
    );
    if p_operacion_id is not null then
      update paradas_operaciones set resultado = to_jsonb(v_id) where id = p_operacion_id;
    end if;
    return v_id;
  end if;

  -- Con horas reales (lo que hacía Mantenimiento). turno_id null: a cada
  -- turno le tocan los minutos que se solapan con su horario.
  if v_ini > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_fin is not null then
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    -- LNPE: hasta el final del turno en curso (dueña, 2026-10-14).
    if v_fin > now() + interval '1 minute'
       and not (coalesce(v_tipo.prefijo_planilla, '') = 'LNPE' and v_fin <= now() + interval '8 hours 31 minutes') then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  end if;
  if coalesce(v_fin, now()) - v_ini > interval '30 days' then
    raise exception 'La parada no puede durar más de 30 días.';
  end if;
  if exists (
    select 1 from paradas p
    where p.linea_id = v_linea_id
      -- Las que se cargaron con horas (de Mantenimiento o de Producción); la Parada abierta de Líneas no cuenta.
      and (p.origen = 'MANTENIMIENTO'
           or (p.origen = 'MANUAL' and p.turno_id is null and p.fin is not null and not p.pendiente)
           -- La abierta de una línea sin corrida (20261112890000) ocupa el tiempo hasta que se termine.
           or (p.sin_corrida and p.fin is null and not p.pendiente))
      and p.inicio < coalesce(v_fin, now()) and coalesce(p.fin, now()) > v_ini
  ) then
    raise exception 'Ya hay una parada con horas en esa línea en ese horario. Termínala o ajusta las horas.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       falla_produccion_id, falla_final_id,
                       inicio, fin, creado_por, responsable)
  values (null, v_linea_id, v_tipo.id, v_clase, v_origen, v_nombre, v_guia, v_nota,
          p_falla_id, case when es_de_mantenimiento(p_usuario) then p_falla_id end,
          v_ini, v_fin, v_usuario_id, v_responsable)
  returning id into v_id;
  -- Antes el trigger lo hacía solo para las de Mantenimiento: una abierta de 15 min pone la línea en Parada.
  if v_fin is null then
    perform aplicar_paradas_a_lineas(null, v_linea_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Registró la parada «%s» en %s%s', v_nombre, v_linea_nombre, case when v_fin is null then ' (en curso)' else '' end),
    null,
    jsonb_build_object('falla_id', p_falla_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'inicio', p_inicio, 'fin', p_fin, 'nota', v_nota)
  );
  if p_operacion_id is not null then
    update paradas_operaciones set resultado = to_jsonb(v_id) where id = p_operacion_id;
  end if;
  return v_id;
end;
$$;

grant execute on function anotar_parada(text, text, text, text, text, text, text, text, uuid, uuid, uuid) to anon, authenticated;
