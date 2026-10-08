-- ============================================================
-- PARADAS DE MANTENIMIENTO DESDE SU GOOGLE SHEET (otra vez)
-- ============================================================
-- Dueña, 2026-10-08 (plan-sheet-vacio-produccion.md, sección 1):
-- Mantenimiento vuelve a cargar sus paradas en su Sheet («REPORTE LINEAS»,
-- pestaña ÁREAS) y nosotros tomamos el tiempo y el código. Botón
-- «Actualizar desde el Sheet»: el navegador lee el Sheet (ya resuelve las
-- fechas mal puestas) y este servidor guarda cada reporte de Aséptico por su
-- id (paradas.ref_sheet, 20261061): nuevo, actualizado o sin cambios.
--
--   * Equivalencias: cada equipo + subsistema del Sheet ("CBP32" +
--     "CBP-EMP-05 /EMPUJADOR") se asocia UNA vez a un tipo de nuestro
--     catálogo ("CP 7 Empujador"). La primera vez llega una propuesta de la
--     app (sin confirmar); en la pantalla Equivalencias se confirma o cambia,
--     y el cambio se aplica a todas las paradas de ese par.
--   * La parada queda con origen SHEET, sin turno (cada turno toma los
--     minutos que se solapan con su horario, paradas_efectivas_turno), el
--     tipo de la equivalencia y en la nota lo que escribió Mantenimiento.
--   * PENDIENTE en el Sheet = en curso (fin vacío) hasta que lo finalicen.
--   * El enlace queda en configuracion_app ('sheet_mantenimiento_url').
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lo que vino del Sheet, para volver a asignar el tipo
-- ------------------------------------------------------------
alter table paradas add column if not exists mtto_equipo text;
alter table paradas add column if not exists mtto_subsistema text;

create table if not exists paradas_mtto_equivalencias (
  equipo text not null,
  -- '' cuando el reporte no trae subsistema.
  subsistema text not null default '',
  tipo_id uuid references paradas_tipos (id),
  confirmada boolean not null default false,
  actualizada_por uuid references usuarios (id),
  updated_at timestamptz not null default now(),
  primary key (equipo, subsistema)
);
alter table paradas_mtto_equivalencias enable row level security;

-- Quién puede actualizar desde el Sheet: quien registra paradas, Mantenimiento y el Super Admin.
create or replace function puede_sincronizar_sheet_mtto(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'PARADAS_REGISTRAR')
    or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO')
    or coalesce((select area_codigo = 'MANTENIMIENTO' from rol_y_area_de(p_usuario)), false)
    or coalesce(es_superadmin(p_usuario), false);
$$;
revoke execute on function puede_sincronizar_sheet_mtto(text) from public, anon, authenticated;

-- Nombre de la parada con el tipo de la equivalencia (como anotar_parada); sin tipo, "Mantenimiento · equipo".
create or replace function nombre_parada_sheet(p_tipo_id uuid, p_linea_id uuid, p_equipo text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo paradas_tipos;
  v_area_id uuid;
begin
  select * into v_tipo from paradas_tipos where id = p_tipo_id;
  if v_tipo.id is null then
    return 'Mantenimiento · ' || coalesce(nullif(trim(p_equipo), ''), 'Sin equipo');
  end if;
  select area_id into v_area_id from lineas where id = p_linea_id;
  return nombre_tipo_en_linea(v_tipo, p_linea_id, v_area_id);
end;
$$;
revoke execute on function nombre_parada_sheet(uuid, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Sincronizar
-- ------------------------------------------------------------
-- p_filas: [{id, area, linea, equipo, subsistema, falla, estatus,
--            inicio 'YYYY-MM-DDTHH:MM:SS' (hora de planta), fin (o null),
--            tipo_sugerido (código del catálogo o null)}]
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

-- ------------------------------------------------------------
-- 3. Equivalencias: listar y guardar
-- ------------------------------------------------------------
create or replace function listar_equivalencias_mtto(p_usuario text)
returns table (
  equipo text,
  subsistema text,
  reportes bigint,
  tipo_codigo text,
  confirmada boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not puede_sincronizar_sheet_mtto(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;
  return query
  select e.equipo, e.subsistema,
         (select count(*) from paradas p where p.origen = 'SHEET' and p.mtto_equipo = e.equipo and p.mtto_subsistema = e.subsistema),
         t.codigo, e.confirmada
  from paradas_mtto_equivalencias e
  left join paradas_tipos t on t.id = e.tipo_id
  order by e.confirmada, e.equipo, e.subsistema;
end;
$$;
grant execute on function listar_equivalencias_mtto(text) to anon, authenticated;

-- Confirma o cambia el tipo de un par y lo aplica a todas sus paradas. Quien edita el catálogo de paradas.
create or replace function guardar_equivalencia_mtto(p_usuario text, p_equipo text, p_subsistema text, p_tipo_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo paradas_tipos;
  v_usuario_id uuid;
  v_antes text;
  v_p record;
begin
  if not (tiene_permiso(p_usuario, 'CATALOGO_PARADAS') or coalesce(es_superadmin(p_usuario), false) or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'No tienes permiso para cambiar las equivalencias.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null then
    raise exception 'Elige un tipo del catálogo.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select t.codigo into v_antes
  from paradas_mtto_equivalencias e left join paradas_tipos t on t.id = e.tipo_id
  where e.equipo = upper(trim(p_equipo)) and e.subsistema = upper(trim(coalesce(p_subsistema, '')));

  insert into paradas_mtto_equivalencias (equipo, subsistema, tipo_id, confirmada, actualizada_por, updated_at)
  values (upper(trim(p_equipo)), upper(trim(coalesce(p_subsistema, ''))), v_tipo.id, true, v_usuario_id, now())
  on conflict (equipo, subsistema) do update
    set tipo_id = excluded.tipo_id, confirmada = true, actualizada_por = excluded.actualizada_por, updated_at = now();

  for v_p in
    select id, linea_id from paradas
    where origen = 'SHEET' and mtto_equipo = upper(trim(p_equipo)) and mtto_subsistema = upper(trim(coalesce(p_subsistema, '')))
  loop
    update paradas
    set tipo_id = v_tipo.id, clase = v_tipo.clase, tipo_nombre = nombre_parada_sheet(v_tipo.id, v_p.linea_id, p_equipo)
    where id = v_p.id;
  end loop;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas_mtto_equivalencias', upper(trim(p_equipo)) || ' · ' || upper(trim(coalesce(p_subsistema, ''))),
    'Equivalencias de Mantenimiento',
    format('Equivalencia %s %s → %s', upper(trim(p_equipo)), upper(trim(coalesce(p_subsistema, ''))), v_tipo.codigo),
    jsonb_build_object('tipo', v_antes), jsonb_build_object('tipo', v_tipo.codigo)
  );
end;
$$;
grant execute on function guardar_equivalencia_mtto(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. El enlace del Sheet (dueña, 2026-10-08)
-- ------------------------------------------------------------
insert into configuracion_app (clave, valor, updated_at)
values ('sheet_mantenimiento_url', 'https://docs.google.com/spreadsheets/d/1G83BfN9buOnkCsY_3JowMolkslaAsQYzhqvAxnBqxVU/edit?usp=sharing', now())
on conflict (clave) do update set valor = excluded.valor, updated_at = now();
