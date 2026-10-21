-- ============================================================
-- EDICIÓN DE DATOS: guardar con permiso, autor y Auditoría
-- ============================================================
-- Dueña, 2026-10-21 (rework de Edición de Datos para la Analista).
--
-- Las funciones viejas de los catálogos (crear_sabor, editar_sabor,
-- editar_presentacion, editar_velocidad, editar_linea, desactivar_*…) no
-- pedían usuario: cualquiera con la URL y la clave anon cambiaba un
-- catálogo y la Auditoría lo anotaba sin autor. Se reemplazan por tres
-- funciones con p_usuario y el permiso EDICION_DATOS:
--
--   * listar_catalogo_edicion(usuario, catalogo)       → filas (jsonb), con quién y cuándo las cambió
--   * guardar_catalogo(usuario, catalogo, id, valores) → crea (id null) o edita
--   * cambiar_activo_catalogo(usuario, catalogo, id, activo)
--
-- Catálogos: sabores, presentaciones, velocidades_llenadora, lineas,
-- tipos_bobina (Calculadora de Bobina) y tipos_conteo_peso (Conteo por
-- peso). Cada tabla suma editado_por / editado_en: el trigger auditar_cambio
-- ya toma el autor de editado_por y la página de app.audit_pagina, así que
-- cada cambio queda en Auditoría con nombre, sin un registro aparte.
--
-- Qué se puede cambiar:
--   * sabores: familia, nombre, volumen.
--   * presentaciones: todo menos el volumen (ml), que solo se pone al crear
--     (el resto de la app se apoya en él: se crea otra y se desactiva).
--   * velocidades: línea, presentación, máquina, envases/h y litros/h.
--   * lineas: solo el nombre (el código no; no se crean desde acá).
--   * tipos_bobina: nombre, diámetro del core, espesor, largo del envase,
--     redondeo.
--   * tipos_conteo_peso: nombre, peso vacío, peso por unidad, redondeo.
--
-- Después de aplicar, las funciones viejas quedan sin permiso para la app
-- (anon/authenticated): la pantalla nueva usa solo estas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Quién y cuándo
-- ------------------------------------------------------------
alter table sabores               add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table sabores               add column if not exists editado_en timestamptz;
alter table presentaciones        add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table presentaciones        add column if not exists editado_en timestamptz;
alter table velocidades_llenadora add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table velocidades_llenadora add column if not exists editado_en timestamptz;
alter table lineas                add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table lineas                add column if not exists editado_en timestamptz;
alter table tipos_bobina          add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table tipos_bobina          add column if not exists editado_en timestamptz;
alter table tipos_conteo_peso     add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table tipos_conteo_peso     add column if not exists editado_en timestamptz;

-- ------------------------------------------------------------
-- 2. Permiso y nombre de tabla
-- ------------------------------------------------------------
create or replace function exigir_edicion_datos(p_usuario text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not coalesce(tiene_permiso(p_usuario, 'EDICION_DATOS'), false) then
    raise exception 'No tienes permiso para editar datos.';
  end if;
  select id into v_id from usuarios where usuario = lower(p_usuario);
  return v_id;
end;
$$;
revoke execute on function exigir_edicion_datos(text) from public, anon, authenticated;

create or replace function tabla_de_catalogo(p_catalogo text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_catalogo
    when 'sabores' then 'sabores'
    when 'presentaciones' then 'presentaciones'
    when 'velocidades' then 'velocidades_llenadora'
    when 'lineas' then 'lineas'
    when 'bobinas' then 'tipos_bobina'
    when 'conteo' then 'tipos_conteo_peso'
  end;
$$;
revoke execute on function tabla_de_catalogo(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Listar (con autor del último cambio)
-- ------------------------------------------------------------
create or replace function listar_catalogo_edicion(p_usuario text, p_catalogo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla text := tabla_de_catalogo(p_catalogo);
  v_orden text;
  v_res jsonb;
begin
  perform exigir_edicion_datos(p_usuario);
  if v_tabla is null then
    raise exception 'Catálogo desconocido: %', p_catalogo;
  end if;
  v_orden := case p_catalogo
    when 'presentaciones' then 't.volumen_ml desc'
    when 'velocidades' then 't.envases_hora'
    when 'lineas' then 't.codigo'
    else 't.nombre'
  end;
  execute format(
    $q$select coalesce(jsonb_agg(
         to_jsonb(t) || jsonb_build_object('editado_por_nombre', nullif(trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), ''))
         order by %s), '[]'::jsonb)
       from %I t left join usuarios u on u.id = t.editado_por$q$,
    v_orden, v_tabla)
  into v_res;
  return v_res;
end;
$$;
grant execute on function listar_catalogo_edicion(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Guardar (crear con p_id null, o editar)
-- ------------------------------------------------------------
create or replace function guardar_catalogo(
  p_usuario text,
  p_catalogo text,
  p_id uuid,
  p_valores jsonb,
  p_pagina text default 'Edición de Datos'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := exigir_edicion_datos(p_usuario);
  d jsonb := coalesce(p_valores, '{}'::jsonb);
  v_id uuid;
  v_nombre text := nullif(trim(d->>'nombre'), '');
begin
  perform set_config('app.audit_pagina', coalesce(p_pagina, 'Edición de Datos'), true);

  if p_catalogo = 'sabores' then
    if v_nombre is null then raise exception 'Escribe el nombre del sabor.'; end if;
    if nullif(d->>'familia_id', '') is null then raise exception 'Elige la familia.'; end if;
    if p_id is null then
      insert into sabores (familia_id, nombre, volumen, editado_por, editado_en)
      values ((d->>'familia_id')::uuid, v_nombre, nullif(d->>'volumen', '')::numeric, v, now())
      returning id into v_id;
    else
      update sabores
      set familia_id = (d->>'familia_id')::uuid, nombre = v_nombre, volumen = nullif(d->>'volumen', '')::numeric,
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'presentaciones' then
    if coalesce((d->>'cajas_x_camada')::integer, 0) <= 0 or coalesce((d->>'cant_camada')::integer, 0) <= 0
       or coalesce((d->>'cajas_x_paleta')::integer, 0) <= 0 or coalesce((d->>'litros_x_caja')::numeric, 0) <= 0
       or coalesce((d->>'envases_x_caja')::integer, 0) <= 0 then
      raise exception 'Completa todos los números de la presentación (mayores que 0).';
    end if;
    if p_id is null then
      if coalesce((d->>'volumen_ml')::integer, 0) <= 0 then raise exception 'Escribe el volumen en ml.'; end if;
      insert into presentaciones (volumen_ml, cajas_x_camada, cant_camada, cajas_x_paleta, litros_x_caja, envases_x_caja, editado_por, editado_en)
      values ((d->>'volumen_ml')::integer, (d->>'cajas_x_camada')::integer, (d->>'cant_camada')::integer,
              (d->>'cajas_x_paleta')::integer, (d->>'litros_x_caja')::numeric, (d->>'envases_x_caja')::integer, v, now())
      returning id into v_id;
    else
      -- El volumen (ml) no se cambia: lo usa el resto de la app como código.
      update presentaciones
      set cajas_x_camada = (d->>'cajas_x_camada')::integer, cant_camada = (d->>'cant_camada')::integer,
          cajas_x_paleta = (d->>'cajas_x_paleta')::integer, litros_x_caja = (d->>'litros_x_caja')::numeric,
          envases_x_caja = (d->>'envases_x_caja')::integer, editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'velocidades' then
    if nullif(d->>'linea_id', '') is null or nullif(d->>'presentacion_id', '') is null then
      raise exception 'Elige la línea y la presentación.';
    end if;
    if nullif(trim(d->>'maquina'), '') is null then raise exception 'Escribe la máquina.'; end if;
    if coalesce((d->>'envases_hora')::integer, 0) <= 0 or coalesce((d->>'litros_hora')::numeric, 0) <= 0 then
      raise exception 'Escribe envases por hora y litros por hora (mayores que 0).';
    end if;
    if p_id is null then
      insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora, editado_por, editado_en)
      values ((d->>'linea_id')::uuid, (d->>'presentacion_id')::uuid, trim(d->>'maquina'),
              (d->>'envases_hora')::integer, (d->>'litros_hora')::numeric, v, now())
      returning id into v_id;
    else
      update velocidades_llenadora
      set linea_id = (d->>'linea_id')::uuid, presentacion_id = (d->>'presentacion_id')::uuid, maquina = trim(d->>'maquina'),
          envases_hora = (d->>'envases_hora')::integer, litros_hora = (d->>'litros_hora')::numeric,
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'lineas' then
    if p_id is null then raise exception 'Las líneas no se crean desde Edición de Datos.'; end if;
    if v_nombre is null then raise exception 'Escribe el nombre de la línea.'; end if;
    update lineas set nombre = v_nombre, editado_por = v, editado_en = now()
    where id = p_id
    returning id into v_id;

  elsif p_catalogo = 'bobinas' then
    if v_nombre is null then raise exception 'Escribe el nombre del tipo de bobina.'; end if;
    if coalesce((d->>'diametro_core_cm')::numeric, 0) <= 0 or coalesce((d->>'espesor_cm')::numeric, 0) <= 0
       or coalesce((d->>'largo_envase_cm')::numeric, 0) <= 0 then
      raise exception 'Escribe el diámetro del core, el espesor y el largo del envase (mayores que 0).';
    end if;
    if p_id is null then
      insert into tipos_bobina (nombre, diametro_core_cm, espesor_cm, largo_envase_cm, redondear_hacia_arriba, editado_por, editado_en)
      values (v_nombre, (d->>'diametro_core_cm')::numeric, (d->>'espesor_cm')::numeric, (d->>'largo_envase_cm')::numeric,
              coalesce((d->>'redondear_hacia_arriba')::boolean, true), v, now())
      returning id into v_id;
    else
      update tipos_bobina
      set nombre = v_nombre, diametro_core_cm = (d->>'diametro_core_cm')::numeric, espesor_cm = (d->>'espesor_cm')::numeric,
          largo_envase_cm = (d->>'largo_envase_cm')::numeric,
          redondear_hacia_arriba = coalesce((d->>'redondear_hacia_arriba')::boolean, redondear_hacia_arriba),
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'conteo' then
    if v_nombre is null then raise exception 'Escribe el nombre del tipo.'; end if;
    if (d->>'peso_vacio_kg') is null or (d->>'peso_vacio_kg')::numeric < 0 or coalesce((d->>'peso_unidad_g')::numeric, 0) <= 0 then
      raise exception 'Escribe el peso vacío y el peso por unidad (mayor que 0).';
    end if;
    if coalesce(d->>'redondeo', '') not in ('ARRIBA', 'ABAJO') then
      raise exception 'Elige el redondeo.';
    end if;
    if p_id is null then
      insert into tipos_conteo_peso (nombre, peso_vacio_kg, peso_unidad_g, redondeo, editado_por, editado_en)
      values (v_nombre, (d->>'peso_vacio_kg')::numeric, (d->>'peso_unidad_g')::numeric, d->>'redondeo', v, now())
      returning id into v_id;
    else
      update tipos_conteo_peso
      set nombre = v_nombre, peso_vacio_kg = (d->>'peso_vacio_kg')::numeric, peso_unidad_g = (d->>'peso_unidad_g')::numeric,
          redondeo = d->>'redondeo', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  else
    raise exception 'Catálogo desconocido: %', p_catalogo;
  end if;

  if v_id is null then
    raise exception 'Ese registro ya no existe. Recarga la página.';
  end if;
  return v_id;
end;
$$;
grant execute on function guardar_catalogo(text, text, uuid, jsonb, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Activar / desactivar
-- ------------------------------------------------------------
create or replace function cambiar_activo_catalogo(
  p_usuario text,
  p_catalogo text,
  p_id uuid,
  p_activo boolean,
  p_pagina text default 'Edición de Datos'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := exigir_edicion_datos(p_usuario);
  v_tabla text := tabla_de_catalogo(p_catalogo);
  v_n integer;
begin
  if v_tabla is null then
    raise exception 'Catálogo desconocido: %', p_catalogo;
  end if;
  perform set_config('app.audit_pagina', coalesce(p_pagina, 'Edición de Datos'), true);
  execute format('update %I set activo = $1, editado_por = $2, editado_en = now() where id = $3', v_tabla)
  using coalesce(p_activo, true), v, p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ese registro ya no existe. Recarga la página.';
  end if;
end;
$$;
grant execute on function cambiar_activo_catalogo(text, text, uuid, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Las funciones viejas, sin permiso para la app
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'crear_sabor', 'editar_sabor', 'desactivar_sabor', 'reactivar_sabor',
        'crear_presentacion', 'editar_presentacion', 'desactivar_presentacion', 'reactivar_presentacion',
        'crear_velocidad', 'editar_velocidad', 'desactivar_velocidad', 'reactivar_velocidad',
        'editar_linea', 'desactivar_linea', 'reactivar_linea'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();
