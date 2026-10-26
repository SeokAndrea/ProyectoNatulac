-- ============================================================
-- PARADAS: la parada abierta de una línea (dueña, 2026-10-23)
-- ============================================================
-- Antes, la Parada de Líneas pausaba la corrida y sumaba un +1 «Parada por
-- clasificar» sin minutos; una parada con hora de inicio cargada en
-- Registrar Paradas (o por Mantenimiento) no tocaba la corrida: los
-- paneles mostraban la línea parada y Líneas, corriendo.
--
-- Ahora una línea parada tiene UNA parada abierta (con inicio, sin fin),
-- ligada en lineas_estado.parada_id:
--
--   * pausar_linea(): Líneas pide el tipo (obligatorio), la descripción y,
--     si hace falta, desde qué hora. La parada queda abierta, con turno_id
--     null: a cada turno le tocan los minutos que se solapan con su horario.
--   * continuar_linea(): termina esa parada con la hora de ahora (si es
--     Programada y pasó su tiempo guía, pide la justificación). Si la
--     parada es de Mantenimiento no la cierra: la línea sigue y la parada
--     queda de Mantenimiento.
--   * Una parada abierta de Registrar Paradas, de Mantenimiento o del Sheet
--     que ya lleva 15 min pone la corrida en Parada sola, desde su hora de
--     inicio (aplicar_paradas_a_lineas). Al cerrarse, la línea sigue sola.
--     Si el supervisor le dio Continuar, esa parada ya no la vuelve a parar
--     (paradas.linea_siguio_en). No aplica a Línea No Programada (LNPE).
--   * Detener línea y CIP terminan la parada abierta de la línea.
--   * abrir_turno(): la parada ligada y el motivo de la pausa pasan al
--     turno nuevo (antes se perdían).
--   * paradas_efectivas_turno(): el turno cuenta desde su hora oficial de
--     inicio (T2 a las 15:00 aunque se abra 15:26), sin meterse en el turno
--     anterior; antes contaba desde que alguien lo abría. Entran todas las
--     paradas sin turno (también las de Líneas).
--   * cerrar_parada_mantenimiento(): también termina las de Líneas.
--   * paradas_que_detienen_lineas(): trae los datos de la parada ligada.
-- ============================================================

alter table paradas add column if not exists linea_siguio_en timestamptz;
comment on column paradas.linea_siguio_en is
  'Parada abierta que no detiene la línea: el supervisor le dio Continuar (20261111590000).';

-- ------------------------------------------------------------
-- 1. Ayudantes
-- ------------------------------------------------------------

-- Parada de Mantenimiento: del Sheet o cargada por alguien del área de Mantenimiento.
create or replace function parada_de_mantenimiento(p_parada_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select p.origen = 'SHEET'
        or exists (
          select 1 from usuario_roles ur
          join areas a on a.id = ur.area_id
          where ur.usuario_id = p.creado_por and a.codigo = 'MANTENIMIENTO'
        )
    from paradas p where p.id = p_parada_id
  ), false);
$$;
revoke execute on function parada_de_mantenimiento(uuid) from public, anon, authenticated;

-- Suelta la parada abierta que tiene detenida la línea: la termina ahora
-- (o, si es de Mantenimiento, la deja abierta y marca que la línea siguió).
-- Un +1 sin completar (CIP, «Parada por clasificar») se queda ligado.
create or replace function soltar_parada_de_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_id uuid,
  p_pagina text,
  p_justificacion text default null,
  p_exigir_justificacion boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_le lineas_estado;
  v_p paradas;
  v_min integer;
  v_just text := nullif(btrim(coalesce(p_justificacion, '')), '');
  v_pasada boolean;
begin
  select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = p_linea_id for update;
  if v_le.parada_id is null then
    return;
  end if;
  select * into v_p from paradas where id = v_le.parada_id for update;
  if v_p.pendiente then
    return;
  end if;

  -- Primero se suelta: así cerrar la parada no hace seguir la línea sola (trigger).
  update lineas_estado set parada_id = null where id = v_le.id;
  if v_p.fin is not null then
    return;
  end if;

  if parada_de_mantenimiento(v_p.id) then
    update paradas set linea_siguio_en = now() where id = v_p.id;
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'paradas', v_p.id::text, p_pagina,
      format('La %s siguió; la parada «%s» de Mantenimiento sigue abierta',
             (select nombre from lineas where id = p_linea_id), v_p.tipo_nombre),
      jsonb_build_object('linea_siguio_en', null),
      jsonb_build_object('linea_siguio_en', now())
    );
    return;
  end if;

  v_min := round(extract(epoch from (now() - v_p.inicio)) / 60);
  v_pasada := v_p.clase = 'PROGRAMADA' and v_p.tiempo_guia_min is not null and v_min > v_p.tiempo_guia_min;
  if p_exigir_justificacion and v_pasada and v_just is null then
    raise exception 'La parada duró % min y su tiempo guía es % min. Escribe la justificación.', v_min, round(v_p.tiempo_guia_min);
  end if;

  update paradas
  set fin = now(),
      justificacion_desvio = case when v_pasada then coalesce(v_just, justificacion_desvio) else null end
  where id = v_p.id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', v_p.id::text, p_pagina,
    format('Terminó la parada «%s» de la %s (%s min)', v_p.tipo_nombre, (select nombre from lineas where id = p_linea_id), v_min),
    jsonb_build_object('fin', null),
    jsonb_build_object('fin', now(), 'minutos', v_min, 'justificacion', v_just)
  );
end;
$$;
revoke execute on function soltar_parada_de_linea(text, uuid, uuid, text, text, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. La parada abierta pone la línea en Parada (15 min) y, al cerrarse,
--    la línea sigue sola.
-- ------------------------------------------------------------
create or replace function aplicar_paradas_a_lineas(p_area_codigo text default null, p_linea_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select tl.id as corrida_id, tl.turno_id, tl.linea_id, l.nombre as linea_nombre,
           p.id as parada_id, p.inicio, p.tipo_nombre, coalesce(nullif(btrim(p.nota), ''), p.tipo_nombre) as motivo
    from turno_lineas tl
    join turnos t on t.id = tl.turno_id and t.estado = 'ABIERTO'
    join areas a on a.id = t.area_id
    join lineas l on l.id = tl.linea_id
    left join lineas_estado le on le.turno_id = tl.turno_id and le.linea_id = tl.linea_id
    cross join lateral (
      select pa.*
      from paradas pa
      left join paradas_tipos pt on pt.id = pa.tipo_id
      where pa.linea_id = tl.linea_id
        and pa.fin is null
        and not pa.pendiente
        and pa.linea_siguio_en is null
        and pa.inicio <= now() - interval '15 minutes'
        -- Una parada de antes de que arrancara la corrida no la detiene: la línea arrancó.
        and pa.inicio >= tl.activada_en
        and coalesce(pt.prefijo_planilla, '') <> 'LNPE'
      order by pa.inicio
      limit 1
    ) p
    where tl.activa
      and tl.pausada_en is null
      and tl.lote_terminado_en is null
      and coalesce(le.condicion, '') <> 'CIP'
      and (p_area_codigo is null or a.codigo = p_area_codigo)
      and (p_linea_id is null or tl.linea_id = p_linea_id)
    for update of tl
  loop
    update turno_lineas
    set pausada_en = r.inicio, pausa_motivo = left(r.motivo, 140)
    where id = r.corrida_id and pausada_en is null;

    insert into lineas_estado (turno_id, linea_id, condicion, parada_id)
    values (r.turno_id, r.linea_id, 'LISTA', r.parada_id)
    on conflict (turno_id, linea_id) do update set parada_id = excluded.parada_id;

    perform registrar_auditoria(
      'sistema', 'EDITAR', 'turno_lineas', r.corrida_id::text, 'Paradas (automático)',
      format('La %s quedó en Parada por «%s», abierta desde las %s', r.linea_nombre, r.tipo_nombre,
             to_char(r.inicio at time zone 'America/Caracas', 'HH24:MI')),
      jsonb_build_object('pausada_en', null),
      jsonb_build_object('pausada_en', r.inicio, 'parada_id', r.parada_id)
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
-- La llaman los paneles y Líneas cada minuto (y pg_cron, si está): no hace más que aplicar la regla.
grant execute on function aplicar_paradas_a_lineas(text, uuid) to anon, authenticated;

create or replace function reanudar_lineas_de_parada(p_parada_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_le lineas_estado;
  v_tipo text;
begin
  select tipo_nombre into v_tipo from paradas where id = p_parada_id;
  for v_le in
    select le.*
    from lineas_estado le
    join turnos t on t.id = le.turno_id and t.estado = 'ABIERTO'
    where le.parada_id = p_parada_id and le.condicion <> 'CIP'
  loop
    update lineas_estado set parada_id = null where id = v_le.id;
    update turno_lineas
    set pausada_en = null, pausa_motivo = null
    where turno_id = v_le.turno_id and linea_id = v_le.linea_id and activa and pausada_en is not null;

    perform registrar_auditoria(
      'sistema', 'EDITAR', 'lineas_estado', v_le.id::text, 'Paradas (automático)',
      format('La %s siguió sola: se cerró la parada «%s»', (select nombre from lineas where id = v_le.linea_id), v_tipo),
      jsonb_build_object('parada_id', p_parada_id),
      jsonb_build_object('parada_id', null)
    );
  end loop;
end;
$$;
revoke execute on function reanudar_lineas_de_parada(uuid) from public, anon, authenticated;

create or replace function paradas_mueven_lineas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.fin is null and new.fin is not null then
    perform reanudar_lineas_de_parada(new.id);
  end if;
  -- Las de Líneas (MANUAL) ya pausan la corrida en pausar_linea().
  if new.fin is null and not new.pendiente and new.origen <> 'MANUAL' then
    perform aplicar_paradas_a_lineas(null, new.linea_id);
  end if;
  return null;
end;
$$;

drop trigger if exists paradas_mueven_lineas on paradas;
create trigger paradas_mueven_lineas
after insert or update of fin, inicio, pendiente on paradas
for each row execute function paradas_mueven_lineas();

-- Cada minuto, si la base tiene pg_cron (si no, lo hacen los paneles y Líneas).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('paradas-mueven-lineas', '* * * * *', 'select aplicar_paradas_a_lineas()');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. pausar_linea(): tipo obligatorio, descripción y desde qué hora.
-- ------------------------------------------------------------
drop function if exists pausar_linea(text, uuid, uuid);
drop function if exists pausar_linea(text, uuid, uuid, text);

create or replace function pausar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text,
  p_tipo_codigo text,
  p_inicio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  perform area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null
  for update;
  if not found then
    return turno_json(p_turno_id);  -- ya estaba en pausa o no está activa: no hace nada
  end if;
  select nombre into v_linea_nombre from lineas where id = v_c.linea_id;

  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el tipo de la parada.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige un tipo de parada del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_c.linea_id, (select area_id from lineas where id = v_c.linea_id));
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_inicio < v_c.activada_en then
    raise exception 'La parada no puede empezar antes de que arrancara la corrida (%).',
      to_char(v_c.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI');
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por)
  values (null, v_c.linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_nombre, v_guia, left(v_motivo, 140),
          v_inicio, null, false, v_usuario_id)
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
    format('Parada «%s» en %s desde las %s: %s', v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'), v_motivo),
    null,
    jsonb_build_object('linea_id', v_c.linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_motivo,
                       'turno_linea_id', v_c.id)
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function pausar_linea(text, uuid, uuid, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. continuar_linea(): termina la parada de la línea.
-- ------------------------------------------------------------
drop function if exists continuar_linea(text, uuid, uuid);

create or replace function continuar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_justificacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_le lineas_estado;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa for update;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en Registrar Paradas antes de continuar.';
    end if;

    perform soltar_parada_de_linea(p_usuario, p_turno_id, v_c.linea_id, 'Líneas (Continuar)', p_justificacion, true);
    -- Las demás paradas abiertas de la línea (de Mantenimiento) ya no la vuelven a poner en Parada.
    update paradas
    set linea_siguio_en = now()
    where linea_id = v_c.linea_id and fin is null and not pendiente and linea_siguio_en is null;
  end if;

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_c.id is not null and v_c.pausada_en is not null then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'turno_lineas', v_c.id::text, 'Líneas',
      format('Continuó la %s', (select nombre from lineas where id = v_c.linea_id)),
      jsonb_build_object('pausada_en', v_c.pausada_en),
      jsonb_build_object('pausada_en', null)
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;
grant execute on function continuar_linea(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Detener línea y CIP: terminan la parada abierta de la línea.
--    Copias de 20261111090000 + soltar_parada_de_linea().
-- ------------------------------------------------------------
create or replace function detener_linea_por_falla(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select linea_id into v_linea_id
  from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_linea_id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  -- La parada abierta de la línea termina aquí (20261111590000).
  perform soltar_parada_de_linea(p_usuario, p_turno_id, v_linea_id, 'Líneas (Detener)');

  -- Para la corrida (queda ESPERANDO_PT). El tanque no se toca.
  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id;

  -- Y en la MISMA transacción, deja la línea en Detenida con el motivo.
  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, 'DETENIDA', now(), v_motivo, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'DETENIDA',
        activada_en = excluded.activada_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  -- El motivo queda en Auditoría: la línea se limpia sola al cargar el PT.
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno_lineas', p_turno_linea_id::text, 'Líneas',
    format('Detuvo %s%s', coalesce((select nombre from lineas where id = v_linea_id), '?'), coalesce(' · ' || v_motivo, '')),
    jsonb_build_object('activa', true),
    jsonb_build_object('activa', false, 'motivo', v_motivo)
  );

  return turno_json(p_turno_id);
end;
$$;


create or replace function poner_linea_en_cip(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_motivo text,
  p_descripcion text default null,
  p_turno_linea_id uuid default null,
  p_lote_sigue boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo text;
  v_etiqueta text;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_c turno_lineas;
  v_parada_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  v_tipo := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'FALLA_SUMINISTRO_ELECTRICO'
    when 'HORAS_36' then 'LIMPIEZA_INTERMEDIA'
    when 'FALLA_MECANICA' then 'FALLA_SIN_ESPECIFICAR'
  end;
  v_etiqueta := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'Falla en Suministro Eléctrico'
    when 'HORAS_36' then '36 h de trabajo'
    when 'FALLA_MECANICA' then 'Falla mecánica prolongada'
  end;
  if v_tipo is null then
    raise exception 'Elige el motivo del CIP.';
  end if;

  if p_turno_linea_id is not null then
    select * into v_c from turno_lineas
    where id = p_turno_linea_id and turno_id = p_turno_id and linea_id = v_linea_id and activa
    for update;
    if not found then
      raise exception 'Esa corrida no está activa.';
    end if;
    if p_lote_sigue is null then
      raise exception 'Indica si el lote sigue después del CIP.';
    end if;
  else
    if exists (select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_linea_id and activa) then
      raise exception '% tiene una corrida activa: ponla en CIP desde esa corrida.', coalesce(v_linea_nombre, 'La línea');
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and linea_id = v_linea_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida en % sin su Producto Terminado. Continúa el lote o carga su PT antes de ponerla en CIP.',
        coalesce(v_linea_nombre, 'la línea');
    end if;
  end if;

  -- La parada abierta de la línea termina aquí: sigue el CIP (20261111590000).
  perform soltar_parada_de_linea(p_usuario, p_turno_id, v_linea_id, 'Líneas (CIP)');

  -- El +1: si ya hay uno igual sin completar en la línea, el CIP usa ese mismo.
  select p.id into v_parada_id
  from paradas p
  join paradas_tipos pt on pt.id = p.tipo_id
  where p.linea_id = v_linea_id and pt.codigo = v_tipo and p.pendiente
  order by p.inicio desc
  limit 1;
  if v_parada_id is null then
    v_parada_id := anotar_parada(p_usuario, p_linea_codigo, v_tipo, null, null, v_desc, 'Líneas (CIP)');
  end if;

  if p_turno_linea_id is not null then
    if p_lote_sigue then
      -- El lote sigue: la corrida queda en pausa (sigue activa, sin PT).
      update turno_lineas
      set pausada_en = coalesce(pausada_en, now()), pausa_motivo = 'CIP', actualizada_por = v_usuario_id
      where id = v_c.id;
    else
      -- El lote termina aquí: Esperando PT, como con Detener línea.
      update turno_lineas
      set activa = false, pausada_en = null, actualizada_por = v_usuario_id
      where id = v_c.id;
    end if;
  end if;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, parada_id, actualizada_por)
  values (p_turno_id, v_linea_id, 'CIP', now(), now(), null, left(v_etiqueta || coalesce(' · ' || v_desc, ''), 140), v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'CIP',
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = null,
        observacion = excluded.observacion,
        parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;


-- ------------------------------------------------------------
-- 6. abrir_turno(): la parada ligada y el motivo de la pausa pasan al
--    turno nuevo. Copia de 20261108090000 + pausa_motivo y parada_id.
-- ------------------------------------------------------------
-- Última versión: 20261108090000_relevo_temprano_pasa_al_turno_siguiente.sql
create or replace function abrir_turno(
  p_supervisor_id uuid,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_automatico boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid := p_supervisor_id;
  v_area_id uuid;
  v_esquema text;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_abierto_id uuid;
  v_i integer;
  v_hora_inicio_nominal time;
  v_hora_fin_nominal time;
  v_ahora_planta timestamp := now() at time zone 'America/Caracas';
  v_fecha date := v_ahora_planta::date;
  v_hora_inicio time := v_ahora_planta::time;
begin
  select id, esquema_turnos into v_area_id, v_esquema from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  select id, hora_inicio, hora_fin
    into v_turno_tipo_id, v_hora_inicio_nominal, v_hora_fin_nominal
  from turno_tipos where codigo = p_turno_tipo_codigo;
  if v_turno_tipo_id is null or v_hora_inicio_nominal is null then
    raise exception 'Turno % no válido. El 12x12 se trabaja como turnos 1, 2 y 3 con relevo.', p_turno_tipo_codigo;
  end if;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;
  if v_grupo_id is null then
    raise exception 'Grupo % no existe', p_grupo_codigo;
  end if;

  -- Turno que cruza medianoche + activado en la cola de la madrugada
  -- => la fecha operativa es la del día anterior.
  if v_hora_fin_nominal < v_hora_inicio_nominal and v_hora_inicio < v_hora_fin_nominal then
    v_fecha := v_fecha - 1;
  end if;

  v_codigo := left(p_area_codigo, 1) || to_char(v_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '');
  if not p_automatico then
    v_codigo := v_codigo || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');
  end if;
  v_codigo := codigo_turno_libre(v_codigo);

  insert into turnos (
    codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, esquema, apertura_automatica, grupo_pendiente
  )
  values (
    v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, v_fecha, v_hora_inicio, v_esquema, p_automatico, p_automatico
  )
  returning id into v_turno_id;

  if v_supervisor_id is distinct from usuario_sistema_id() then
    insert into turno_responsables (turno_id, usuario_id, motivo) values (v_turno_id, v_supervisor_id, 'INICIO');
  end if;

  -- De dónde se heredan tanques y líneas: el abierto más reciente; si no
  -- hay, el último creado. No por (fecha, hora_inicio): un T3 iniciado
  -- después de medianoche queda detrás del de las 22:30 de su misma fecha.
  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by (t2.estado = 'ABIERTO') desc, t2.created_at desc
  limit 1;

  -- Relevo sin finalizar: todo turno del área que siga ABIERTO se cierra
  -- solo. Antes, sus corridas activas se ENTREGAN (no se sellan): la línea
  -- sigue corriendo en la planta y el turno nuevo la hereda.
  for v_abierto_id in
    select id from turnos
    where area_id = v_area_id and id <> v_turno_id and estado = 'ABIERTO'
  loop
    perform entregar_corridas_automatico(v_abierto_id);
    update turno_responsables set hasta = now() where turno_id = v_abierto_id and hasta is null;
    perform cerrar_turno_forzado(v_abierto_id, v_ahora_planta);
  end loop;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
      pausada_en, pausa_motivo, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por, actualizada_por,
      pausada_en, pausa_motivo, lote_terminado_en
    from turno_lineas
    where turno_id = v_turno_anterior_id and activa;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;

    -- La parada que tiene detenida la línea pasa con ella (20261111590000).
    insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, parada_id, actualizada_por)
    select v_turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, parada_id, actualizada_por
    from lineas_estado
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'LIMPIO');
    end loop;

    insert into lineas_estado (turno_id, linea_id)
    select v_turno_id, id from lineas where area_id = v_area_id and activo;
  end if;

  -- Área de Pruebas: sin ceremonia (ver 20261055).
  if p_area_codigo = 'PRUEBAS' then
    update recepcion_tanques
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and confirmado_inicio_en is null;

    update turno_lineas
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and activa and confirmado_inicio_en is null;
  end if;

  return v_turno_id;
end;
$$;

-- ------------------------------------------------------------
-- 7. paradas_efectivas_turno(): desde la hora oficial del turno.
-- ------------------------------------------------------------
-- Desde: la hora oficial de inicio (fecha + hora del tipo de turno), pero no
-- antes de que cerrara el turno anterior del área (12x12: el T2 de la noche
-- empieza cuando cerró el del día) y nunca después de que se abrió (relevo
-- temprano). Antes era la hora en que se abrió.
-- Entran todas las paradas sin turno, no solo las de Mantenimiento y el
-- Sheet: las de Líneas también quedan abiertas con turno_id null.
create or replace function paradas_efectivas_turno(p_turno_id uuid)
returns table (
  id uuid,
  linea_id uuid,
  clase text,
  origen text,
  tipo_id uuid,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio timestamptz,
  fin timestamptz,
  creado_por uuid
)
language sql
security definer
set search_path = public
stable
as $$
  with t as (
    select tu.id, tu.area_id, tu.estado,
           least(
             tu.created_at,
             greatest(
               ((tu.fecha + tt.hora_inicio) at time zone 'America/Caracas'),
               (select case
                         when an.estado = 'CERRADO' and an.fecha_fin is not null and an.hora_fin is not null
                           then ((an.fecha_fin + an.hora_fin) at time zone 'America/Caracas')
                         else tu.created_at
                       end
                from turnos an
                where an.area_id = tu.area_id and an.created_at < tu.created_at
                order by an.created_at desc
                limit 1)
             )
           ) as desde,
           case
             when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
               then ((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas')
             else now()
           end as hasta
    from turnos tu
    join turno_tipos tt on tt.id = tu.turno_tipo_id
    where tu.id = p_turno_id
  )
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio, p.inicio, p.fin, p.creado_por
  from paradas p
  where p.turno_id = p_turno_id
  union all
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio,
         greatest(p.inicio, t.desde),
         case
           when t.estado = 'ABIERTO' then (case when p.fin is null then null else least(p.fin, t.hasta) end)
           else least(coalesce(p.fin, t.hasta), t.hasta)
         end,
         p.creado_por
  from t
  join lineas l on l.area_id = t.area_id
  join paradas p on p.linea_id = l.id
                and p.turno_id is null
                and p.inicio < t.hasta
                and coalesce(p.fin, t.hasta) > t.desde;
$$;

-- ------------------------------------------------------------
-- 8. cerrar_parada_mantenimiento(): también las abiertas de Líneas.
--    Copia de 20261070090000 + origen MANUAL.
-- ------------------------------------------------------------
create or replace function cerrar_parada_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_fin text default null,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
  v_fin timestamptz;
begin
  select * into v_p from paradas
  where id = p_parada_id and origen in ('MANTENIMIENTO', 'MANUAL') and not pendiente;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.fin is not null then
    raise exception 'La parada ya estaba cerrada.';
  end if;

  if coalesce(trim(p_fin), '') = '' then
    v_fin := now();
  else
    begin
      v_fin := (p_fin::timestamp) at time zone 'America/Caracas';
    exception when others then
      raise exception 'La hora de fin no es válida.';
    end;
  end if;
  if v_fin < v_p.inicio then
    raise exception 'El fin no puede ser anterior al inicio.';
  end if;
  if v_fin > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;

  -- Si tiene detenida una línea, la línea sigue sola (trigger paradas_mueven_lineas).
  update paradas set fin = v_fin where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Cerró la parada «%s» (%s min)', v_p.tipo_nombre,
           round(extract(epoch from (v_fin - v_p.inicio)) / 60)),
    jsonb_build_object('fin', null),
    jsonb_build_object('fin', v_fin)
  );
end;
$$;

-- ------------------------------------------------------------
-- 9. paradas_que_detienen_lineas(): con los datos de la parada.
-- ------------------------------------------------------------
drop function if exists paradas_que_detienen_lineas(uuid);

create function paradas_que_detienen_lineas(p_turno_id uuid)
returns table (
  linea_codigo text,
  parada_id uuid,
  pendiente boolean,
  tipo_nombre text,
  clase text,
  tiempo_guia_min numeric,
  nota text,
  inicio text,
  fin text,
  de_mantenimiento boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select l.codigo, p.id, p.pendiente, p.tipo_nombre, p.clase, p.tiempo_guia_min, p.nota,
         to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         parada_de_mantenimiento(p.id)
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join paradas p on p.id = le.parada_id
  where le.turno_id = p_turno_id;
$$;
grant execute on function paradas_que_detienen_lineas(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 10. Las líneas que ya tienen una parada abierta de 15 min o más quedan
--     en Parada ahora mismo (lo de hoy: Línea 2 desde las 15:00).
-- ------------------------------------------------------------
select aplicar_paradas_a_lineas();

select * from asegurar_control_usuario();
