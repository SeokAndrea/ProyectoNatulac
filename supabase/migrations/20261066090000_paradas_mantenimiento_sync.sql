-- ============================================================
-- PARADAS DE MANTENIMIENTO (Google Sheet) — sincronización
-- ============================================================
-- Mantenimiento lleva sus paradas en su propio Google Sheet, con su propio
-- catálogo. Solo interesa la LÍNEA y las HORAS: cada reporte de Aséptico entra
-- como una parada NO PROGRAMADA «Mantenimiento · <equipo>» con origen SHEET.
-- Los turnos no se toman del Sheet: la parada no pertenece a un turno
-- (turno_id null) y a cada turno le tocan los minutos que se solapan con su
-- ventana real. Un reporte PENDIENTE queda en curso (fin null).
--
-- 1. paradas.turno_id pasa a ser opcional (las de Mantenimiento no lo llevan).
-- 2. paradas_efectivas_turno(): las paradas de un turno, manuales y de
--    Mantenimiento recortadas a su ventana. Lo usan listar_paradas y
--    paradas_de_turnos (Panel, Acta, Validar).
-- 3. listar_paradas() y paradas_de_turnos() incluyen las de Mantenimiento.
-- 4. sincronizar_paradas_mantenimiento(): recibe las filas ya leídas del Sheet
--    y las guarda por id de reporte (idempotente).
-- 5. obtener_configuracion() acepta la clave de la última sincronización.
-- ============================================================

alter table paradas alter column turno_id drop not null;

-- ------------------------------------------------------------
-- Turno de un instante (hora de planta), por la hora del día.
-- ------------------------------------------------------------
create or replace function turno_tipo_por_hora(p_local timestamp)
returns text
language sql
immutable
as $$
  select case
    when p_local::time >= time '07:00' and p_local::time < time '15:00' then 'TURNO_1'
    when p_local::time >= time '15:00' and p_local::time < time '22:30' then 'TURNO_2'
    else 'TURNO_3'
  end;
$$;

-- ------------------------------------------------------------
-- Paradas de UN turno: las manuales (por turno_id) y las de Mantenimiento de
-- las líneas del área que se solapan con la ventana del turno, recortadas a ella.
-- Ventana: inicio real del turno → cierre real (o ahora si sigue abierto).
-- Una parada de Mantenimiento en curso, en un turno abierto, sigue con fin null.
-- ------------------------------------------------------------
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
           ((tu.fecha + tu.hora_inicio) at time zone 'America/Caracas') as desde,
           case
             when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
               then ((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas')
             else now()
           end as hasta
    from turnos tu
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
                and p.origen = 'SHEET'
                and p.turno_id is null
                and p.inicio < t.hasta
                and coalesce(p.fin, t.hasta) > t.desde;
$$;

grant execute on function paradas_efectivas_turno(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_paradas(): misma firma y forma que antes.
--  * Con p_turno_id: las del turno (manuales + Mantenimiento recortadas).
--  * Con rango de fechas: todas por la fecha de inicio (hora de planta); la
--    de Mantenimiento lleva el turno según la hora en que empezó.
-- ------------------------------------------------------------
create or replace function listar_paradas(
  p_desde date,
  p_hasta date,
  p_linea text default null,
  p_clase text default null,
  p_turno_id uuid default null
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
  supervisor_nombre text
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
    u.nombre
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
    u.nombre
  from paradas p
  join lineas l on l.id = p.linea_id
  left join turnos tu on tu.id = p.turno_id
  left join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  where p_turno_id is null
    and (p.inicio at time zone 'America/Caracas')::date between p_desde and p_hasta
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or p.clase = p_clase)

  order by 12 desc;
$$;

grant execute on function listar_paradas(date, date, text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- paradas_de_turnos(): para Validar, con las de Mantenimiento recortadas.
-- ------------------------------------------------------------
create or replace function paradas_de_turnos(p_usuario text, p_codigos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_object_agg(x.codigo, x.paradas), '{}'::jsonb)
  into v_result
  from (
    select t.codigo,
           jsonb_agg(jsonb_build_object(
             'linea', l.nombre,
             'clase', e.clase,
             'tipo', e.tipo_nombre,
             'minutos', greatest(0, round(extract(epoch from (coalesce(e.fin, now()) - e.inicio)) / 60)),
             'guia', e.tiempo_guia_min,
             'nota', e.nota,
             'justificacion', e.justificacion_desvio
           ) order by l.nombre, e.inicio) as paradas
    from turnos t
    cross join lateral paradas_efectivas_turno(t.id) e
    join lineas l on l.id = e.linea_id
    where t.codigo = any(p_codigos)
    group by t.codigo
  ) x;

  return v_result;
end;
$$;

grant execute on function paradas_de_turnos(text, text[]) to anon, authenticated;

-- ------------------------------------------------------------
-- obtener_configuracion(): + última sincronización.
-- ------------------------------------------------------------
create or replace function obtener_configuracion(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_clave not in ('sheet_mantenimiento_url', 'sheet_mantenimiento_ultima_sync') then
    raise exception 'Ajuste desconocido.';
  end if;
  return (select valor from configuracion_app where clave = p_clave);
end;
$$;

grant execute on function obtener_configuracion(text) to anon, authenticated;

-- ------------------------------------------------------------
-- sincronizar_paradas_mantenimiento(): guarda las filas del Sheet.
--   p_filas: [{ id, area, linea, equipo, subsistema, tipoFalla, estatus,
--               inicio: 'YYYY-MM-DDTHH:MM:SS' (hora de planta), fin: idem o null }]
-- Solo entra Aséptico. Se identifica por el id del reporte (ref_sheet): sincronizar
-- dos veces no duplica. Devuelve cuántas quedaron nuevas, actualizadas, sin cambios
-- y omitidas (datos incompletos o de otra área). Puede usarla un supervisor, un
-- superadmin, la gente de Mantenimiento y el Área de Pruebas.
-- ------------------------------------------------------------
create or replace function sincronizar_paradas_mantenimiento(p_usuario text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  f jsonb;
  v_id text;
  v_num text;
  v_linea_id uuid;
  v_ini timestamptz;
  v_fin timestamptz;
  v_nombre text;
  v_nota text;
  v_estatus text;
  v_existe boolean;
  v_filas integer;
  v_nuevas integer := 0;
  v_actualizadas integer := 0;
  v_sin_cambios integer := 0;
  v_omitidas integer := 0;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not (v_rol in ('SUPERVISOR', 'SUPERADMINISTRADOR') or v_area in ('MANTENIMIENTO', 'PRUEBAS')) then
    raise exception 'No tienes permiso para sincronizar las paradas de Mantenimiento.';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Formato de filas inválido.';
  end if;
  if jsonb_array_length(p_filas) > 5000 then
    raise exception 'Demasiadas filas (máximo 5.000).';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_id := nullif(trim(coalesce(f ->> 'id', '')), '');
    v_num := (regexp_match(upper(coalesce(f ->> 'linea', '')), 'LINEA\s*(\d)'))[1];
    v_estatus := upper(trim(coalesce(f ->> 'estatus', '')));
    v_ini := null;
    v_fin := null;
    begin
      v_ini := ((f ->> 'inicio')::timestamp) at time zone 'America/Caracas';
    exception when others then
      v_ini := null;
    end;
    begin
      v_fin := nullif(f ->> 'fin', '')::timestamp at time zone 'America/Caracas';
    exception when others then
      v_fin := null;
    end;

    -- Solo Aséptico (con o sin tilde) y con lo mínimo para ubicar la parada.
    if v_id is null
       or v_num is null
       or upper(translate(coalesce(f ->> 'area', ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) not like 'ASEPTICO%'
       or v_ini is null
       or (v_fin is not null and v_fin < v_ini)
       or (v_fin is null and v_estatus <> 'PENDIENTE') then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;

    select l.id into v_linea_id
    from lineas l
    join areas a on a.id = l.area_id
    where a.codigo = 'ASEPTICO'
      and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_num
    limit 1;
    if v_linea_id is null then
      v_omitidas := v_omitidas + 1;
      continue;
    end if;

    v_nombre := 'Mantenimiento · ' || coalesce(nullif(trim(f ->> 'equipo'), ''), 'Sin equipo');
    v_nota := nullif(concat_ws(' — ', nullif(trim(f ->> 'tipoFalla'), ''), nullif(trim(f ->> 'subsistema'), '')), '');
    v_existe := exists (select 1 from paradas where ref_sheet = v_id);

    if v_existe then
      update paradas
      set linea_id = v_linea_id, tipo_nombre = v_nombre, nota = v_nota, inicio = v_ini, fin = v_fin
      where ref_sheet = v_id
        and (linea_id, tipo_nombre, nota, inicio, fin) is distinct from (v_linea_id, v_nombre, v_nota, v_ini, v_fin);
      get diagnostics v_filas = row_count;
      if v_filas > 0 then
        v_actualizadas := v_actualizadas + 1;
      else
        v_sin_cambios := v_sin_cambios + 1;
      end if;
    else
      insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                           inicio, fin, ref_sheet)
      values (null, v_linea_id, null, 'NO_PROGRAMADA', 'SHEET', v_nombre, null, v_nota, v_ini, v_fin, v_id);
      v_nuevas := v_nuevas + 1;
    end if;
  end loop;

  insert into configuracion_app (clave, valor, updated_at)
  values (
    'sheet_mantenimiento_ultima_sync',
    jsonb_build_object('en', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                       'nuevas', v_nuevas, 'actualizadas', v_actualizadas)::text,
    now()
  )
  on conflict (clave) do update set valor = excluded.valor, updated_at = now();

  -- Solo queda en Auditoría cuando cambió algo (no cada sincronización sin novedades).
  if v_nuevas + v_actualizadas > 0 then
    perform registrar_auditoria(
      p_usuario, 'SINCRONIZAR', 'paradas', 'mantenimiento', 'Sincronizar Mantenimiento',
      format('Sincronizó paradas de Mantenimiento: %s nuevas, %s actualizadas', v_nuevas, v_actualizadas),
      null,
      jsonb_build_object('nuevas', v_nuevas, 'actualizadas', v_actualizadas, 'sin_cambios', v_sin_cambios, 'omitidas', v_omitidas)
    );
  end if;

  return jsonb_build_object('nuevas', v_nuevas, 'actualizadas', v_actualizadas,
                            'sin_cambios', v_sin_cambios, 'omitidas', v_omitidas);
end;
$$;

grant execute on function sincronizar_paradas_mantenimiento(text, jsonb) to anon, authenticated;
