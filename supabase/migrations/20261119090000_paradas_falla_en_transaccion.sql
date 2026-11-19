-- Guarda la falla modular en el mismo INSERT de la parada.
-- Una solicitud repetida por pérdida de conexión conserva el resultado original.
create table paradas_operaciones (
  id uuid primary key,
  usuario_id uuid not null,
  funcion text not null,
  datos jsonb not null,
  resultado jsonb
);
alter table paradas_operaciones enable row level security;
revoke all on table paradas_operaciones from public, anon, authenticated;

-- El índice primario hace esperar a un reintento concurrente hasta que el primero termine.
create function reclamar_operacion_parada(p_id uuid, p_usuario_id uuid, p_funcion text, p_datos jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_operacion paradas_operaciones;
begin
  if p_id is null then
    return null;
  end if;

  insert into paradas_operaciones (id, usuario_id, funcion, datos)
  values (p_id, p_usuario_id, p_funcion, p_datos)
  on conflict (id) do nothing;
  if found then
    return null;
  end if;

  select * into strict v_operacion from paradas_operaciones where id = p_id;
  if (v_operacion.usuario_id, v_operacion.funcion, v_operacion.datos)
      is distinct from (p_usuario_id, p_funcion, p_datos) then
    raise exception 'Este identificador ya se usó en otra operación de parada.';
  end if;
  return v_operacion.resultado;
end;
$$;
revoke execute on function reclamar_operacion_parada(uuid, uuid, text, jsonb) from public, anon, authenticated;

create function falla_para_registrar_parada(p_usuario text, p_linea_id uuid, p_tipo_codigo text, p_falla_id uuid)
returns table (nombre text, clase text)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (tiene_permiso(p_usuario, 'PARADAS_REGISTRAR') or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO')) then
    raise exception 'No tienes permiso para registrar paradas.';
  end if;
  if p_tipo_codigo is distinct from 'FALLA_EQUIPO' then
    raise exception 'Una falla modular debe registrarse como falla de equipo.';
  end if;
  if not exists (
    select 1 from lineas l join areas a on a.id = l.area_id
    where l.id = p_linea_id and a.catalogo_modular
  ) then
    raise exception 'El catálogo modular está apagado para el área de la línea.';
  end if;

  return query
  select (f.nombre || ' · ' || u.nombre)::text, f.clase::text
  from catalogo_fallas f
  join catalogo_subsistemas u on u.id = f.subsistema_id and u.activo
  join catalogo_sistemas s on s.id = u.sistema_id and s.activo
  join catalogo_equipos e on e.id = s.equipo_id and e.activo
  where f.id = p_falla_id and f.activo
    and (e.tipo = 'SERVICIOS' or exists (
      select 1 from catalogo_equipos_lineas el where el.equipo_id = e.id and el.linea_id = p_linea_id
    ));
  if not found then
    raise exception 'La falla no está activa o no corresponde a esta línea.';
  end if;
end;
$$;
revoke execute on function falla_para_registrar_parada(text, uuid, text, uuid) from public, anon, authenticated;

drop function abrir_parada_mantenimiento(text, text, text, text, text, text);
create or replace function abrir_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_nota text,
  p_inicio text default null,
  p_responsable text default 'MANTENIMIENTO',
  p_falla_id uuid default null,
  p_operacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repetida jsonb;
  v_clase text;
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_responsable text := coalesce(nullif(btrim(coalesce(p_responsable, '')), ''), 'MANTENIMIENTO');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_c turno_lineas;
  v_corre boolean := false;
  v_id uuid;
begin
  perform exigir_usuario('abrir_parada_mantenimiento', p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    raise exception 'Usuario no válido.';
  end if;
  v_repetida := reclamar_operacion_parada(p_operacion_id, v_usuario_id, 'abrir_parada_mantenimiento',
    jsonb_build_array(p_linea_codigo, p_tipo_codigo, p_nota, p_inicio, p_responsable, p_falla_id));
  if v_repetida is not null then
    return (v_repetida #>> '{}')::uuid;
  end if;
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;

  if v_responsable not in ('OPERACIONAL', 'MANTENIMIENTO', 'POR_DEFINIR') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_nota is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_linea_id, v_area_id);
  v_clase := v_tipo.clase;
  if p_falla_id is not null then
    select nombre, clase into v_nombre, v_clase
    from falla_para_registrar_parada(p_usuario, v_linea_id, p_tipo_codigo, p_falla_id);
  elsif p_operacion_id is not null and p_tipo_codigo = 'FALLA_EQUIPO' then
    raise exception 'Elige la falla del equipo.';
  end if;
  v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if now() - v_inicio > interval '30 days' then
    raise exception 'La parada no puede empezar hace más de 30 días.';
  end if;

  -- La corrida de la línea en el turno abierto del área.
  select tl.* into v_c
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id and t.estado = 'ABIERTO' and t.area_id = v_area_id
  where tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1
  for update of tl;
  -- Sin corrida no hay quién la solape en pantalla: otra parada de la línea en ese
  -- horario (una LNPE «Sin programación», por ejemplo) contaría el mismo tiempo dos veces.
  if v_c.id is null and exists (
    select 1 from paradas p
    where p.linea_id = v_linea_id
      and not p.pendiente
      and p.inicio < now()
      and coalesce(p.fin, now()) > v_inicio
  ) then
    raise exception 'Ya hay una parada en % en ese horario. Termínala o empieza esta después de que acabe.', v_linea_nombre;
  end if;
  -- Corriendo: activa, sin pausa, sin lote terminado, fuera de CIP. Una
  -- parada de antes de que arrancara la corrida no la detiene (como
  -- aplicar_paradas_a_lineas).
  v_corre := v_c.id is not null
    and v_c.pausada_en is null
    and v_c.lote_terminado_en is null
    and v_inicio >= v_c.activada_en
    and coalesce((select condicion from lineas_estado where turno_id = v_c.turno_id and linea_id = v_linea_id), '') <> 'CIP';

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       falla_produccion_id, falla_final_id,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor, sin_corrida)
  values (null, v_linea_id, v_tipo.id, v_clase,
          case when es_de_mantenimiento(p_usuario) then 'MANTENIMIENTO' else 'MANUAL' end,
          v_nombre, v_guia, left(v_nota, 140),
          p_falla_id, case when es_de_mantenimiento(p_usuario) then p_falla_id end,
          v_inicio, null, false, v_usuario_id, v_responsable,
          case when v_c.id is not null
               then coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)) end,
          case when v_c.id is not null then (select s.nombre from sabores s where s.id = v_c.sabor_id) end,
          v_c.id is null)
  returning id into v_id;

  if v_corre then
    -- El trigger pudo haberla puesto en Parada ya (inicio de hace 15 min o más).
    update turno_lineas
    set pausada_en = v_inicio, pausa_motivo = left(v_nota, 140), actualizada_por = v_usuario_id
    where id = v_c.id and pausada_en is null;

    insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
    values (v_c.turno_id, v_linea_id, 'LISTA', v_id, v_usuario_id)
    on conflict (turno_id, linea_id) do update
      set parada_id = excluded.parada_id,
          actualizada_por = excluded.actualizada_por;
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, 'Líneas (Mantenimiento)',
    format('Parada %s «%s» en %s desde las %s%s%s: %s',
           case v_responsable when 'MANTENIMIENTO' then 'de Mantenimiento' when 'POR_DEFINIR' then 'por definir' else 'Operacional' end,
           v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'DD/MM HH24:MI'),
           case when v_corre then ' (pausó la corrida)' else '' end,
           case when v_c.id is null then ' (línea sin corrida)' else '' end, v_nota),
    null,
    jsonb_build_object('falla_id', p_falla_id, 'linea_id', v_linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_nota,
                       'responsable', v_responsable, 'pauso_corrida', v_corre, 'sin_corrida', v_c.id is null)
  );
  if p_operacion_id is not null then
    update paradas_operaciones set resultado = to_jsonb(v_id) where id = p_operacion_id;
  end if;
  return v_id;
end;
$$;
grant execute on function abrir_parada_mantenimiento(text, text, text, text, text, text, uuid, uuid) to anon, authenticated;

drop function pausar_linea(text, uuid, uuid, text, text, text, text);
create or replace function pausar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text,
  p_tipo_codigo text,
  p_responsable text,
  p_inicio text default null,
  p_falla_id uuid default null,
  p_operacion_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repetida jsonb;
  v_clase text;
  v_usuario_id uuid;
  v_c turno_lineas;
  v_linea_nombre text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_parada_id uuid;
begin
  perform exigir_usuario('pausar_linea', p_usuario);
  perform area_de_paradas_mantenimiento(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    raise exception 'Usuario no válido.';
  end if;
  v_repetida := reclamar_operacion_parada(p_operacion_id, v_usuario_id, 'pausar_linea',
    jsonb_build_array(p_turno_id, p_turno_linea_id, p_motivo, p_tipo_codigo, p_responsable, p_inicio, p_falla_id));
  if v_repetida is not null then
    return turno_json(p_turno_id);
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);

  select * into v_c from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null
  for update;
  if not found then
    if p_operacion_id is not null or p_falla_id is not null then
      raise exception 'La corrida ya está en pausa o no sigue activa. Recarga Líneas.';
    end if;
    return turno_json(p_turno_id);
  end if;
  if p_falla_id is not null
     and not exists (select 1 from lineas where id = v_c.linea_id and area_id = area_de_paradas_mantenimiento(p_usuario)) then
    raise exception 'La corrida no corresponde al área del usuario.';
  end if;
  select nombre into v_linea_nombre from lineas where id = v_c.linea_id;

  if coalesce(p_responsable, '') not in ('OPERACIONAL', 'MANTENIMIENTO', 'POR_DEFINIR') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_c.linea_id, (select area_id from lineas where id = v_c.linea_id));
  v_clase := v_tipo.clase;
  if p_falla_id is not null then
    select nombre, clase into v_nombre, v_clase
    from falla_para_registrar_parada(p_usuario, v_c.linea_id, p_tipo_codigo, p_falla_id);
  elsif p_operacion_id is not null and p_tipo_codigo = 'FALLA_EQUIPO' then
    raise exception 'Elige la falla del equipo.';
  end if;
  v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_inicio < v_c.activada_en then
    raise exception 'La parada no puede empezar antes de que arrancara la corrida (%).',
      to_char(v_c.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI');
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       falla_produccion_id, falla_final_id,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor)
  values (null, v_c.linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia, left(v_motivo, 140),
          p_falla_id, case when es_de_mantenimiento(p_usuario) then p_falla_id end,
          v_inicio, null, false, v_usuario_id, p_responsable,
          coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)),
          (select s.nombre from sabores s where s.id = v_c.sabor_id))
  returning id into v_parada_id;

  update turno_lineas
  set pausada_en = v_inicio,
      pausa_motivo = v_motivo,
      actualizada_por = v_usuario_id
  where id = v_c.id;

  insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
  values (p_turno_id, v_c.linea_id, 'LISTA', v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_parada_id::text, 'Líneas (Parada)',
    format('Parada %s «%s» en %s desde las %s: %s',
           case p_responsable when 'MANTENIMIENTO' then 'de Mantenimiento' when 'POR_DEFINIR' then 'por definir' else 'Operacional' end,
           v_nombre, v_linea_nombre, to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'), v_motivo),
    null,
    jsonb_build_object('falla_id', p_falla_id, 'linea_id', v_c.linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_motivo,
                       'responsable', p_responsable, 'turno_linea_id', v_c.id)
  );

  if p_operacion_id is not null then
    update paradas_operaciones set resultado = to_jsonb(v_parada_id) where id = p_operacion_id;
  end if;
  return turno_json(p_turno_id);
end;
$$;
grant execute on function pausar_linea(text, uuid, uuid, text, text, text, text, uuid, uuid) to anon, authenticated;

drop function anotar_parada(text, text, text, text, text, text, text, text);
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
  p_operacion_id uuid default null
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
    jsonb_build_array(p_linea_codigo, p_tipo_codigo, p_inicio, p_fin, p_nota, p_pagina, p_responsable, p_falla_id));
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

    select tu.id into v_turno_id
    from turnos tu
    where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
    order by tu.fecha desc, tu.hora_inicio desc
    limit 1;

    insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       falla_produccion_id, falla_final_id,
                         inicio, fin, pendiente, creado_por, responsable)
    values (v_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia, v_nota,
          p_falla_id, case when es_de_mantenimiento(p_usuario) then p_falla_id end,
            now(), now(), true, v_usuario_id, v_responsable)
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
      format('+1 «%s» en %s (pendiente de minutos)', v_nombre, v_linea_nombre),
      null,
      jsonb_build_object('falla_id', p_falla_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre, 'pendiente', true, 'nota', v_nota)
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

grant execute on function anotar_parada(text, text, text, text, text, text, text, text, uuid, uuid) to anon, authenticated;
