-- ============================================================
-- PARADAS: una sola pantalla para todos, con +1 pendiente
-- ============================================================
-- plan-lineas-pt-paradas.md, sección P (dueño, 2026-09-30).
--
--   * Se registra desde una sola pantalla (la que era "Paradas de
--     Mantenimiento"), todo el mundo y con todos los tipos. Se quita la
--     regla "esa parada la registra el supervisor / Mantenimiento".
--   * Una parada entra como +1 PENDIENTE (sin minutos) y después alguien
--     pone cuánto duró. Así no se asume que cada Cambio de Lote duró su
--     tiempo guía. Si se conocen la hora de inicio y fin, se ponen y queda
--     completa (o en curso, sin fin), como hacía Mantenimiento.
--   * Una pendiente se guarda con inicio = fin = hora del +1: todos los
--     reportes que ya existen la cuentan como 1 vez y 0 min sin tocarlos.
--     No se usa fin NULL porque eso significa "en curso" y los reportes le
--     suman minutos hasta ahora.
--   * La misma parada puede repetirse (cuenta la frecuencia), pero no se
--     acepta un +1 si ya hay otro pendiente igual (línea y tipo): primero
--     se completa el anterior. La app pregunta "¿cuánto tardó?" antes.
--   * Tipo nuevo "Falla sin especificar": +1 sin código; al completarlo hay
--     que elegir la falla de equipo.
--   * El tiempo ocioso se sigue anotando como texto libre (sin tipo del
--     catálogo, detalle obligatorio), igual que en registrar_parada.
--   * finalizar_turno() no deja cerrar el turno con paradas pendientes.
--
-- Funciones nuevas: anotar_parada, completar_parada, eliminar_parada.
-- Cambian: area_de_paradas_mantenimiento (permiso para todos los que
-- registran paradas), listar_paradas (devuelve "pendiente"), finalizar_turno.
-- registrar_parada (supervisor, por minutos) y registrar_parada_mantenimiento
-- se dejan como estaban para que la app vieja siga funcionando hasta que se
-- recargue; la app nueva ya no las usa.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Parada pendiente
-- ------------------------------------------------------------
alter table paradas add column pendiente boolean not null default false;

create index paradas_pendientes_idx on paradas (turno_id) where pendiente;

-- ------------------------------------------------------------
-- 2. Tipo "Falla sin especificar". Sin código de planilla: se reemplaza
--    por la falla de equipo real al completarla.
-- ------------------------------------------------------------
insert into paradas_tipos (codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, secuencia_planilla, orden, codigo_con_linea)
values ('FALLA_SIN_ESPECIFICAR', 'Falla sin especificar', 'NO_PROGRAMADA', 'EQUIPO', null, '', null, 900, false)
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 3. Quién registra: cualquiera con PARADAS_REGISTRAR o
--    PARADAS_MANTENIMIENTO (además del área de Mantenimiento, Pruebas y el
--    SUPERADMINISTRADOR, como antes). Devuelve el área donde se registra:
--    PRUEBAS si quien usa es de Pruebas; si no, ASEPTICO.
--    Lo usan también cerrar_parada_mantenimiento y
--    eliminar_parada_mantenimiento (terminar una parada en curso).
-- ------------------------------------------------------------
create or replace function area_de_paradas_mantenimiento(p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not (
    v_area in ('MANTENIMIENTO', 'PRUEBAS')
    or v_rol = 'SUPERADMINISTRADOR'
    or tiene_permiso(p_usuario, 'PARADAS_REGISTRAR')
    or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO')
  ) then
    raise exception 'No tienes permiso para registrar paradas.';
  end if;
  select a.id into v_area_id from areas a where a.codigo = case when v_area = 'PRUEBAS' then 'PRUEBAS' else 'ASEPTICO' end;
  return v_area_id;
end;
$$;

-- ------------------------------------------------------------
-- 4. Ayudantes internos (no se llaman desde la app).
-- ------------------------------------------------------------

-- Línea del área por su número (LINEA_1 / LINEA_T1 → "1").
create or replace function linea_de_paradas(p_area_id uuid, p_linea_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_linea_id uuid;
begin
  select l.id into v_linea_id
  from lineas l
  where l.area_id = p_area_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '')
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;
  return v_linea_id;
end;
$$;

-- Comprueba que el tipo existe, está activo y aplica a esa línea (y a la
-- presentación que corre ahora, si hay corrida). Devuelve el nombre que se
-- muestra: "Equipo · Falla" para las fallas de equipo.
create or replace function nombre_tipo_en_linea(p_tipo paradas_tipos, p_linea_id uuid, p_area_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_area text;
  v_turno_id uuid;
  v_pres integer;
  v_equipo paradas_equipos;
begin
  if p_tipo.id is null or not p_tipo.activo then
    raise exception 'El tipo de parada no existe o está desactivado.';
  end if;

  select codigo into v_area from areas where id = p_area_id;
  if v_area = 'PRUEBAS' then
    -- El Área de Pruebas registra todo, sin filtrar por línea ni presentación.
    if p_tipo.equipo_id is not null then
      select * into v_equipo from paradas_equipos where id = p_tipo.equipo_id;
      return v_equipo.nombre || ' · ' || p_tipo.nombre;
    end if;
    return p_tipo.nombre;
  end if;

  -- Presentación (ml) que corre ahora en esa línea; sin corrida no se filtra.
  select tu.id into v_turno_id
  from turnos tu
  where tu.area_id = p_area_id and tu.estado = 'ABIERTO'
  order by tu.fecha desc, tu.hora_inicio desc
  limit 1;
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = v_turno_id and tl.linea_id = p_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  if exists (
       select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
       where tl.tipo_id = p_tipo.id and l2.area_id = p_area_id
     )
     and not exists (
       select 1 from paradas_tipos_lineas
       where tipo_id = p_tipo.id and linea_id = p_linea_id
         and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
     ) then
    raise exception 'Esa parada no aplica a esta línea.';
  end if;

  if p_tipo.equipo_id is not null then
    select * into v_equipo from paradas_equipos where id = p_tipo.equipo_id;
    if not v_equipo.activo then
      raise exception 'Ese equipo está desactivado.';
    end if;
    if not exists (
      select 1 from paradas_equipos_lineas
      where equipo_id = v_equipo.id and linea_id = p_linea_id
        and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
    ) then
      raise exception 'Esa falla no aplica a esta línea.';
    end if;
    return v_equipo.nombre || ' · ' || p_tipo.nombre;
  end if;

  return p_tipo.nombre;
end;
$$;

revoke execute on function linea_de_paradas(uuid, text) from public, anon, authenticated;
revoke execute on function nombre_tipo_en_linea(paradas_tipos, uuid, uuid) from public, anon, authenticated;

-- 'YYYY-MM-DDTHH:MM[:SS]' de planta → timestamptz. null si viene vacío.
create or replace function hora_planta_a_timestamptz(p_texto text, p_campo text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce(trim(p_texto), '') = '' then
    return null;
  end if;
  return (p_texto::timestamp) at time zone 'America/Caracas';
exception when others then
  raise exception 'La hora de % no es válida.', p_campo;
end;
$$;

revoke execute on function hora_planta_a_timestamptz(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. anotar_parada(): registrar desde la pantalla única.
--    Sin inicio → +1 pendiente (del turno abierto del área).
--    Con inicio → como Mantenimiento: en curso (sin fin) o completa.
-- ------------------------------------------------------------
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
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  end if;
  if coalesce(v_fin, now()) - v_ini > interval '30 days' then
    raise exception 'La parada no puede durar más de 30 días.';
  end if;
  if exists (
    select 1 from paradas p
    where p.linea_id = v_linea_id and p.origen = 'MANTENIMIENTO'
      and p.inicio < coalesce(v_fin, now()) and coalesce(p.fin, now()) > v_ini
  ) then
    raise exception 'Ya hay una parada con horas en esa línea en ese horario. Termínala o ajusta las horas.';
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, creado_por)
  values (null, v_linea_id, v_tipo.id, v_clase, 'MANTENIMIENTO', v_nombre, v_guia, v_nota,
          v_ini, v_fin, v_usuario_id)
  returning id into v_id;

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
-- 6. completar_parada(): poner cuánto duró una pendiente.
--    Con minutos: inicio = hora del +1, fin = inicio + minutos (si eso
--    cae en el futuro, fin = ahora e inicio = ahora − minutos).
--    O con hora de inicio y fin reales.
--    "Falla sin especificar" exige elegir la falla de equipo.
--    Programada que pasa su tiempo guía exige justificación.
--    Se puede completar aunque el turno ya esté cerrado.
-- ------------------------------------------------------------
create or replace function completar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_minutos integer default null,
  p_inicio text default null,
  p_fin text default null,
  p_tipo_codigo text default null,
  p_justificacion text default null,
  p_pagina text default 'Registrar Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
  v_tipo_actual text;
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
  v_just text := nullif(trim(coalesce(p_justificacion, '')), '');
begin
  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if not v_p.pendiente then
    raise exception 'Esa parada ya está completa.';
  end if;

  select codigo into v_tipo_actual from paradas_tipos where id = v_p.tipo_id;

  if v_tipo_actual = 'FALLA_SIN_ESPECIFICAR' then
    if coalesce(p_tipo_codigo, '') = '' then
      raise exception 'Elige el código y el equipo de la falla.';
    end if;
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if v_tipo.id is not null and (v_tipo.equipo_id is null or v_tipo.codigo = 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige una falla de equipo del catálogo.';
    end if;
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  else
    select * into v_tipo from paradas_tipos where id = v_p.tipo_id;
    v_nombre := v_p.tipo_nombre;
  end if;
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_ini := hora_planta_a_timestamptz(p_inicio, 'inicio');
  v_fin := hora_planta_a_timestamptz(p_fin, 'fin');
  if v_ini is not null or v_fin is not null then
    if v_ini is null or v_fin is null then
      raise exception 'Pon la hora de inicio y la de fin, o solo los minutos.';
    end if;
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  else
    if p_minutos is null or p_minutos <= 0 then
      raise exception 'Pon cuántos minutos duró la parada.';
    end if;
    if p_minutos > 30 * 24 * 60 then
      raise exception 'La parada no puede durar más de 30 días.';
    end if;
    v_ini := v_p.inicio;
    v_fin := v_ini + make_interval(mins => p_minutos);
    if v_fin > now() then
      v_fin := now();
      v_ini := v_fin - make_interval(mins => p_minutos);
    end if;
  end if;

  v_min := round(extract(epoch from (v_fin - v_ini)) / 60);
  if v_guia is not null and v_min > v_guia and v_just is null then
    raise exception 'La parada duró % min y su tiempo guía es % min. Escribe la justificación.', v_min, round(v_guia);
  end if;

  update paradas
  set tipo_id = v_tipo.id,
      clase = coalesce(v_tipo.clase, v_p.clase),  -- tiempo ocioso de texto libre: sin tipo, conserva su clase
      tipo_nombre = v_nombre,
      tiempo_guia_min = v_guia,
      inicio = v_ini,
      fin = v_fin,
      justificacion_desvio = case when v_guia is not null and v_min > v_guia then v_just else null end,
      pendiente = false
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Completó la parada «%s» (%s min)', v_nombre, v_min),
    jsonb_build_object('pendiente', true, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('pendiente', false, 'tipo', v_nombre, 'minutos', v_min, 'justificacion', v_just)
  );
end;
$$;

grant execute on function completar_parada(text, uuid, integer, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. eliminar_parada(): borrar una parada cargada por error (cualquier
--    origen menos las viejas del Google Sheet). Queda en Auditoría.
-- ------------------------------------------------------------
create or replace function eliminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_pagina text default 'Registrar Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
begin
  select * into v_p from paradas where id = p_parada_id and origen <> 'SHEET';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;

  delete from paradas where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'paradas', p_parada_id::text, p_pagina,
    format('Eliminó la parada «%s»', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'linea_id', v_p.linea_id, 'inicio', v_p.inicio, 'fin', v_p.fin,
                       'nota', v_p.nota, 'pendiente', v_p.pendiente),
    null
  );
end;
$$;

grant execute on function eliminar_parada(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. listar_paradas(): igual que 20261067 + la columna "pendiente" al
--    final (cambia lo que devuelve, por eso drop + create).
-- ------------------------------------------------------------
drop function if exists listar_paradas(date, date, text, text, uuid, text);

create function listar_paradas(
  p_desde date,
  p_hasta date,
  p_linea text default null,
  p_clase text default null,
  p_turno_id uuid default null,
  p_area text default null
)
returns table (
  id uuid,
  turno_id uuid,
  clase text,
  origen text,
  linea_codigo text,
  turno_tipo text,
  tipo_codigo text,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio text,
  fin text,
  supervisor_nombre text,
  pendiente boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id,
    p_turno_id,
    e.clase,
    e.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    tt.codigo,
    t.codigo,
    e.tipo_nombre,
    e.tiempo_guia_min,
    e.nota,
    e.justificacion_desvio,
    to_char(e.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(e.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    coalesce((select pp.pendiente from paradas pp where pp.id = e.id), false)
  from paradas_efectivas_turno(p_turno_id) e
  join lineas l on l.id = e.linea_id
  join turnos tu on tu.id = p_turno_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = e.tipo_id
  left join usuarios u on u.id = e.creado_por
  where p_turno_id is not null
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or e.clase = p_clase)

  union all

  select
    p.id,
    p.turno_id,
    p.clase,
    p.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    coalesce(tt.codigo, turno_tipo_por_hora(p.inicio at time zone 'America/Caracas')),
    t.codigo,
    p.tipo_nombre,
    p.tiempo_guia_min,
    p.nota,
    p.justificacion_desvio,
    to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    p.pendiente
  from paradas p
  join lineas l on l.id = p.linea_id
  join areas ar on ar.id = l.area_id
  left join turnos tu on tu.id = p.turno_id
  left join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  where p_turno_id is null
    and (p.inicio at time zone 'America/Caracas')::date between p_desde and p_hasta
    and ((p_area is null and ar.codigo <> 'PRUEBAS') or ar.codigo = p_area)
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or p.clase = p_clase)

  order by 12 desc;
$$;

grant execute on function listar_paradas(date, date, text, text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. finalizar_turno(): igual que 20261083 + no deja cerrar con paradas
--    pendientes del turno. Esta guarda también aplica al Área de Pruebas
--    (para poder probarla).
-- ------------------------------------------------------------
create or replace function finalizar_turno(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
  v_es_pruebas boolean;
  v_pendientes integer;
begin
  perform exigir_puede_finalizar(p_usuario, p_turno_id);
  select (a.codigo = 'PRUEBAS') into v_es_pruebas
  from turnos t
  join areas a on a.id = t.area_id
  where t.id = p_turno_id;

  select count(*) into v_pendientes from paradas where turno_id = p_turno_id and pendiente;
  if v_pendientes > 0 then
    raise exception 'Hay % parada(s) sin completar (tipo o minutos). Complétalas en Registrar Paradas antes de finalizar el turno.',
      v_pendientes;
  end if;

  if not coalesce(v_es_pruebas, false) then
    -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
    end if;

    -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
    -- del tramo de este turno y elegir Terminar o Entregar línea.
    select string_agg(l.nombre, ', ' order by l.codigo)
    into v_lineas_activas
    from turno_lineas tl
    join lineas l on l.id = tl.linea_id
    where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

    if v_lineas_activas is not null then
      raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
        v_lineas_activas;
    end if;

    -- Tanque con producción de este turno sin confirmar su estado
    -- final: sin esto, el cierre queda a merced de la foto automática
    -- (el bug de hoy).
    if exists (
      select 1
      from recepcion_tanques rt
      where rt.turno_id = p_turno_id
        and rt.confirmado_fin_en is null
        and rt.lote_id is not null
        and exists (select 1 from turno_lineas tl where tl.turno_id = p_turno_id and tl.lote_id = rt.lote_id)
    ) then
      raise exception 'Hay tanques con producción de este turno sin confirmar su estado final. Confírmalos desde Preparación antes de finalizar.';
    end if;

    -- Línea que se ENTREGA activa al turno siguiente sin confirmar su
    -- fin: es el único caso de línea con riesgo real de arrastre (mismo
    -- criterio que tanques) — una corrida que ya terminó (finalizada_en,
    -- por PT o por reemplazo) no hereda nada, no lo necesita. Red de
    -- seguridad: en el flujo normal ya queda confirmada sola al Entregar
    -- línea (ver entregar_corrida más arriba).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id
        and activa and entregada_en is not null
        and confirmado_fin_en is null
    ) then
      raise exception 'Hay líneas entregadas de este turno sin confirmar su estado final.';
    end if;
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function finalizar_turno(text, uuid) to anon, authenticated;
