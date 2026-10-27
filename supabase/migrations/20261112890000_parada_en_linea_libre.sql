-- ============================================================
-- PARADAS: parada abierta en una línea sin corrida (dueña, 2026-10-27)
-- ============================================================
-- La Línea 3 está programada pero no puede arrancar (lleva casi una semana):
-- no había cómo dejar la parada abierta porque Parar exigía una corrida en
-- marcha. Ahora cualquiera que registre paradas la abre con su hora de
-- inicio (la de verdad, aunque sea de días atrás) y sin fin:
--
--   * abrir_parada_mantenimiento(): suma p_responsable (por defecto
--     MANTENIMIENTO, como antes). Operacional la abre el supervisor.
--   * paradas.sin_corrida: la parada se abrió con la línea sin corrida.
--   * Al arrancar la línea (turno_lineas nueva) se cierra sola la Operacional
--     abierta sin corrida, con fin = la hora de arranque. La de Mantenimiento
--     no: la termina Mantenimiento.
-- Los turnos por los que pasa la parada cuentan los minutos que se solapan con
-- su horario (turno_id null, como las demás abiertas).
-- ============================================================

alter table paradas add column if not exists sin_corrida boolean not null default false;
comment on column paradas.sin_corrida is
  'Parada abierta con la línea sin corrida (20261112890000): al arrancar la línea, la Operacional se cierra sola.';

drop function if exists abrir_parada_mantenimiento(text, text, text, text, text);

create or replace function abrir_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_nota text,
  p_inicio text default null,
  p_responsable text default 'MANTENIMIENTO'
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
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;

  if v_responsable not in ('OPERACIONAL', 'MANTENIMIENTO') then
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
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

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
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor, sin_corrida)
  values (null, v_linea_id, v_tipo.id, v_tipo.clase,
          case when es_de_mantenimiento(p_usuario) then 'MANTENIMIENTO' else 'MANUAL' end,
          v_nombre, v_guia, left(v_nota, 140), v_inicio, null, false, v_usuario_id, v_responsable,
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
           case when v_responsable = 'MANTENIMIENTO' then 'de Mantenimiento' else 'Operacional' end,
           v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'DD/MM HH24:MI'),
           case when v_corre then ' (pausó la corrida)' else '' end,
           case when v_c.id is null then ' (línea sin corrida)' else '' end, v_nota),
    null,
    jsonb_build_object('linea_id', v_linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_nota,
                       'responsable', v_responsable, 'pauso_corrida', v_corre, 'sin_corrida', v_c.id is null)
  );
  return v_id;
end;
$$;
grant execute on function abrir_parada_mantenimiento(text, text, text, text, text, text) to anon, authenticated;

-- Al arrancar la línea, la parada Operacional abierta sin corrida termina ahí.
-- Solo las que empezaron antes del arranque: una corrida heredada al abrir el
-- turno (con su hora de arranque vieja) no toca las de después.
create or replace function cerrar_paradas_sin_corrida_al_arrancar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_fin timestamptz := least(new.activada_en, now());
begin
  if not new.activa then
    return null;
  end if;
  for r in
    select p.id, p.tipo_nombre, p.inicio
    from paradas p
    where p.linea_id = new.linea_id
      and p.fin is null
      and not p.pendiente
      and p.sin_corrida
      and p.responsable = 'OPERACIONAL'
      and p.inicio <= v_fin
    for update
  loop
    update paradas set fin = v_fin where id = r.id;
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'paradas', r.id::text, 'Paradas (automático)',
      format('Terminó sola la parada «%s» de la %s: la línea arrancó', r.tipo_nombre,
             (select nombre from lineas where id = new.linea_id)),
      jsonb_build_object('fin', null),
      jsonb_build_object('fin', v_fin, 'minutos', round(extract(epoch from (v_fin - r.inicio)) / 60))
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists cerrar_paradas_sin_corrida_al_arrancar on turno_lineas;
create trigger cerrar_paradas_sin_corrida_al_arrancar
after insert on turno_lineas
for each row execute function cerrar_paradas_sin_corrida_al_arrancar();

-- anotar_parada(): copia de 20261112150000; el chequeo de solapes cuenta también la parada abierta
-- de una línea sin corrida (así «Sin programación» o «Turno completo» no suman el mismo tiempo dos veces).
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
      and (p.origen = 'MANTENIMIENTO'
           or (p.origen = 'MANUAL' and p.turno_id is null and p.fin is not null and not p.pendiente)
           -- La abierta de una línea sin corrida (20261112890000) ocupa el tiempo hasta que se termine.
           or (p.sin_corrida and p.fin is null and not p.pendiente))
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
