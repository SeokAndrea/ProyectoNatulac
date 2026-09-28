-- ENSAYO (se puede borrar): aplica la migración 20261086 (Calidad libera los lotes) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.

begin;

-- ===================== MIGRACIÓN 20261086090000_calidad_libera_lotes.sql =====================
-- ============================================================
-- CALIDAD LIBERA LOS LOTES
-- ============================================================
-- Rework 2026-09-28. El supervisor prepara el tanque; Calidad lo analiza
-- (Brix, acidez, conformidad) y, si es conforme, lo libera. Después el
-- supervisor lo toma desde Líneas, igual que antes.
--
--   * Interruptor por área areas.calidad_libera (como el 12x12 o el
--     respaldo). Encendido: solo Calidad libera, con análisis conforme.
--     Apagado: el supervisor libera como siempre. Nace encendido SOLO en
--     Pruebas; en las demás áreas no cambia nada (ver plan-calidad.md).
--     Para encenderlo en Aséptico:
--       update areas set calidad_libera = true where codigo = 'ASEPTICO';
--   * Rol CALIDAD (Analista de Calidad) y permiso LOTE_LIBERAR. Lo traen
--     CALIDAD y JEFE_PRODUCCION; a otra persona se le puede dar desde
--     Personal (ej. un supervisor de noche sin Calidad en planta).
--   * analisis_calidad: cada análisis de un lote. Se guardan todos: si no
--     es conforme, el supervisor ajusta y Calidad vuelve a analizar.
--   * registrar_analisis_calidad(): guarda el análisis y, si es conforme,
--     libera el lote en la misma operación (el tanque queda LISTO).
--   * liberar_lote(): con el interruptor encendido exige LOTE_LIBERAR y que
--     el último análisis del lote sea conforme (en Pruebas no pide el
--     permiso, pero sí el análisis). Apagado, igual que antes.
--   * analisis_calidad_de_lotes(): los análisis de unos lotes (Preparación
--     y la pantalla de Calidad).
--   * listar_analisis_calidad(): registros por rango de fechas.
-- Los rangos de Brix y acidez por sabor quedan para después (pendientes).
-- ============================================================

insert into roles (codigo, nombre) values ('CALIDAD', 'Analista de Calidad')
on conflict (codigo) do nothing;

insert into permisos (codigo, nombre) values ('LOTE_LIBERAR', 'Analizar y liberar lotes (Calidad)')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'LOTE_LIBERAR' from roles r where r.codigo in ('CALIDAD', 'JEFE_PRODUCCION')
on conflict do nothing;

-- ------------------------------------------------------------
-- Interruptor por área
-- ------------------------------------------------------------
alter table areas add column if not exists calidad_libera boolean not null default false;
update areas set calidad_libera = true where codigo = 'PRUEBAS';

-- ¿En el área de este turno libera Calidad?
create or replace function calidad_libera_en_turno(p_turno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select a.calidad_libera from turnos t join areas a on a.id = t.area_id where t.id = p_turno_id), false);
$$;

-- Para el front (qué muestra Preparación). Sin área: Aséptico.
create or replace function calidad_libera_area(p_area_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select calidad_libera from areas where codigo = coalesce(p_area_codigo, 'ASEPTICO')), false);
$$;

grant execute on function calidad_libera_en_turno(uuid) to anon, authenticated;
grant execute on function calidad_libera_area(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Tabla
-- ------------------------------------------------------------
create table analisis_calidad (
  id uuid primary key default gen_random_uuid(),
  preparacion_id uuid not null references preparaciones (id) on delete cascade,
  -- Turno en el que se hizo el análisis (el lote puede venir de un turno anterior).
  turno_id uuid not null references turnos (id) on delete cascade,
  brix numeric(5, 2) not null check (brix >= 0 and brix <= 100),
  acidez numeric(6, 3) not null check (acidez >= 0 and acidez <= 100),
  conforme boolean not null,
  observacion text,
  -- Analista. Se llama usuario_id para que auditar_cambio() lo tome como autor.
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

create index analisis_calidad_preparacion_idx on analisis_calidad (preparacion_id, created_at desc);
create index analisis_calidad_creado_idx on analisis_calidad (created_at);

alter table analisis_calidad enable row level security;

create trigger auditar_analisis_calidad after insert or update or delete on analisis_calidad
  for each row execute function auditar_cambio();

-- ------------------------------------------------------------
-- ¿Puede analizar y liberar en este turno? LOTE_LIBERAR, o el turno es del
-- Área de Pruebas.
-- ------------------------------------------------------------
create or replace function puede_liberar_lote(p_usuario text, p_turno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'LOTE_LIBERAR')
    or exists (
      select 1 from turnos t join areas a on a.id = t.area_id
      where t.id = p_turno_id and a.codigo = 'PRUEBAS'
    );
$$;

grant execute on function puede_liberar_lote(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- liberar_lote(): mismo efecto que su última versión
-- (20261082090000_turno_cerrado_gracia_y_correccion.sql). Con el
-- interruptor encendido suma dos reglas: permiso y análisis conforme.
-- ------------------------------------------------------------
create or replace function liberar_lote(p_usuario text, p_turno_id uuid, p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
  v_conforme boolean;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if calidad_libera_en_turno(p_turno_id) then
    if not puede_liberar_lote(p_usuario, p_turno_id) then
      raise exception 'Solo Calidad puede liberar lotes.';
    end if;
    if v_lote.id is null then
      raise exception 'No se encontró el lote.';
    end if;
    if v_lote.liberado_en is not null then
      raise exception 'Ese lote ya está liberado.';
    end if;

    select conforme into v_conforme
    from analisis_calidad
    where preparacion_id = p_lote_id
    order by created_at desc
    limit 1;
    if not coalesce(v_conforme, false) then
      raise exception 'El lote no tiene un análisis de Calidad conforme.';
    end if;
  end if;

  update preparaciones set liberado_en = now(), actualizada_por = v_usuario_id where id = p_lote_id and liberado_en is null;

  update recepcion_tanques
  set condicion = 'LISTO',
      sabor_id = v_lote.sabor_id,
      volumen_l = v_lote.volumen_l,
      lote = v_lote.lote,
      lote_id = p_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- registrar_analisis_calidad(): guarda el análisis y, si es conforme,
-- libera el lote. Devuelve turno_json (como las demás acciones de tanque).
-- ------------------------------------------------------------
create or replace function registrar_analisis_calidad(
  p_usuario text,
  p_turno_id uuid,
  p_lote_id uuid,
  p_brix numeric,
  p_acidez numeric,
  p_conforme boolean,
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
  v_observacion text := nullif(trim(coalesce(p_observacion, '')), '');
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
    raise exception 'Completa Brix, acidez y conformidad.';
  end if;
  if not p_conforme and v_observacion is null then
    raise exception 'Si no es conforme, escribe la observación.';
  end if;

  insert into analisis_calidad (preparacion_id, turno_id, brix, acidez, conforme, observacion, usuario_id)
  values (p_lote_id, p_turno_id, p_brix, p_acidez, p_conforme, v_observacion, v_usuario_id);

  if p_conforme then
    return liberar_lote(p_usuario, p_turno_id, p_lote_id);
  end if;
  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_analisis_calidad(text, uuid, uuid, numeric, numeric, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Análisis de unos lotes, del más nuevo al más viejo.
-- ------------------------------------------------------------
create or replace function analisis_calidad_de_lotes(p_lote_ids uuid[])
returns table (
  id uuid,
  preparacion_id uuid,
  brix numeric,
  acidez numeric,
  conforme boolean,
  observacion text,
  analista_nombre text,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ac.id, ac.preparacion_id, ac.brix, ac.acidez, ac.conforme, ac.observacion, u.nombre, ac.created_at
  from analisis_calidad ac
  join usuarios u on u.id = ac.usuario_id
  where ac.preparacion_id = any (p_lote_ids)
  order by ac.created_at desc;
$$;

grant execute on function analisis_calidad_de_lotes(uuid[]) to anon, authenticated;

-- ------------------------------------------------------------
-- Registros de Calidad por fecha de planta. Sin área: todo menos Pruebas.
-- ------------------------------------------------------------
create or replace function listar_analisis_calidad(
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
         ac.brix, ac.acidez, ac.conforme, ac.observacion, u.nombre
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

-- ===================== CHEQUEOS =====================
do $$
declare
  v_n int;
begin
  -- 1. Rol y permiso
  if not exists (select 1 from roles where codigo = 'CALIDAD') then
    raise exception 'FALLA 1: no se creó el rol CALIDAD';
  end if;
  select count(*) into v_n
  from rol_permisos rp join roles r on r.id = rp.rol_id
  where rp.permiso_codigo = 'LOTE_LIBERAR' and r.codigo in ('CALIDAD', 'JEFE_PRODUCCION');
  if v_n <> 2 then
    raise exception 'FALLA 1: LOTE_LIBERAR debería estar en CALIDAD y JEFE_PRODUCCION (hay %)', v_n;
  end if;
  if exists (select 1 from rol_permisos rp join roles r on r.id = rp.rol_id where rp.permiso_codigo = 'LOTE_LIBERAR' and r.codigo = 'SUPERVISOR') then
    raise exception 'FALLA 1: el SUPERVISOR no debería tener LOTE_LIBERAR';
  end if;

  -- 2. Un usuario inexistente no puede liberar ni registrar
  if puede_liberar_lote('no_existe_ensayo', gen_random_uuid()) then
    raise exception 'FALLA 2: un usuario inexistente puede liberar';
  end if;

  -- 3. Las lecturas responden (vacías)
  perform * from analisis_calidad_de_lotes(array[gen_random_uuid()]);
  perform * from listar_analisis_calidad('no_existe_ensayo', current_date, current_date, 'PRUEBAS');

  -- 4. Sin permiso, listar fuera de Pruebas falla
  begin
    perform * from listar_analisis_calidad('no_existe_ensayo', current_date, current_date, null);
    raise exception 'FALLA 4: listar sin permiso no falló';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;

  -- 5. Tabla con auditoría
  if not exists (select 1 from pg_trigger where tgname = 'auditar_analisis_calidad') then
    raise exception 'FALLA 5: falta el trigger de auditoría';
  end if;

  -- 6. Interruptor: nace encendido solo en Pruebas
  if exists (select 1 from areas where calidad_libera and codigo <> 'PRUEBAS') then
    raise exception 'FALLA 6: el interruptor solo debería nacer encendido en Pruebas';
  end if;
  if not calidad_libera_area('PRUEBAS') then
    raise exception 'FALLA 6: Pruebas debería nacer con el interruptor encendido';
  end if;
end;
$$;

do $$
begin
  raise exception 'ENSAYO OK: la migración 20261086 funciona (6 chequeos). No quedó nada aplicado.';
end;
$$;

rollback;
