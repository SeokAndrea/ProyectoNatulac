-- ============================================================
-- PARADAS: de quién es la parada lo decide quién la registra
-- ============================================================
-- Dueña, 2026-10-26: una parada que anota Producción salía «de
-- Mantenimiento». anotar_parada() guardaba origen = 'MANTENIMIENTO' a
-- toda parada con horas (lo que antes solo hacía Mantenimiento), y el panel
-- de «Anotar» / «Cubrir» de Líneas siempre manda horas. Los paneles, el
-- detalle y Validar jornada la mostraban como de Mantenimiento.
--
--   * es_de_mantenimiento(): el usuario tiene el rol o el área Mantenimiento.
--   * anotar_parada(): copia de 20261110590000 con el origen según quién la
--     registra; el chequeo de solapes mira todas las cargadas con horas.
--   * Datos: las ya guardadas como MANTENIMIENTO por alguien que no es de
--     Mantenimiento pasan a MANUAL. Solo cambia esa marca, no las horas ni
--     los minutos. Queda en Auditoría cuántas.
-- ============================================================

create or replace function es_de_mantenimiento(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from usuarios u
    join usuario_roles ur on ur.usuario_id = u.id
    left join roles r on r.id = ur.rol_id
    left join areas a on a.id = ur.area_id
    where u.usuario = lower(p_usuario)
      and (r.codigo = 'MANTENIMIENTO' or a.codigo = 'MANTENIMIENTO')
  );
$$;
revoke execute on function es_de_mantenimiento(text) from public, anon, authenticated;

create or replace function anotar_parada(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_inicio text default null,
  p_fin text default null,
  p_nota text default null,
  p_pagina text default 'Registrar Paradas'
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
begin
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
                         inicio, fin, pendiente, creado_por)
    values (v_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia, v_nota,
            now(), now(), true, v_usuario_id)
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
      and (p.origen = 'MANTENIMIENTO' or (p.origen = 'MANUAL' and p.turno_id is null and p.fin is not null and not p.pendiente))
      and p.inicio < coalesce(v_fin, now()) and coalesce(p.fin, now()) > v_ini
  ) then
    raise exception 'Ya hay una parada con horas en esa línea en ese horario. Termínala o ajusta las horas.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, creado_por)
  values (null, v_linea_id, v_tipo.id, v_clase, v_origen, v_nombre, v_guia, v_nota,
          v_ini, v_fin, v_usuario_id)
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

grant execute on function anotar_parada(text, text, text, text, text, text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- Datos: las de Producción que quedaron marcadas como de Mantenimiento.
-- ------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  update paradas p
  set origen = 'MANUAL'
  from usuarios u
  where p.origen = 'MANTENIMIENTO'
    and u.id = p.creado_por
    and not es_de_mantenimiento(u.usuario);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'paradas', 'origen', 'Migración 20261112150000',
      format('%s paradas de Producción dejaron de figurar como de Mantenimiento', v_n),
      null,
      jsonb_build_object('paradas', v_n)
    );
  end if;
end;
$$;
