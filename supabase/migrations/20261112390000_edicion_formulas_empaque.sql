-- ============================================================
-- EDICIÓN DE DATOS: fórmulas, insumos y material de empaque
-- ============================================================
-- Dueña, 2026-10-26: la Analista edita todo lo que pueda desde Edición de
-- Datos, "tal cual" los otros catálogos (permiso EDICION_DATOS, autor y
-- Auditoría). Tres catálogos nuevos en las mismas tres funciones de
-- 20261111490000:
--
--   * formulas → formula_variantes: familia, sabor y si va por tambor o kit.
--   * insumos  → formula_insumos: fórmula, insumo (micro), cantidad y unidad.
--     Ahora se pueden desactivar: la Calculadora de Fórmula usa solo los activos.
--   * empaque  → inventario_empaque (Inventario diario, 20261112290000):
--     nombre, unidad y orden. El código se arma solo al crear y no cambia
--     (lo usan los conteos guardados). Gana un id para editar/desactivar.
--
-- Va después de 20261112290000_inventario_diario.sql (usa inventario_empaque).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas: quién y cuándo, activo en insumos, id en empaque
-- ------------------------------------------------------------
alter table formula_variantes  add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table formula_variantes  add column if not exists editado_en timestamptz;
alter table formula_insumos    add column if not exists activo boolean not null default true;
alter table formula_insumos    add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table formula_insumos    add column if not exists editado_en timestamptz;
alter table inventario_empaque add column if not exists id uuid not null default gen_random_uuid();
alter table inventario_empaque add column if not exists editado_por uuid references usuarios (id) on delete set null;
alter table inventario_empaque add column if not exists editado_en timestamptz;
create unique index if not exists inventario_empaque_id_unico on inventario_empaque (id);

drop trigger if exists auditar_inventario_empaque on inventario_empaque;
create trigger auditar_inventario_empaque after insert or update or delete on inventario_empaque
  for each row execute function auditar_cambio();

-- ------------------------------------------------------------
-- 2. Nombre de tabla y orden de cada catálogo
-- ------------------------------------------------------------
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
    when 'formulas' then 'formula_variantes'
    when 'insumos' then 'formula_insumos'
    when 'empaque' then 'inventario_empaque'
  end;
$$;
revoke execute on function tabla_de_catalogo(text) from public, anon, authenticated;

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
    when 'formulas' then 't.familia, t.nombre'
    when 'insumos' then 't.insumo'
    when 'empaque' then 't.orden, t.nombre'
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
-- 3. Guardar: igual que 20261111490000 + formulas, insumos y empaque
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
  v_codigo text;
  v_n integer;
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

  elsif p_catalogo = 'formulas' then
    if v_nombre is null then raise exception 'Escribe el sabor de la fórmula.'; end if;
    if coalesce(d->>'familia', '') not in ('CLASICOS', 'PREMIUM', 'TE') then raise exception 'Elige la familia.'; end if;
    if coalesce(d->>'unidad_base', '') not in ('tambor', 'kit') then raise exception 'Elige si la fórmula es por tambor o por kit.'; end if;
    if p_id is null then
      insert into formula_variantes (familia, nombre, unidad_base, editado_por, editado_en)
      values (d->>'familia', v_nombre, d->>'unidad_base', v, now())
      returning id into v_id;
    else
      update formula_variantes
      set familia = d->>'familia', nombre = v_nombre, unidad_base = d->>'unidad_base', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'insumos' then
    if nullif(d->>'variante_id', '') is null then raise exception 'Elige la fórmula.'; end if;
    if nullif(trim(d->>'insumo'), '') is null then raise exception 'Escribe el insumo.'; end if;
    if coalesce((d->>'cantidad')::numeric, 0) <= 0 then raise exception 'Escribe la cantidad (mayor que 0).'; end if;
    if coalesce(d->>'unidad', '') not in ('kg', 'L') then raise exception 'Elige la unidad (kg o L).'; end if;
    if p_id is null then
      insert into formula_insumos (variante_id, insumo, cantidad, unidad, editado_por, editado_en)
      values ((d->>'variante_id')::uuid, trim(d->>'insumo'), (d->>'cantidad')::numeric, d->>'unidad', v, now())
      returning id into v_id;
    else
      update formula_insumos
      set variante_id = (d->>'variante_id')::uuid, insumo = trim(d->>'insumo'), cantidad = (d->>'cantidad')::numeric,
          unidad = d->>'unidad', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'empaque' then
    if v_nombre is null then raise exception 'Escribe el nombre del material.'; end if;
    if nullif(trim(d->>'unidad'), '') is null then raise exception 'Escribe la unidad (ej. cajas, unidades, rollos).'; end if;
    if p_id is null then
      -- El código lo usan los conteos guardados: se arma solo con el nombre y no cambia más.
      v_codigo := coalesce(nullif(btrim(upper(regexp_replace(
        translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '_', 'g')), '_'), ''), 'EMPAQUE');
      v_n := 1;
      while exists (select 1 from inventario_empaque where codigo = v_codigo || case when v_n = 1 then '' else '_' || v_n end) loop
        v_n := v_n + 1;
      end loop;
      v_codigo := v_codigo || case when v_n = 1 then '' else '_' || v_n end;
      insert into inventario_empaque (codigo, nombre, unidad, orden, editado_por, editado_en)
      values (v_codigo, v_nombre, trim(d->>'unidad'),
              coalesce(nullif(d->>'orden', '')::integer, (select coalesce(max(orden), 0) + 10 from inventario_empaque)), v, now())
      returning id into v_id;
    else
      update inventario_empaque
      set nombre = v_nombre, unidad = trim(d->>'unidad'), orden = coalesce(nullif(d->>'orden', '')::integer, orden),
          editado_por = v, editado_en = now()
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
-- 4. Calculadora de Fórmula: solo los insumos activos
-- ------------------------------------------------------------
create or replace function listar_formulas()
returns table (
  variante_id uuid,
  familia text,
  variante text,
  unidad_base text,
  activo boolean,
  insumo text,
  cantidad numeric,
  unidad text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select v.id, v.familia, v.nombre, v.unidad_base, v.activo, i.insumo, i.cantidad, i.unidad
  from formula_variantes v
  join formula_insumos i on i.variante_id = v.id and i.activo
  order by v.familia, v.nombre, i.insumo;
end;
$$;
grant execute on function listar_formulas() to anon, authenticated;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();
