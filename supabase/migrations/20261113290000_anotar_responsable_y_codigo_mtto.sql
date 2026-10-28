-- ============================================================
-- PARADAS: Anotar con Responsable y Mantenimiento pone el código
-- (dueña, 2026-10-28)
-- ============================================================
--   1. anotar_parada() gana p_responsable (OPERACIONAL | MANTENIMIENTO). Sin
--      él, como antes: lo decide quién la registra. Mantenimiento también
--      anota desde el Modo Paradas.
--   2. clasificar_falla_mantenimiento(): «1 falla espera el código de
--      Mantenimiento» no tenía dónde hacerse (Terminar parada solo sirve con
--      la parada abierta). Mantenimiento le pone a una falla ya cerrada sin
--      código (Falla sin especificar / por clasificar) el equipo y la falla de
--      Producción, su equipo y subsistema, qué se hizo y el tiempo de
--      reparación. Las horas no se tocan.
-- ============================================================

-- ------------------------------------------------------------
-- 1. anotar_parada(): copia de 20261112890000 + p_responsable
-- ------------------------------------------------------------
drop function if exists anotar_parada(text, text, text, text, text, text, text);

create or replace function anotar_parada(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_inicio text default null,
  p_fin text default null,
  p_nota text default null,
  p_pagina text default 'Registrar Paradas',
  p_responsable text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_id uuid;
  -- Quién la registra decide de quién es (20261112150000), no si trae horas.
  v_origen text := case when es_de_mantenimiento(lower(p_usuario)) then 'MANTENIMIENTO' else 'MANUAL' end;
  -- Responsable elegido en Anotar (20261113290000); sin él, lo decide quién la registra (trigger).
  v_responsable text := nullif(btrim(coalesce(p_responsable, '')), '');
begin
  if v_responsable is not null and v_responsable not in ('OPERACIONAL', 'MANTENIMIENTO') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
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
  v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_ini := hora_planta_a_timestamptz(p_inicio, 'inicio');
  v_fin := hora_planta_a_timestamptz(p_fin, 'fin');

  if v_ini is null then
    -- +1 pendiente. No se acepta otro igual sin completar en la línea.
    if exists (
      select 1 from paradas
      where linea_id = v_linea_id and tipo_id is not distinct from v_tipo.id and clase = v_clase and pendiente
    ) then
      raise exception 'Ya hay una parada «%» sin completar en %. Pon cuánto duró antes de sumar otra.', v_nombre, v_linea_nombre;
    end if;

    select tu.id into v_turno_id
    from turnos tu
    where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
    order by tu.fecha desc, tu.hora_inicio desc
    limit 1;

    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                         inicio, fin, pendiente, creado_por, responsable)
    values (v_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia, v_nota,
            now(), now(), true, v_usuario_id, v_responsable)
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
      format('+1 «%s» en %s (pendiente de minutos)', v_nombre, v_linea_nombre),
      null,
      jsonb_build_object('linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre, 'pendiente', true, 'nota', v_nota)
    );
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
                       inicio, fin, creado_por, responsable)
  values (null, v_linea_id, v_tipo.id, v_clase, v_origen, v_nombre, v_guia, v_nota,
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
    jsonb_build_object('linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'inicio', p_inicio, 'fin', p_fin, 'nota', v_nota)
  );
  return v_id;
end;
$$;

grant execute on function anotar_parada(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Mantenimiento pone el código a una falla cerrada sin código
-- ------------------------------------------------------------
create or replace function clasificar_falla_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_mtto_equipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_reparacion_min integer default null,
  p_pagina text default 'Líneas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  v_usuario_id uuid;
  v_p paradas;
  v_antes text;
  v_tipo paradas_tipos;
  v_nombre text;
  v_mtto_eq mtto_equipos;
  v_sub text := nullif(btrim(coalesce(p_subsistema_codigo, '')), '');
  v_sub_nombre text;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
begin
  if not es_de_mantenimiento(p_usuario) and not coalesce(es_dueno(p_usuario), false) then
    raise exception 'El código de la falla lo pone Mantenimiento.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  select codigo into v_antes from paradas_tipos where id = v_p.tipo_id;
  if coalesce(v_antes, '') not in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR') then
    raise exception 'Esa parada ya tiene su código.';
  end if;
  if v_p.pendiente then
    raise exception 'Primero hay que poner cuánto duró (está como +1).';
  end if;
  if v_p.fin is null then
    raise exception 'La parada sigue abierta: usa Terminar parada.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
  if v_tipo.id is null or v_tipo.codigo in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  select * into v_mtto_eq from mtto_equipos where codigo = upper(nullif(btrim(coalesce(p_mtto_equipo_codigo, '')), '')) and activo;
  if v_mtto_eq.codigo is null then
    raise exception 'Elige el equipo de Mantenimiento.';
  end if;
  if v_sub is null then
    raise exception 'Elige el subsistema (o «Sin subsistema»).';
  end if;
  if v_sub = 'SIN_SUBSISTEMA' then
    v_sub_nombre := 'Sin subsistema';
  else
    select nombre into v_sub_nombre from mtto_subsistemas where equipo_codigo = v_mtto_eq.codigo and codigo = v_sub and activo;
    if v_sub_nombre is null then
      raise exception 'Elige el subsistema de la lista.';
    end if;
  end if;
  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la falla.';
  end if;
  if p_reparacion_min is not null and p_reparacion_min not between 1 and 43200 then
    raise exception 'El tiempo de reparación va en minutos (1 o más).';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      mtto_equipo_codigo = v_mtto_eq.codigo,
      mtto_equipo_nombre = v_mtto_eq.nombre,
      subsistema_codigo = left(v_sub, 40),
      subsistema_nombre = v_sub_nombre,
      solucion = left(v_solucion, 300),
      reparacion_min = p_reparacion_min,
      terminada_por = coalesce(terminada_por, v_usuario_id)
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Puso el código a la falla de la %s: «%s» (%s · %s): %s',
           (select nombre from lineas where id = v_p.linea_id), v_nombre, v_mtto_eq.nombre, v_sub_nombre, v_solucion),
    jsonb_build_object('tipo', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_nombre, 'mtto_equipo', v_mtto_eq.codigo, 'subsistema', v_sub,
                       'solucion', v_solucion, 'reparacion_min', p_reparacion_min)
  );
end;
$$;
grant execute on function clasificar_falla_mantenimiento(text, uuid, text, text, text, text, integer, text) to anon, authenticated;
