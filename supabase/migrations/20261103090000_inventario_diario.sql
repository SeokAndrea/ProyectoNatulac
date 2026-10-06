-- ============================================================
-- INVENTARIO DIARIO — materia prima y material de empaque (etapa 1)
-- ============================================================
-- Pedido 2026-10-05/06 (analista de producción):
--
--   * "Inventario de la mañana" / "de la tarde": cada uno queda guardado
--     (inventarios) con el momento, la hora y quién lo hizo, y adentro
--     sus conteos (inventario_conteos).
--   * Dos secciones:
--       MATERIA PRIMA — por sabor: Pulpa (tambores) y Kits.
--       MATERIAL DE EMPAQUE — lista fija (inventario_empaque): cajas por
--       presentación, tapas blancas / verdes, pitillos 200 / 250,
--       polistrech paletizado / manual.
--   * Solo la PULPA se descuenta sola: saldo = último conteo − tambores de
--     las preparaciones del sabor creadas DESPUÉS de ese conteo (en el
--     área). Se calcula de las preparaciones, así que si un supervisor
--     corrige los tambores de una, el saldo se corrige solo. Al contar,
--     queda lo que esperaba el sistema y la diferencia (faltante/sobrante).
--   * Kits y empaque: por ahora solo se cuentan (saldo = último conteo,
--     sin diferencia). Cómo se gastan se define después.
--
-- Fuera de esta etapa: consumo de kits y de empaque, insumos de la
-- fórmula, avisos de stock bajo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permiso
-- ------------------------------------------------------------
insert into permisos (codigo, nombre) values ('INVENTARIO_CARGAR', 'Cargar el Inventario diario')
on conflict (codigo) do nothing;

insert into rol_permisos (rol_id, permiso_codigo)
select r.id, 'INVENTARIO_CARGAR' from roles r
where r.codigo in ('ANALISTA', 'JEFE_PRODUCCION', 'SUPERVISOR')
on conflict do nothing;

-- ------------------------------------------------------------
-- 2. Material de empaque (lista fija; se edita con SQL por ahora)
-- ------------------------------------------------------------
create table inventario_empaque (
  codigo text primary key,
  nombre text not null,
  unidad text not null,
  orden integer not null,
  activo boolean not null default true
);

alter table inventario_empaque enable row level security;

insert into inventario_empaque (codigo, nombre, unidad, orden) values
  ('CAJAS_1000', 'Cajas 1000 ml', 'cajas', 10),
  ('CAJAS_500', 'Cajas 500 ml', 'cajas', 20),
  ('CAJAS_330', 'Cajas 330 ml', 'cajas', 30),
  ('CAJAS_250', 'Cajas 250 ml', 'cajas', 40),
  ('CAJAS_200', 'Cajas 200 ml', 'cajas', 50),
  ('TAPAS_BLANCAS', 'Tapas blancas', 'unidades', 60),
  ('TAPAS_VERDES', 'Tapas verdes', 'unidades', 70),
  ('PITILLOS_200', 'Pitillos 200', 'unidades', 80),
  ('PITILLOS_250', 'Pitillos 250', 'unidades', 90),
  ('POLISTRECH_PALETIZADO', 'Polistrech paletizado', 'rollos', 100),
  ('POLISTRECH_MANUAL', 'Polistrech manual', 'rollos', 110);

-- ------------------------------------------------------------
-- 3. Inventarios y sus conteos
-- ------------------------------------------------------------
create table inventarios (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  momento text not null check (momento in ('MANANA', 'TARDE')),
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

alter table inventarios enable row level security;
create index inventarios_area_idx on inventarios (area_id, created_at desc);

create table inventario_conteos (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventarios (id) on delete cascade,
  tipo text not null check (tipo in ('PULPA', 'KITS', 'EMPAQUE')),
  sabor_id uuid references sabores (id),
  empaque_codigo text references inventario_empaque (codigo),
  -- PULPA: lo que calculaba el sistema justo antes (null = primer conteo). KITS/EMPAQUE: null.
  sistema integer,
  contado integer not null check (contado >= 0),
  -- PULPA: contado − sistema (negativo = faltante). null en el primer conteo y en KITS/EMPAQUE.
  diferencia integer,
  -- Quién contó (mismo que el inventario): para Auditoría.
  usuario_id uuid not null references usuarios (id),
  check ((tipo = 'EMPAQUE' and empaque_codigo is not null and sabor_id is null)
      or (tipo <> 'EMPAQUE' and sabor_id is not null and empaque_codigo is null))
);

alter table inventario_conteos enable row level security;
create unique index inventario_conteos_item_unico on inventario_conteos (inventario_id, tipo, coalesce(sabor_id::text, empaque_codigo));
create index inventario_conteos_sabor_idx on inventario_conteos (tipo, sabor_id);

-- ------------------------------------------------------------
-- 4. Área del inventario: Pruebas para los usuarios de Pruebas,
--    Aséptico para el resto. El Super Administrador puede elegir.
-- ------------------------------------------------------------
create or replace function area_de_inventario(p_usuario text, p_area_codigo text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_codigo text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is null then
    raise exception 'Usuario no válido.';
  end if;
  v_codigo := case
    when v_rol = 'SUPERADMINISTRADOR' and p_area_codigo in ('ASEPTICO', 'PRUEBAS') then p_area_codigo
    when v_area = 'PRUEBAS' then 'PRUEBAS'
    else 'ASEPTICO'
  end;
  return (select id from areas where codigo = v_codigo);
end;
$$;

-- ------------------------------------------------------------
-- 5. Saldo por item (ayudante interno, no se llama desde la app).
--    item = 'PULPA:<sabor_id>' | 'KITS:<sabor_id>' | 'EMPAQUE:<codigo>'
-- ------------------------------------------------------------
create or replace function inventario_saldos(p_area_id uuid)
returns table (
  item text,
  tipo text,
  sabor_id uuid,
  empaque_codigo text,
  ultimo_en timestamptz,
  ultimo_usuario_id uuid,
  ultimo_momento text,
  ultimo_contado integer,
  ultima_diferencia integer,
  consumido integer,
  preparaciones integer,
  saldo integer
)
language sql
stable
security definer
set search_path = public
as $$
  with ultimo as (
    select distinct on (c.tipo, coalesce(c.sabor_id::text, c.empaque_codigo))
           c.tipo, c.sabor_id, c.empaque_codigo, c.contado, c.diferencia, i.created_at, i.usuario_id, i.momento
    from inventario_conteos c
    join inventarios i on i.id = c.inventario_id
    where i.area_id = p_area_id
    order by c.tipo, coalesce(c.sabor_id::text, c.empaque_codigo), i.created_at desc
  ),
  consumo as (
    select u.sabor_id, sum(p.tambores)::integer as consumido, count(*)::integer as preparaciones
    from ultimo u
    join preparaciones p on p.sabor_id = u.sabor_id and p.created_at > u.created_at
    join turnos t on t.id = p.turno_id and t.area_id = p_area_id
    where u.tipo = 'PULPA'
    group by u.sabor_id
  )
  select u.tipo || ':' || coalesce(u.sabor_id::text, u.empaque_codigo), u.tipo, u.sabor_id, u.empaque_codigo,
         u.created_at, u.usuario_id, u.momento, u.contado, u.diferencia,
         case when u.tipo = 'PULPA' then coalesce(c.consumido, 0) end,
         case when u.tipo = 'PULPA' then coalesce(c.preparaciones, 0) end,
         u.contado - coalesce(c.consumido, 0)
  from ultimo u
  left join consumo c on u.tipo = 'PULPA' and c.sabor_id = u.sabor_id;
$$;

-- ------------------------------------------------------------
-- 6. Listar: todos los items (pulpa y kits de cada sabor activo o con
--    conteos, y el empaque activo) con su saldo.
-- ------------------------------------------------------------
create or replace function listar_inventario(p_usuario text, p_area_codigo text default null)
returns table (
  area_codigo text,
  seccion text,          -- 'MATERIA_PRIMA' | 'EMPAQUE'
  item text,
  tipo text,             -- 'PULPA' | 'KITS' | 'EMPAQUE'
  sabor_id uuid,
  empaque_codigo text,
  nombre text,           -- sabor (con su familia) o item de empaque
  sabor_base text,
  familia_nombre text,
  unidad text,
  orden integer,
  ultimo_en timestamptz,
  ultimo_por text,
  ultimo_momento text,
  ultimo_contado integer,
  ultima_diferencia integer,
  consumido integer,
  preparaciones integer,
  saldo integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_area_id uuid := area_de_inventario(p_usuario, p_area_codigo);
  v_area_codigo text := (select codigo from areas where id = v_area_id);
begin
  return query
  with items as (
    select 'MATERIA_PRIMA'::text as seccion, t.tipo, s.id as sabor_id, null::text as empaque_codigo,
           sabor_display(s.nombre, f.nombre) as nombre, s.nombre as sabor_base, f.nombre as familia_nombre,
           case t.tipo when 'PULPA' then 'tambores' else 'kits' end as unidad, 0 as orden
    from sabores s
    join familias_producto f on f.id = s.familia_id
    cross join (values ('PULPA'), ('KITS')) as t (tipo)
    where s.activo or exists (
      select 1 from inventario_conteos c join inventarios i on i.id = c.inventario_id
      where c.sabor_id = s.id and i.area_id = v_area_id
    )
    union all
    select 'EMPAQUE', 'EMPAQUE', null, e.codigo, e.nombre, null, null, e.unidad, e.orden
    from inventario_empaque e
    where e.activo
  )
  select v_area_codigo, it.seccion, it.tipo || ':' || coalesce(it.sabor_id::text, it.empaque_codigo), it.tipo,
         it.sabor_id, it.empaque_codigo, it.nombre, it.sabor_base, it.familia_nombre, it.unidad, it.orden,
         sd.ultimo_en, u.nombre, sd.ultimo_momento, sd.ultimo_contado, sd.ultima_diferencia,
         sd.consumido, sd.preparaciones, sd.saldo
  from items it
  left join inventario_saldos(v_area_id) sd on sd.item = it.tipo || ':' || coalesce(it.sabor_id::text, it.empaque_codigo)
  left join usuarios u on u.id = sd.ultimo_usuario_id
  order by it.seccion desc, it.orden, it.familia_nombre, it.nombre, it.tipo desc;
end;
$$;

grant execute on function listar_inventario(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Guardar un inventario (de la mañana o de la tarde)
--    p_items: [{"tipo": "PULPA", "sabor_id": "...", "contado": 28},
--              {"tipo": "EMPAQUE", "empaque_codigo": "CAJAS_1000", "contado": 500}, ...]
-- ------------------------------------------------------------
create or replace function registrar_inventario(
  p_usuario text,
  p_momento text,
  p_items jsonb,
  p_area_codigo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_usuario_id uuid;
  v_inventario_id uuid;
  v_item jsonb;
  v_tipo text;
  v_sabor_id uuid;
  v_empaque text;
  v_contado integer;
  v_sistema integer;
begin
  if not tiene_permiso(p_usuario, 'INVENTARIO_CARGAR') then
    raise exception 'No tienes permiso para cargar el inventario.';
  end if;
  v_area_id := area_de_inventario(p_usuario, p_area_codigo);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario) and activo;
  if p_momento is null or p_momento not in ('MANANA', 'TARDE') then
    raise exception 'Elige si es el inventario de la mañana o de la tarde.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada para guardar.';
  end if;

  perform set_config('app.audit_pagina', 'Inventario diario', true);

  insert into inventarios (area_id, momento, usuario_id) values (v_area_id, p_momento, v_usuario_id)
  returning id into v_inventario_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tipo := v_item->>'tipo';
    v_sabor_id := nullif(v_item->>'sabor_id', '')::uuid;
    v_empaque := nullif(v_item->>'empaque_codigo', '');
    v_contado := (v_item->>'contado')::integer;

    if v_tipo in ('PULPA', 'KITS') then
      if v_sabor_id is null or not exists (select 1 from sabores where id = v_sabor_id) then
        raise exception 'No se encontró uno de los sabores.';
      end if;
      v_empaque := null;
    elsif v_tipo = 'EMPAQUE' then
      if v_empaque is null or not exists (select 1 from inventario_empaque where codigo = v_empaque) then
        raise exception 'No se encontró uno de los materiales de empaque.';
      end if;
      v_sabor_id := null;
    else
      raise exception 'Tipo de item no válido.';
    end if;
    if v_contado is null or v_contado < 0 then
      raise exception 'Las cantidades no pueden estar vacías ni ser negativas.';
    end if;

    v_sistema := null;
    if v_tipo = 'PULPA' then
      select sd.saldo into v_sistema from inventario_saldos(v_area_id) sd where sd.item = 'PULPA:' || v_sabor_id::text;
    end if;

    begin
      insert into inventario_conteos (inventario_id, tipo, sabor_id, empaque_codigo, sistema, contado, diferencia, usuario_id)
      values (v_inventario_id, v_tipo, v_sabor_id, v_empaque, v_sistema, v_contado,
              case when v_sistema is null then null else v_contado - v_sistema end, v_usuario_id);
    exception when unique_violation then
      raise exception 'Un mismo item aparece dos veces en el inventario.';
    end;
  end loop;

  return v_inventario_id;
end;
$$;

grant execute on function registrar_inventario(text, text, jsonb, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Inventarios recientes (para ver cuándo se hizo el de la mañana / tarde)
-- ------------------------------------------------------------
create or replace function listar_inventarios(p_usuario text, p_dias integer default 7, p_area_codigo text default null)
returns table (
  id uuid,
  momento text,
  en timestamptz,
  usuario_nombre text,
  items integer,
  faltantes integer,
  sobrantes integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_area_id uuid := area_de_inventario(p_usuario, p_area_codigo);
begin
  return query
  select i.id, i.momento, i.created_at, u.nombre,
         count(c.id)::integer,
         count(c.id) filter (where c.diferencia < 0)::integer,
         count(c.id) filter (where c.diferencia > 0)::integer
  from inventarios i
  left join usuarios u on u.id = i.usuario_id
  left join inventario_conteos c on c.inventario_id = i.id
  where i.area_id = v_area_id
    and i.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)))
  group by i.id, u.nombre
  order by i.created_at desc;
end;
$$;

grant execute on function listar_inventarios(text, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Historial de un item: sus conteos y (pulpa) las preparaciones que descontaron
-- ------------------------------------------------------------
create or replace function historial_inventario(
  p_usuario text,
  p_tipo text,
  p_sabor_id uuid default null,
  p_empaque_codigo text default null,
  p_dias integer default 7,
  p_area_codigo text default null
)
returns table (
  movimiento text,      -- 'CONTEO' | 'CONSUMO'
  en timestamptz,
  momento text,         -- CONTEO: 'MANANA' | 'TARDE'
  cantidad integer,     -- CONTEO: contado; CONSUMO: tambores de la preparación
  sistema integer,
  diferencia integer,
  detalle text,         -- CONSUMO: "Lote 0003 · Turno T1-0510 · Tanque 2"
  usuario_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_area_id uuid := area_de_inventario(p_usuario, p_area_codigo);
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)));
begin
  return query
  select * from (
    select 'CONTEO'::text, i.created_at, i.momento, c.contado, c.sistema, c.diferencia, null::text, u.nombre
    from inventario_conteos c
    join inventarios i on i.id = c.inventario_id
    left join usuarios u on u.id = i.usuario_id
    where i.area_id = v_area_id and c.tipo = p_tipo and i.created_at >= v_desde
      and c.sabor_id is not distinct from p_sabor_id and c.empaque_codigo is not distinct from p_empaque_codigo
    union all
    select 'CONSUMO'::text, p.created_at, null::text, p.tambores, null::integer, null::integer,
           concat_ws(' · ', 'Lote ' || p.lote, 'Turno ' || t.codigo, 'Tanque ' || p.numero_tanque), u.nombre
    from preparaciones p
    join turnos t on t.id = p.turno_id
    left join usuarios u on u.id = p.usuario_id
    where p_tipo = 'PULPA' and t.area_id = v_area_id and p.sabor_id = p_sabor_id and p.created_at >= v_desde
  ) h
  order by 2 desc;
end;
$$;

grant execute on function historial_inventario(text, text, uuid, text, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 10. Auditoría: trigger genérico en los inventarios y sus conteos +
--     resumen legible. auditar_cambio() re-emitido (última versión:
--     20261102) con esos casos, y arreglado: el resumen se cortaba a 63
--     bytes porque el CASE terminaba en tg_table_name (tipo name).
-- ------------------------------------------------------------

create or replace function auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_usuario_id uuid;
  v_usuario text;
  v_accion text := case tg_op when 'INSERT' then 'CREAR' when 'UPDATE' then 'EDITAR' else 'ELIMINAR' end;
  v_resumen text;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_k text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  v_usuario_id := coalesce(
    v_row->>'actualizada_por',
    v_row->>'usuario_id',
    v_row->>'activada_por',
    v_row->>'supervisor_id',
    v_row->>'editado_por',
    v_row->>'confirmado_inicio_por',
    v_row->>'confirmado_fin_por',
    v_row->>'generado_por'
  )::uuid;
  select usuario into v_usuario from usuarios where id = v_usuario_id;

  -- Sólo columnas legibles: se descartan ids (*_id), autores (*_por),
  -- timestamps de estado (*_en) y blobs internos.
  for v_k in select jsonb_object_keys(v_row) loop
    if v_k in ('id', 'created_at', 'updated_at', 'volumenes_lote_cierre', 'tanques_encontrados')
       or v_k ~ '_(id|por|en)$' then
      continue;
    end if;

    if tg_op = 'UPDATE' then
      if v_new->v_k is distinct from v_old->v_k then
        v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
        v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
      end if;
    elsif tg_op = 'INSERT' then
      v_despues := v_despues || jsonb_build_object(v_k, v_new->v_k);
    else
      v_antes := v_antes || jsonb_build_object(v_k, v_old->v_k);
    end if;
  end loop;

  -- UPDATE que sólo tocó columnas de ruido → no se audita.
  if tg_op = 'UPDATE' and v_despues = '{}'::jsonb then
    return null;
  end if;

  v_resumen := case tg_table_name
    when 'turnos' then 'Turno ' || coalesce(v_row->>'codigo', '')
    when 'turno_lineas' then 'Corrida de línea'
    when 'recepcion_tanques' then 'Tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || ' → ' || coalesce(v_row->>'condicion', '?')
    when 'preparaciones' then 'Preparación · tanque ' || coalesce(v_row->>'numero_tanque', '?')
      || coalesce(' · lote ' || (v_row->>'lote'), '')
    when 'reservas_tobos' then 'Desvase / reserva'
    when 'velocidades_llenadora' then 'Catálogo · velocidad de llenadora'
    when 'sabores' then 'Catálogo · sabor ' || coalesce(v_row->>'nombre', '')
    when 'presentaciones' then 'Catálogo · presentación ' || coalesce(v_row->>'volumen_ml', '') || ' ml'
    when 'lineas' then 'Catálogo · línea ' || coalesce(v_row->>'codigo', '')
    when 'familias_producto' then 'Catálogo · familia ' || coalesce(v_row->>'nombre', '')
    when 'tipos_bobina' then 'Catálogo · tipo de bobina ' || coalesce(v_row->>'nombre', '')
    when 'formula_variantes' then 'Catálogo · fórmula ' || coalesce(v_row->>'nombre', '')
    when 'formula_insumos' then 'Catálogo · insumo de fórmula ' || coalesce(v_row->>'insumo', '')
    when 'tipos_conteo_peso' then 'Catálogo · tipo de conteo por peso ' || coalesce(v_row->>'nombre', '')
    when 'lineas_estado' then 'Condición de '
      || coalesce((select nombre from lineas where id = (v_row->>'linea_id')::uuid), 'línea')
      || ' → ' || coalesce(v_row->>'condicion', '?')
    when 'transferencias' then 'Transferencia · tanque ' || coalesce(v_row->>'tanque_origen', '?')
      || ' → ' || coalesce(v_row->>'tanque_destino', '?')
      || ' · ' || coalesce(v_row->>'litros', '?') || ' L'
    when 'preparaciones_ajuste' then 'Ajuste de volumen'
      || coalesce(' · tanque ' || (select numero_tanque::text from preparaciones where id = (v_row->>'lote_id')::uuid), '')
      || coalesce(' · lote ' || (select lote from preparaciones where id = (v_row->>'lote_id')::uuid), '')
      || coalesce(' · diferencia ' || (v_row->>'diferencia') || ' L', '')
    when 'actas' then 'Acta ' || coalesce(v_row->>'codigo', '') || ' v' || coalesce(v_row->>'version', '?')
      || ' · ' || coalesce(v_row->>'estado', '')
    when 'turno_responsables' then 'Responsable del turno · '
      || coalesce((select nombre from usuarios where id = (v_row->>'usuario_id')::uuid), '?')
      || ' (' || coalesce(v_row->>'motivo', '?') || ')'
    when 'inventarios' then 'Inventario de la '
      || case v_row->>'momento' when 'MANANA' then 'mañana' else 'tarde' end
    when 'inventario_conteos' then 'Inventario · '
      || case v_row->>'tipo'
           when 'EMPAQUE' then coalesce((select nombre from inventario_empaque where codigo = v_row->>'empaque_codigo'), '?')
           else initcap(lower(v_row->>'tipo')) || ' ' || coalesce((select nombre from sabores where id = (v_row->>'sabor_id')::uuid), '?')
         end
      || ' · contado ' || coalesce(v_row->>'contado', '?')
      || coalesce(' · diferencia ' || (v_row->>'diferencia'), '')
    -- ::text: sin esto el CASE entero toma el tipo `name` de tg_table_name y
    -- recorta el resumen a 63 bytes (pasaba con los resúmenes largos).
    else tg_table_name::text
  end;

  insert into auditoria (usuario_id, usuario, accion, entidad, entidad_id, pagina, resumen, antes, despues)
  values (
    v_usuario_id,
    v_usuario,
    v_accion,
    tg_table_name,
    v_row->>'id',
    nullif(current_setting('app.audit_pagina', true), ''),
    v_resumen,
    case when v_antes = '{}'::jsonb then null else v_antes end,
    case when v_despues = '{}'::jsonb then null else v_despues end
  );

  return null;
end;
$$;


drop trigger if exists auditar_inventarios on inventarios;
create trigger auditar_inventarios after insert or update or delete on inventarios
  for each row execute function auditar_cambio();

drop trigger if exists auditar_inventario_conteos on inventario_conteos;
create trigger auditar_inventario_conteos after insert or update or delete on inventario_conteos
  for each row execute function auditar_cambio();
