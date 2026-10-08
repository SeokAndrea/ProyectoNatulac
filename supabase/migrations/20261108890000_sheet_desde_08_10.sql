-- ============================================================
-- Sheet de Mantenimiento: cuenta solo desde el 08/10/2026
-- ============================================================
-- Dueña, 2026-10-08: las paradas del Sheet empiezan a contar desde hoy.
-- Lo anterior se queda en el Sheet (de ahí vienen) pero no suma en la app:
-- había reportes PENDIENTE desde abril y agosto que la app tomaba como
-- paradas en curso, y errores de tipeo viejos de ~24 h.
--
--   * configuracion_app 'sheet_mantenimiento_desde' = 2026-10-08 (se lee
--     con obtener_configuracion; cambiarla solo por SQL).
--   * Se borran las paradas del Sheet anteriores a esa fecha. Las
--     equivalencias se quedan.
--   * sincronizar_paradas_mantenimiento() ignora los reportes anteriores.
-- ============================================================

insert into configuracion_app (clave, valor, updated_at)
values ('sheet_mantenimiento_desde', '2026-10-08', now())
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

-- Última versión: 20261108490000_paradas_desde_sheet_mantenimiento.sql
create or replace function obtener_configuracion(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_clave not in ('sheet_mantenimiento_url', 'sheet_mantenimiento_ultima_sync', 'sheet_mantenimiento_desde') then
    raise exception 'Ajuste desconocido.';
  end if;
  return (select valor from configuracion_app where clave = p_clave);
end;
$$;
grant execute on function obtener_configuracion(text) to anon, authenticated;

delete from paradas
where origen = 'SHEET'
  and inicio < ('2026-10-08'::timestamp at time zone 'America/Caracas');

-- Última versión: 20261108490000_paradas_desde_sheet_mantenimiento.sql (+ v_desde)
create or replace function sincronizar_paradas_mantenimiento(p_usuario text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb;
  v_id text;
  v_num text;
  v_linea_id uuid;
  v_ini timestamptz;
  v_fin timestamptz;
  v_equipo text;
  v_sub text;
  v_eq paradas_mtto_equivalencias;
  v_tipo paradas_tipos;
  v_nombre text;
  v_nota text;
  v_clase text;
  v_filas integer;
  v_nuevas integer := 0;
  v_actualizadas integer := 0;
  v_sin_cambios integer := 0;
  v_omitidas integer := 0;
  -- Desde cuándo cuenta el Sheet (configuracion_app, 20261108890000).
  v_desde timestamptz := (coalesce((select valor from configuracion_app where clave = 'sheet_mantenimiento_desde'), '2026-10-08')::date)::timestamp at time zone 'America/Caracas';
begin
  if not puede_sincronizar_sheet_mtto(p_usuario) then
    raise exception 'No tienes permiso para actualizar las paradas de Mantenimiento.';
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Formato de filas inválido.';
  end if;
  if jsonb_array_length(p_filas) > 10000 then
    raise exception 'Demasiadas filas (máximo 10.000).';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_id := nullif(trim(coalesce(f ->> 'id', '')), '');
    v_num := (regexp_match(upper(coalesce(f ->> 'linea', '')), 'LINEA\s*(\d)'))[1];
    v_ini := null;
    v_fin := null;
    begin
      v_ini := ((f ->> 'inicio')::timestamp) at time zone 'America/Caracas';
      v_fin := nullif(f ->> 'fin', '')::timestamp at time zone 'America/Caracas';
    exception when others then
      v_ini := null;
    end;

    -- Solo Aséptico (con o sin tilde) y con lo mínimo para ubicar la parada.
    if v_id is null
       or v_num is null
       or upper(translate(coalesce(f ->> 'area', ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) not like 'ASEPTICO%'
       or v_ini is null
       or v_ini < v_desde
       or (v_fin is not null and v_fin < v_ini) then
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

    v_equipo := upper(trim(coalesce(f ->> 'equipo', '')));
    v_sub := upper(trim(coalesce(f ->> 'subsistema', '')));

    -- Equivalencia: la que ya existe, o la propuesta de la app (sin confirmar).
    select * into v_eq from paradas_mtto_equivalencias where equipo = v_equipo and subsistema = v_sub;
    if v_eq.equipo is null then
      insert into paradas_mtto_equivalencias (equipo, subsistema, tipo_id, confirmada)
      values (v_equipo, v_sub, (select id from paradas_tipos where codigo = nullif(f ->> 'tipo_sugerido', '')), false)
      returning * into v_eq;
    end if;
    v_tipo := null;
    select * into v_tipo from paradas_tipos where id = v_eq.tipo_id;
    v_clase := coalesce(v_tipo.clase, 'NO_PROGRAMADA');
    v_nombre := nombre_parada_sheet(v_tipo.id, v_linea_id, v_equipo);
    v_nota := nullif(concat_ws(' — ',
      'Mantenimiento',
      nullif(trim(coalesce(f ->> 'falla', '')), ''),
      nullif(concat_ws(' · ', nullif(v_equipo, ''), nullif(v_sub, '')), '')), 'Mantenimiento');

    if exists (select 1 from paradas where ref_sheet = v_id) then
      update paradas
      set linea_id = v_linea_id, tipo_id = v_tipo.id, clase = v_clase, tipo_nombre = v_nombre, nota = v_nota,
          inicio = v_ini, fin = v_fin, mtto_equipo = v_equipo, mtto_subsistema = v_sub
      where ref_sheet = v_id
        and (linea_id, tipo_id, clase, tipo_nombre, nota, inicio, fin, mtto_equipo, mtto_subsistema)
          is distinct from (v_linea_id, v_tipo.id, v_clase, v_nombre, v_nota, v_ini, v_fin, v_equipo, v_sub);
      get diagnostics v_filas = row_count;
      if v_filas > 0 then
        v_actualizadas := v_actualizadas + 1;
      else
        v_sin_cambios := v_sin_cambios + 1;
      end if;
    else
      insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                           inicio, fin, ref_sheet, mtto_equipo, mtto_subsistema)
      values (null, v_linea_id, v_tipo.id, v_clase, 'SHEET', v_nombre, null, v_nota, v_ini, v_fin, v_id, v_equipo, v_sub);
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

  -- Solo queda en Auditoría cuando cambió algo.
  if v_nuevas + v_actualizadas > 0 then
    perform registrar_auditoria(
      p_usuario, 'SINCRONIZAR', 'paradas', 'mantenimiento', 'Actualizar desde el Sheet',
      format('Actualizó las paradas de Mantenimiento desde el Sheet: %s nuevas, %s actualizadas', v_nuevas, v_actualizadas),
      null,
      jsonb_build_object('nuevas', v_nuevas, 'actualizadas', v_actualizadas, 'sin_cambios', v_sin_cambios, 'omitidas', v_omitidas)
    );
  end if;

  return jsonb_build_object('nuevas', v_nuevas, 'actualizadas', v_actualizadas,
                            'sin_cambios', v_sin_cambios, 'omitidas', v_omitidas);
end;
$$;
grant execute on function sincronizar_paradas_mantenimiento(text, jsonb) to anon, authenticated;
