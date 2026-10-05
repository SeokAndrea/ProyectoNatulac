-- ENSAYO (se puede borrar): aplica la migración 20261103 (Inventario diario de materia prima) + chequeos y DESHACE todo.
-- REQUIERE la migración 20261102 (auditoría) ya aplicada.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Crea una analista y un turno de prueba en el Área de Pruebas dentro de la transacción.

begin;

-- ===================== MIGRACIÓN 20261103090000_inventario_materia_prima.sql =====================
-- ============================================================
-- INVENTARIO DIARIO — materia prima, etapa 1 (tambores y kits)
-- ============================================================
-- Pedido 2026-10-05 (analista de producción): llevar el inventario de
-- pulpa/base del almacén y que lo que cargan los supervisores lo
-- consuma solo.
--
--   * Una fila por SABOR (tambores o kits, según el sabor — misma regla
--     que Preparación).
--   * La analista (o un jefe / supervisor) hace el "Inventario diario"
--     mañana y tarde: por cada sabor confirma lo que dice el sistema o
--     escribe lo que contó, y anota lo que llegó. Cada fila queda en
--     inventario_mp_conteos con lo que decía el sistema y la diferencia.
--   * Saldo = último conteo − tambores/kits de las preparaciones
--     creadas DESPUÉS de ese conteo (en el área). No hay un libro de
--     consumos: se calcula siempre de las preparaciones, así que si un
--     supervisor corrige los tambores de una preparación, el saldo se
--     corrige solo.
--   * Lo que llegó se anota en el mismo inventario diario: se suma a lo
--     que esperaba el sistema y NO cuenta como diferencia.
--
-- Fuera de esta etapa: material de empaque, los demás insumos de la
-- fórmula y avisos de stock bajo.
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
-- 2. Conteos
-- ------------------------------------------------------------
create table inventario_mp_conteos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  sabor_id uuid not null references sabores (id),
  -- Lo que calculaba el sistema justo antes de este conteo. null = primer conteo del sabor.
  sistema integer,
  -- Lo que llegó al almacén desde el conteo anterior (se suma; no es diferencia).
  llego integer not null default 0 check (llego >= 0),
  contado integer not null check (contado >= 0),
  -- contado − (sistema + llegó): negativo = faltante, positivo = sobrante. null en el primer conteo.
  diferencia integer,
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

alter table inventario_mp_conteos enable row level security;
create index inventario_mp_conteos_sabor_idx on inventario_mp_conteos (area_id, sabor_id, created_at desc);

-- ------------------------------------------------------------
-- 3. Área del inventario: Pruebas para los usuarios de Pruebas,
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
-- 4. Saldo por sabor (ayudante interno, no se llama desde la app)
-- ------------------------------------------------------------
create or replace function inventario_mp_saldos(p_area_id uuid)
returns table (
  sabor_id uuid,
  ultimo_id uuid,
  ultimo_en timestamptz,
  ultimo_contado integer,
  ultimo_llego integer,
  ultima_diferencia integer,
  ultimo_usuario_id uuid,
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
    select distinct on (c.sabor_id) c.*
    from inventario_mp_conteos c
    where c.area_id = p_area_id
    order by c.sabor_id, c.created_at desc
  ),
  consumo as (
    select p.sabor_id, sum(p.tambores)::integer as consumido, count(*)::integer as preparaciones
    from preparaciones p
    join turnos t on t.id = p.turno_id
    join ultimo u on u.sabor_id = p.sabor_id
    where t.area_id = p_area_id and p.created_at > u.created_at
    group by p.sabor_id
  )
  select u.sabor_id, u.id, u.created_at, u.contado, u.llego, u.diferencia, u.usuario_id,
         coalesce(c.consumido, 0), coalesce(c.preparaciones, 0),
         u.contado - coalesce(c.consumido, 0)
  from ultimo u
  left join consumo c on c.sabor_id = u.sabor_id;
$$;

-- ------------------------------------------------------------
-- 5. Listar: una fila por sabor activo (o con conteos en el área)
-- ------------------------------------------------------------
create or replace function listar_inventario_mp(p_usuario text, p_area_codigo text default null)
returns table (
  area_codigo text,
  sabor_id uuid,
  sabor_nombre text,
  sabor_base text,
  familia_nombre text,
  sabor_activo boolean,
  ultimo_en timestamptz,
  ultimo_por text,
  ultimo_contado integer,
  ultimo_llego integer,
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
begin
  return query
  select a.codigo, s.id, sabor_display(s.nombre, f.nombre), s.nombre, f.nombre, s.activo,
         sd.ultimo_en, u.nombre, sd.ultimo_contado, sd.ultimo_llego, sd.ultima_diferencia,
         sd.consumido, sd.preparaciones, sd.saldo
  from sabores s
  join familias_producto f on f.id = s.familia_id
  join areas a on a.id = v_area_id
  left join inventario_mp_saldos(v_area_id) sd on sd.sabor_id = s.id
  left join usuarios u on u.id = sd.ultimo_usuario_id
  where s.activo or sd.sabor_id is not null
  order by f.nombre, s.nombre;
end;
$$;

grant execute on function listar_inventario_mp(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Inventario diario: un conteo por sabor, todo junto
--    p_items: [{"sabor_id": "...", "contado": 28, "llego": 0}, ...]
-- ------------------------------------------------------------
create or replace function registrar_inventario_mp(p_usuario text, p_items jsonb, p_area_codigo text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_usuario_id uuid;
  v_item jsonb;
  v_sabor_id uuid;
  v_contado integer;
  v_llego integer;
  v_sistema integer;
  v_n integer := 0;
begin
  if not tiene_permiso(p_usuario, 'INVENTARIO_CARGAR') then
    raise exception 'No tienes permiso para cargar el inventario.';
  end if;
  v_area_id := area_de_inventario(p_usuario, p_area_codigo);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario) and activo;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay nada para guardar.';
  end if;

  perform set_config('app.audit_pagina', 'Inventario diario', true);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sabor_id := (v_item->>'sabor_id')::uuid;
    v_contado := (v_item->>'contado')::integer;
    v_llego := coalesce((v_item->>'llego')::integer, 0);
    if not exists (select 1 from sabores where id = v_sabor_id) then
      raise exception 'No se encontró uno de los sabores.';
    end if;
    if v_contado is null or v_contado < 0 or v_llego < 0 then
      raise exception 'Las cantidades no pueden estar vacías ni ser negativas.';
    end if;

    select sd.saldo into v_sistema from inventario_mp_saldos(v_area_id) sd where sd.sabor_id = v_sabor_id;

    insert into inventario_mp_conteos (area_id, sabor_id, sistema, llego, contado, diferencia, usuario_id)
    values (v_area_id, v_sabor_id, v_sistema, v_llego, v_contado,
            case when v_sistema is null then null else v_contado - (v_sistema + v_llego) end,
            v_usuario_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

grant execute on function registrar_inventario_mp(text, jsonb, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Historial de un sabor: conteos y preparaciones que consumieron
-- ------------------------------------------------------------
create or replace function historial_inventario_mp(p_usuario text, p_sabor_id uuid, p_dias integer default 7, p_area_codigo text default null)
returns table (
  tipo text,            -- 'CONTEO' | 'CONSUMO'
  en timestamptz,
  cantidad integer,     -- CONTEO: contado; CONSUMO: tambores/kits de la preparación
  sistema integer,
  llego integer,
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
    select 'CONTEO'::text, c.created_at, c.contado, c.sistema, c.llego, c.diferencia, null::text, u.nombre
    from inventario_mp_conteos c
    left join usuarios u on u.id = c.usuario_id
    where c.area_id = v_area_id and c.sabor_id = p_sabor_id and c.created_at >= v_desde
    union all
    select 'CONSUMO'::text, p.created_at, p.tambores, null::integer, null::integer, null::integer,
           concat_ws(' · ', 'Lote ' || p.lote, 'Turno ' || t.codigo, 'Tanque ' || p.numero_tanque), u.nombre
    from preparaciones p
    join turnos t on t.id = p.turno_id
    left join usuarios u on u.id = p.usuario_id
    where t.area_id = v_area_id and p.sabor_id = p_sabor_id and p.created_at >= v_desde
  ) h
  order by 2 desc;
end;
$$;

grant execute on function historial_inventario_mp(text, uuid, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Auditoría: trigger genérico + resumen legible del conteo.
--    auditar_cambio() re-emitido (última versión: 20261102) con el caso
--    de inventario_mp_conteos, y arreglado: el resumen se cortaba a 63
--    bytes porque el CASE terminaba en tg_table_name (tipo name).
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
    when 'inventario_mp_conteos' then 'Inventario · '
      || coalesce((select nombre from sabores where id = (v_row->>'sabor_id')::uuid), '?')
      || ' · contado ' || coalesce(v_row->>'contado', '?')
      || coalesce(' · llegó ' || nullif(v_row->>'llego', '0'), '')
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


drop trigger if exists auditar_inventario_mp_conteos on inventario_mp_conteos;
create trigger auditar_inventario_mp_conteos after insert or update or delete on inventario_mp_conteos
  for each row execute function auditar_cambio();

-- ===================== CHEQUEOS =====================
do $$
declare
  v_pr uuid := (select id from areas where codigo = 'PRUEBAS');
  v_as uuid := (select id from areas where codigo = 'ASEPTICO');
  v_sabor uuid := (select id from sabores where activo order by nombre limit 1);
  v_u uuid;
  v_m uuid;
  v_t uuid;
  v_t_as uuid;
  v_tipo text;
  v_p1 uuid;
  v_fila record;
  v_ok boolean;
  v_n integer := 0;
  v_resumen text;
  v_pagina text;
begin
  -- Preparación: una analista y alguien de Mantenimiento en Pruebas, y un turno de Pruebas.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  insert into usuarios (usuario, password_hash, nombre) values ('ens_inv', 'x', 'Analista Ensayo Inventario') returning id into v_u;
  insert into usuario_roles (usuario_id, rol_id, area_id) select v_u, r.id, v_pr from roles r where r.codigo = 'ANALISTA';
  insert into usuarios (usuario, password_hash, nombre) values ('ens_inv_mant', 'x', 'Mantenimiento Ensayo') returning id into v_m;
  insert into usuario_roles (usuario_id, rol_id, area_id) select v_m, r.id, v_pr from roles r where r.codigo = 'MANTENIMIENTO';
  v_tipo := (select tipo_codigo from turno_de_hora(now() at time zone 'America/Caracas'));
  v_t := abrir_turno(v_u, 'PRUEBAS', v_tipo, 'GRUPO_1', false);

  -- 1. El permiso quedó para Analista, Jefe y Supervisor.
  if (select count(*) from rol_permisos rp join roles r on r.id = rp.rol_id
      where rp.permiso_codigo = 'INVENTARIO_CARGAR' and r.codigo in ('ANALISTA', 'JEFE_PRODUCCION', 'SUPERVISOR')) <> 3 then
    raise exception 'ENSAYO FALLÓ (1): el permiso INVENTARIO_CARGAR no quedó en los 3 roles.';
  end if;
  v_n := v_n + 1;

  -- 2. Un usuario de Pruebas ve el inventario de Pruebas; sin conteo, el saldo está vacío.
  if area_de_inventario('ens_inv') <> v_pr then
    raise exception 'ENSAYO FALLÓ (2): el área del inventario no es Pruebas.';
  end if;
  select * into v_fila from listar_inventario_mp('ens_inv') where sabor_id = v_sabor;
  if v_fila.area_codigo <> 'PRUEBAS' or v_fila.saldo is not null then
    raise exception 'ENSAYO FALLÓ (2): sin conteo el saldo debería estar vacío (saldo=%).', v_fila.saldo;
  end if;
  v_n := v_n + 1;

  -- 3. Primer conteo: 40. No hay "sistema" ni diferencia todavía.
  perform registrar_inventario_mp('ens_inv', jsonb_build_array(jsonb_build_object('sabor_id', v_sabor, 'contado', 40)));
  if not exists (select 1 from inventario_mp_conteos where area_id = v_pr and sabor_id = v_sabor and contado = 40 and sistema is null and diferencia is null) then
    raise exception 'ENSAYO FALLÓ (3): el primer conteo no quedó bien.';
  end if;
  v_n := v_n + 1;

  -- 4. 3 preparaciones de 4 tambores DESPUÉS del conteo → saldo 28. Una de Aséptico no cuenta.
  update inventario_mp_conteos set created_at = now() - interval '2 hours' where area_id = v_pr and sabor_id = v_sabor;
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, created_at)
  values (v_t, 1, v_sabor, 'E1', 4, v_u, now() - interval '90 minutes') returning id into v_p1;
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, created_at)
  values (v_t, 2, v_sabor, 'E2', 4, v_u, now() - interval '60 minutes'),
         (v_t, 3, v_sabor, 'E3', 4, v_u, now() - interval '30 minutes');
  -- Antes del conteo: no cuenta.
  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, created_at)
  values (v_t, 1, v_sabor, 'E0', 7, v_u, now() - interval '3 hours');
  select id into v_t_as from turnos where area_id = v_as order by fecha desc limit 1;
  if v_t_as is not null then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, usuario_id, created_at)
    values (v_t_as, 1, v_sabor, 'EA', 9, v_u, now() - interval '20 minutes');
  end if;
  select * into v_fila from listar_inventario_mp('ens_inv') where sabor_id = v_sabor;
  if v_fila.saldo <> 28 or v_fila.consumido <> 12 or v_fila.preparaciones <> 3 then
    raise exception 'ENSAYO FALLÓ (4): esperaba saldo 28, consumido 12, 3 preparaciones (saldo=%, consumido=%, prep=%).',
      v_fila.saldo, v_fila.consumido, v_fila.preparaciones;
  end if;
  v_n := v_n + 1;

  -- 5. Si se corrigen los tambores de una preparación (4 → 5), el saldo se corrige solo.
  update preparaciones set tambores = 5 where id = v_p1;
  select * into v_fila from listar_inventario_mp('ens_inv') where sabor_id = v_sabor;
  if v_fila.saldo <> 27 then
    raise exception 'ENSAYO FALLÓ (5): esperaba saldo 27 tras corregir la preparación (saldo=%).', v_fila.saldo;
  end if;
  v_n := v_n + 1;

  -- 6. Inventario diario: llegaron 20, se cuentan 46 → el sistema esperaba 27 + 20 = 47 → faltante 1.
  perform registrar_inventario_mp('ens_inv', jsonb_build_array(jsonb_build_object('sabor_id', v_sabor, 'contado', 46, 'llego', 20)));
  if not exists (
    select 1 from inventario_mp_conteos
    where area_id = v_pr and sabor_id = v_sabor and contado = 46 and llego = 20 and sistema = 27 and diferencia = -1
  ) then
    raise exception 'ENSAYO FALLÓ (6): el inventario diario no guardó sistema 27 / llegó 20 / diferencia -1.';
  end if;
  select * into v_fila from listar_inventario_mp('ens_inv') where sabor_id = v_sabor;
  if v_fila.saldo <> 46 or v_fila.ultimo_llego <> 20 or v_fila.ultima_diferencia <> -1 or v_fila.ultimo_por <> 'Analista Ensayo Inventario' then
    raise exception 'ENSAYO FALLÓ (6): después del conteo el saldo debería ser 46 (saldo=%).', v_fila.saldo;
  end if;
  v_n := v_n + 1;

  -- 7. Historial: 2 conteos y las 4 preparaciones del área (no la de Aséptico).
  if (select count(*) from historial_inventario_mp('ens_inv', v_sabor) where tipo = 'CONTEO') <> 2
     or (select count(*) from historial_inventario_mp('ens_inv', v_sabor) where tipo = 'CONSUMO') <> 4
     or not exists (select 1 from historial_inventario_mp('ens_inv', v_sabor) where tipo = 'CONSUMO' and detalle like 'Lote E1 · Turno % · Tanque 1' and cantidad = 5) then
    raise exception 'ENSAYO FALLÓ (7): el historial no trae los 2 conteos y las 4 preparaciones del área.';
  end if;
  v_n := v_n + 1;

  -- 8. Sin permiso no se carga; cantidades negativas tampoco.
  v_ok := false;
  begin
    perform registrar_inventario_mp('ens_inv_mant', jsonb_build_array(jsonb_build_object('sabor_id', v_sabor, 'contado', 1)));
  exception when others then
    v_ok := sqlerrm like 'No tienes permiso para cargar el inventario%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (8): alguien sin permiso cargó el inventario.'; end if;
  v_ok := false;
  begin
    perform registrar_inventario_mp('ens_inv', jsonb_build_array(jsonb_build_object('sabor_id', v_sabor, 'contado', -3)));
  exception when others then
    v_ok := sqlerrm like 'Las cantidades no pueden%';
  end;
  if not v_ok then raise exception 'ENSAYO FALLÓ (8): aceptó un conteo negativo.'; end if;
  -- Pero sí puede mirar.
  if not exists (select 1 from listar_inventario_mp('ens_inv_mant') where sabor_id = v_sabor and saldo = 46) then
    raise exception 'ENSAYO FALLÓ (8): alguien sin permiso de carga no puede ver el inventario.';
  end if;
  v_n := v_n + 1;

  -- 9. Auditoría: el conteo queda con resumen legible y la página.
  select a.resumen, a.pagina into v_resumen, v_pagina from auditoria a
  where a.entidad = 'inventario_mp_conteos' and a.usuario = 'ens_inv' and a.despues->>'contado' = '46';
  if v_resumen not like 'Inventario · % · contado 46 · llegó 20 · diferencia -1' or v_pagina is distinct from 'Inventario diario' then
    raise exception 'ENSAYO FALLÓ (9): auditoría sin resumen o página (resumen=%, página=%).', v_resumen, v_pagina;
  end if;
  v_n := v_n + 1;

  raise exception 'ENSAYO OK: la migración 20261103 funciona (% chequeos). No quedó nada aplicado.', v_n;
end;
$$;

rollback;
