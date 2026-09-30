-- ============================================================
-- CALIDAD: parámetros de Brix y acidez por sabor, análisis sensorial y
-- Supervisor de Calidad
-- ============================================================
-- Rework 2026-09-29 (dueño). El análisis de Calidad es: análisis
-- SENSORIAL (conforme / no conforme), Brix y acidez. Cada sabor tiene un
-- rango de Brix y de acidez (se los dio Calidad; cambian con las
-- reformulaciones). No se puede liberar un lote si el sensorial no es
-- conforme o si el Brix o la acidez quedan fuera del rango de su sabor.
--
--   * Rol SUPERVISOR_CALIDAD (Supervisor de Calidad): analiza, libera y
--     además edita los rangos por sabor (permiso nuevo CALIDAD_PARAMETROS).
--     El Analista de Calidad (CALIDAD, 20261086) analiza y libera.
--   * calidad_parametros: un rango por sabor. Auditado.
--   * analisis_calidad guarda también el sensorial y el rango vigente al
--     momento del análisis (si después se reformula, el registro viejo
--     sigue mostrando contra qué rango se evaluó). "conforme" pasa a ser el
--     RESULTADO: sensorial conforme + Brix y acidez dentro del rango. Es lo
--     que sigue mirando liberar_lote().
--   * registrar_analisis_calidad(): p_conforme es ahora el sensorial (mismo
--     nombre para no romper la versión anterior de la app). El análisis se
--     guarda SIEMPRE, con su hora: fuera de rango o sin rango cargado queda
--     no conforme y no libera. La observación solo es obligatoria si el
--     sensorial no es conforme.
-- Los análisis anteriores (solo Pruebas) quedan con sensorial = conforme y
-- sin rango.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rol y permiso
-- ------------------------------------------------------------
insert into roles (codigo, nombre) values ('SUPERVISOR_CALIDAD', 'Supervisor de Calidad')
on conflict (codigo) do nothing;

insert into permisos (codigo, nombre) values ('CALIDAD_PARAMETROS', 'Editar parámetros de Calidad (Brix y acidez por sabor)')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, v.permiso from roles r
cross join (values ('LOTE_LIBERAR'), ('CALIDAD_PARAMETROS')) as v (permiso)
where r.codigo = 'SUPERVISOR_CALIDAD'
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Rangos por sabor
-- ------------------------------------------------------------
create table calidad_parametros (
  sabor_id uuid primary key references sabores (id) on delete cascade,
  brix_min numeric(5, 2) not null,
  brix_max numeric(5, 2) not null,
  acidez_min numeric(6, 3) not null,
  acidez_max numeric(6, 3) not null,
  -- Quién los cargó por última vez. Se llama usuario_id para que auditar_cambio() lo tome como autor.
  usuario_id uuid not null references usuarios (id),
  actualizado_en timestamptz not null default now(),
  check (brix_min >= 0 and brix_min <= brix_max and brix_max <= 100),
  check (acidez_min >= 0 and acidez_min <= acidez_max and acidez_max <= 100)
);

alter table calidad_parametros enable row level security;

create trigger auditar_calidad_parametros after insert or update or delete on calidad_parametros
  for each row execute function auditar_cambio();

-- Todos los sabores activos con su rango (null = sin cargar).
create or replace function listar_parametros_calidad()
returns table (
  sabor_id uuid,
  sabor_nombre text,
  familia_nombre text,
  brix_min numeric,
  brix_max numeric,
  acidez_min numeric,
  acidez_max numeric,
  actualizado_en timestamptz,
  actualizado_por_nombre text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.nombre, f.nombre, cp.brix_min, cp.brix_max, cp.acidez_min, cp.acidez_max, cp.actualizado_en, u.nombre
  from sabores s
  join familias_producto f on f.id = s.familia_id
  left join calidad_parametros cp on cp.sabor_id = s.id
  left join usuarios u on u.id = cp.usuario_id
  where s.activo
  order by f.nombre, s.nombre;
$$;

grant execute on function listar_parametros_calidad() to anon, authenticated;

create or replace function guardar_parametros_calidad(
  p_usuario text,
  p_sabor_id uuid,
  p_brix_min numeric,
  p_brix_max numeric,
  p_acidez_min numeric,
  p_acidez_max numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not tiene_permiso(p_usuario, 'CALIDAD_PARAMETROS') then
    raise exception 'Solo el Supervisor de Calidad puede cambiar los rangos.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario) and activo;
  if not exists (select 1 from sabores where id = p_sabor_id) then
    raise exception 'No se encontró el sabor.';
  end if;
  if p_brix_min is null or p_brix_max is null or p_acidez_min is null or p_acidez_max is null then
    raise exception 'Completa el mínimo y el máximo de Brix y de acidez.';
  end if;
  if p_brix_min < 0 or p_acidez_min < 0 then
    raise exception 'Los valores no pueden ser negativos.';
  end if;
  if p_brix_min > p_brix_max then
    raise exception 'El Brix mínimo no puede ser mayor que el máximo.';
  end if;
  if p_acidez_min > p_acidez_max then
    raise exception 'La acidez mínima no puede ser mayor que la máxima.';
  end if;

  insert into calidad_parametros (sabor_id, brix_min, brix_max, acidez_min, acidez_max, usuario_id, actualizado_en)
  values (p_sabor_id, p_brix_min, p_brix_max, p_acidez_min, p_acidez_max, v_usuario_id, now())
  on conflict (sabor_id) do update
  set brix_min = excluded.brix_min, brix_max = excluded.brix_max,
      acidez_min = excluded.acidez_min, acidez_max = excluded.acidez_max,
      usuario_id = excluded.usuario_id, actualizado_en = now();
end;
$$;

grant execute on function guardar_parametros_calidad(text, uuid, numeric, numeric, numeric, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Análisis: sensorial + rango con el que se evaluó
-- ------------------------------------------------------------
alter table analisis_calidad
  add column sensorial_conforme boolean,
  add column brix_min numeric(5, 2),
  add column brix_max numeric(5, 2),
  add column acidez_min numeric(6, 3),
  add column acidez_max numeric(6, 3);

update analisis_calidad set sensorial_conforme = conforme where sensorial_conforme is null;
alter table analisis_calidad alter column sensorial_conforme set not null;

-- Última versión: 20261086090000_calidad_libera_lotes.sql
create or replace function registrar_analisis_calidad(
  p_usuario text,
  p_turno_id uuid,
  p_lote_id uuid,
  p_brix numeric,
  p_acidez numeric,
  p_conforme boolean, -- análisis SENSORIAL
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
  v_param calidad_parametros%rowtype;
  v_observacion text := nullif(trim(coalesce(p_observacion, '')), '');
  v_conforme boolean;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if not puede_liberar_lote(p_usuario, p_turno_id) then
    raise exception 'Solo Calidad puede registrar análisis.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario) and activo;
  if v_usuario_id is null then
    raise exception 'Usuario no válido.';
  end if;

  select * into v_lote from preparaciones where id = p_lote_id;
  if not found then
    raise exception 'No se encontró el lote.';
  end if;
  if v_lote.liberado_en is not null then
    raise exception 'Ese lote ya está liberado.';
  end if;
  if not exists (
    select 1 from recepcion_tanques
    where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque and condicion = 'EN_PREPARACION'
  ) then
    raise exception 'El tanque de ese lote no está en preparación.';
  end if;

  if p_brix is null or p_acidez is null or p_conforme is null then
    raise exception 'Completa el análisis sensorial, el Brix y la acidez.';
  end if;

  -- Siempre se guarda (con su hora). Sin rango cargado, o fuera de rango, queda no conforme y no se libera.
  select * into v_param from calidad_parametros where sabor_id = v_lote.sabor_id;
  v_conforme := v_param.sabor_id is not null
    and p_conforme
    and p_brix between v_param.brix_min and v_param.brix_max
    and p_acidez between v_param.acidez_min and v_param.acidez_max;

  -- La observación solo es obligatoria si el sensorial no es conforme (el rango ya explica lo demás).
  if not p_conforme and v_observacion is null then
    raise exception 'Si el análisis sensorial no es conforme, escribe la observación.';
  end if;

  insert into analisis_calidad (
    preparacion_id, turno_id, brix, acidez, conforme, sensorial_conforme,
    brix_min, brix_max, acidez_min, acidez_max, observacion, usuario_id
  )
  values (
    p_lote_id, p_turno_id, p_brix, p_acidez, v_conforme, p_conforme,
    v_param.brix_min, v_param.brix_max, v_param.acidez_min, v_param.acidez_max, v_observacion, v_usuario_id
  );

  if v_conforme then
    return liberar_lote(p_usuario, p_turno_id, p_lote_id);
  end if;
  return turno_json(p_turno_id);
end;
$$;

-- Las lecturas suman el sensorial y el rango (cambia lo que devuelven: se recrean).
drop function analisis_calidad_de_lotes(uuid[]);
create function analisis_calidad_de_lotes(p_lote_ids uuid[])
returns table (
  id uuid,
  preparacion_id uuid,
  brix numeric,
  acidez numeric,
  conforme boolean,
  sensorial_conforme boolean,
  brix_min numeric,
  brix_max numeric,
  acidez_min numeric,
  acidez_max numeric,
  observacion text,
  analista_nombre text,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ac.id, ac.preparacion_id, ac.brix, ac.acidez, ac.conforme, ac.sensorial_conforme,
         ac.brix_min, ac.brix_max, ac.acidez_min, ac.acidez_max, ac.observacion, u.nombre, ac.created_at
  from analisis_calidad ac
  join usuarios u on u.id = ac.usuario_id
  where ac.preparacion_id = any (p_lote_ids)
  order by ac.created_at desc;
$$;

grant execute on function analisis_calidad_de_lotes(uuid[]) to anon, authenticated;

drop function listar_analisis_calidad(text, date, date, text);
create function listar_analisis_calidad(
  p_usuario text,
  p_desde date,
  p_hasta date,
  p_area_codigo text default null
)
returns table (
  id uuid,
  creado_en timestamptz,
  turno_codigo text,
  numero_tanque smallint,
  sabor_nombre text,
  lote text,
  brix numeric,
  acidez numeric,
  conforme boolean,
  sensorial_conforme boolean,
  brix_min numeric,
  brix_max numeric,
  acidez_min numeric,
  acidez_max numeric,
  observacion text,
  analista_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (tiene_permiso(p_usuario, 'LOTE_LIBERAR') or tiene_permiso(p_usuario, 'AUDITORIA_VER') or p_area_codigo = 'PRUEBAS') then
    raise exception 'No tienes permiso para ver los registros de Calidad.';
  end if;

  return query
  select ac.id, ac.created_at, t.codigo, p.numero_tanque, s.nombre, p.lote,
         ac.brix, ac.acidez, ac.conforme, ac.sensorial_conforme,
         ac.brix_min, ac.brix_max, ac.acidez_min, ac.acidez_max, ac.observacion, u.nombre
  from analisis_calidad ac
  join preparaciones p on p.id = ac.preparacion_id
  join turnos t on t.id = ac.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = ac.usuario_id
  left join sabores s on s.id = p.sabor_id
  where (ac.created_at at time zone 'America/Caracas')::date between p_desde and p_hasta
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by ac.created_at desc;
end;
$$;

grant execute on function listar_analisis_calidad(text, date, date, text) to anon, authenticated;
