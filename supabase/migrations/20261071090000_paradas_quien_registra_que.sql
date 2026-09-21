-- ============================================================
-- PARADAS: quién registra qué, y sin repeticiones
-- ============================================================
-- Dueño (2026-09-21): el SUPERVISOR solo registra Operacionales, Programadas y
-- Tiempo ocioso; MANTENIMIENTO registra el resto de las No programadas (equipos,
-- Suministro, Equipo de Proceso, Domino, LNPE). Así el mismo evento no se registra
-- por dos lados. Lo valida el servidor (el Área de Pruebas puede registrar todo).
--
-- «No se pueden repetir»:
--   * Supervisor: la misma parada (línea, tipo y minutos) no se acepta dos veces en 3 minutos
--     (doble clic, reintento).
--   * Mantenimiento: una parada no puede solaparse con otra de Mantenimiento de la misma
--     línea (una en curso cuenta hasta ahora): hay que cerrarla antes de abrir otra.
-- ============================================================

create or replace function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_pagina text default 'Registrar Paradas'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno turnos;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_fin timestamptz := now();
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
  v_pres integer;
begin
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'La duración debe ser mayor que 0 minutos.';
  end if;
  if p_minutos > 1440 then
    raise exception 'La duración no puede superar 24 horas.';
  end if;

  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Solo los supervisores registran paradas (el Área de Pruebas también, para probar).
  if v_rol is distinct from 'SUPERVISOR' and v_area is distinct from 'PRUEBAS' then
    raise exception 'Solo los supervisores pueden registrar paradas.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;
  if v_turno.supervisor_id is distinct from v_usuario_id then
    raise exception 'Solo puedes registrar paradas en tu propio turno.';
  end if;

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_turno.area_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  -- Presentación (ml) que corre ahora en esa línea; sin corrida activa no se filtra por presentación.
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  if p_tipo_codigo is null then
    -- Ocioso de texto libre: sin tiempo guía.
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := null;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    -- El supervisor registra Programadas, Operacionales y Tiempo ocioso; lo demás lo registra Mantenimiento.
    if v_area is distinct from 'PRUEBAS' and v_tipo.familia not in ('PROGRAMADA', 'OPERACIONAL', 'OCIOSO') then
      raise exception 'Ese tipo de parada lo registra Mantenimiento.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

    -- El tipo puede existir solo en algunas líneas de esta área (paradas_tipos_lineas).
    if v_area is distinct from 'PRUEBAS'
       and exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_turno.area_id
       )
       and not exists (
         select 1 from paradas_tipos_lineas
         where tipo_id = v_tipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa parada no aplica a esta línea.';
    end if;

    if v_tipo.equipo_id is not null then
      select * into v_equipo from paradas_equipos where id = v_tipo.equipo_id;
      if not v_equipo.activo then
        raise exception 'Ese equipo está desactivado.';
      end if;
      if v_area is distinct from 'PRUEBAS'
         and not exists (
           select 1 from paradas_equipos_lineas
           where equipo_id = v_equipo.id and linea_id = v_linea_id
             and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
         ) then
        raise exception 'Esa falla no aplica a esta línea.';
      end if;
      v_nombre := v_equipo.nombre || ' · ' || v_tipo.nombre;
    end if;

    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  -- Sin repetir por descuido: la misma parada (línea, tipo y minutos) cargada hace un momento.
  if exists (
    select 1 from paradas p
    where p.turno_id = p_turno_id and p.linea_id = v_linea_id and p.origen = 'MANUAL'
      and p.tipo_id is not distinct from v_tipo.id and p.tipo_nombre = v_nombre
      and round(extract(epoch from (p.fin - p.inicio)) / 60) = p_minutos
      and p.nota is not distinct from nullif(trim(coalesce(p_nota, '')), '')
      and p.created_at > now() - interval '3 minutes'
  ) then
    raise exception 'Esa parada ya se registró hace un momento.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min,
                       nota, justificacion_desvio, inicio, fin, creado_por)
  values (p_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''),
          case when v_clase = 'PROGRAMADA' then nullif(trim(coalesce(p_justificacion_desvio, '')), '') else null end,
          v_fin - make_interval(mins => p_minutos), v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Registró parada «%s» de %s min en %s (turno %s)', v_nombre, p_minutos,
           (select nombre from lineas where id = v_linea_id), v_turno.codigo),
    null,
    jsonb_build_object('turno_id', p_turno_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'minutos', p_minutos, 'tiempo_guia_min', v_guia, 'nota', p_nota,
                       'justificacion_desvio', p_justificacion_desvio)
  );

  return v_id;
end;
$$;

create or replace function registrar_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_inicio text,
  p_fin text default null,
  p_nota text default null,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_ini timestamptz;
  v_fin timestamptz;
  v_nombre text;
  v_guia numeric;
  v_pres integer;
  v_turno_id uuid;
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_area_id and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if not found or not v_tipo.activo then
    raise exception 'El tipo de parada no existe o está desactivado.';
  end if;
  if v_tipo.clase = 'OCIOSO' then
    raise exception 'El tiempo ocioso no lo registra Mantenimiento.';
  end if;
  -- Programadas y Operacionales las registra el supervisor.
  if v_area is distinct from 'PRUEBAS' and v_tipo.familia in ('PROGRAMADA', 'OPERACIONAL') then
    raise exception 'Esa parada la registra el supervisor.';
  end if;

  begin
    v_ini := (p_inicio::timestamp) at time zone 'America/Caracas';
  exception when others then
    raise exception 'La hora de inicio no es válida.';
  end;
  if v_ini > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if coalesce(trim(p_fin), '') <> '' then
    begin
      v_fin := (p_fin::timestamp) at time zone 'America/Caracas';
    exception when others then
      raise exception 'La hora de fin no es válida.';
    end;
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  end if;
  if coalesce(v_fin, now()) - v_ini > interval '30 days' then
    raise exception 'La parada no puede durar más de 30 días.';
  end if;

  -- Presentación (ml) que corre ahora en esa línea (turno abierto del área); sin corrida no se filtra.
  select tu.id into v_turno_id
  from turnos tu
  where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
  order by tu.fecha desc, tu.hora_inicio desc
  limit 1;
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = v_turno_id and tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  v_nombre := v_tipo.nombre;
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  if v_area is distinct from 'PRUEBAS' then
    if exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_area_id
       )
       and not exists (
         select 1 from paradas_tipos_lineas
         where tipo_id = v_tipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa parada no aplica a esta línea.';
    end if;
  end if;

  if v_tipo.equipo_id is not null then
    select * into v_equipo from paradas_equipos where id = v_tipo.equipo_id;
    if not v_equipo.activo then
      raise exception 'Ese equipo está desactivado.';
    end if;
    if v_area is distinct from 'PRUEBAS'
       and not exists (
         select 1 from paradas_equipos_lineas
         where equipo_id = v_equipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa falla no aplica a esta línea.';
    end if;
    v_nombre := v_equipo.nombre || ' · ' || v_tipo.nombre;
  end if;

  -- Sin repetir: no puede solaparse con otra parada de Mantenimiento en la misma línea (una en curso llega hasta ahora).
  if exists (
    select 1 from paradas p
    where p.linea_id = v_linea_id and p.origen = 'MANTENIMIENTO'
      and p.inicio < coalesce(v_fin, now()) and coalesce(p.fin, now()) > v_ini
  ) then
    raise exception 'Ya hay una parada de Mantenimiento en esa línea en ese horario. Ciérrala o ajusta las horas.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, creado_por)
  values (null, v_linea_id, v_tipo.id, v_tipo.clase, 'MANTENIMIENTO', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''), v_ini, v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Mantenimiento registró la parada «%s» en %s%s', v_nombre,
           (select nombre from lineas where id = v_linea_id), case when v_fin is null then ' (en curso)' else '' end),
    null,
    jsonb_build_object('origen', 'MANTENIMIENTO', 'linea_id', v_linea_id, 'clase', v_tipo.clase, 'tipo', v_nombre,
                       'inicio', p_inicio, 'fin', p_fin, 'nota', p_nota)
  );

  return v_id;
end;
$$;
