-- ============================================================
-- Familia «Clásicos» → «Clásico» (Alexander, 2026-11-17)
-- ============================================================
-- El nombre de la familia se comparaba al pie de la letra
-- ('Clasicos', 'Clásicos') para:
--   - sabor_display(): los Clásicos van sin « (Familia)» al final;
--   - nombre_sabor_resumen(): el Resumen Diario los nombra solo con el sabor.
-- Renombrar la fila sin tocar eso habría hecho salir «Manzana (Clásico)»
-- en toda la app. Ahora las dos funciones usan es_familia_clasica(), que
-- acepta las cuatro formas (con o sin tilde, singular o plural).
--
-- Los Indicadores guardan el semielaborado con el nombre de la familia
-- como clave ("Clasicos": 100). Los meses cargados se pasan a "Clásico"
-- para que el mes nuevo (que ya calcula con el nombre nuevo) y los
-- anteriores sigan siendo el mismo producto; lo mismo con sus
-- observaciones ("semi|Clasicos").
--
-- El cambio de la fila queda en Auditoría por el disparador
-- auditar_familias_producto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ¿Es la familia de los Clásicos?
-- ------------------------------------------------------------
create or replace function es_familia_clasica(p_familia text)
returns boolean
language sql
immutable
as $$
  select lower(translate(coalesce(p_familia, ''), 'Áá', 'Aa')) in ('clasico', 'clasicos');
$$;
grant execute on function es_familia_clasica(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. sabor_display() — última versión: 20261002090000_sabor_display_selecto_35.sql
-- ------------------------------------------------------------
create or replace function sabor_display(p_nombre text, p_familia text)
returns text
language sql
immutable
as $$
  select case
    when p_nombre is null then null
    when p_familia is null then p_nombre
    when es_familia_clasica(p_familia) or p_familia = 'Especiales' then p_nombre
    when p_familia = 'Selecto' then
      case when p_nombre ~* '35\s*%' then p_nombre else p_nombre || ' 35%' end
    else p_nombre || ' (' || p_familia || ')'
  end;
$$;

grant execute on function sabor_display(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. nombre_sabor_resumen() — última versión: 20261108390000_resumen_diario_jefe_y_analista.sql
-- ------------------------------------------------------------
create or replace function nombre_sabor_resumen(p_sabor_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when es_familia_clasica(fp.nombre) then s.nombre
    when exists (select 1 from sabores s2 where s2.nombre = s.nombre and s2.familia_id <> s.familia_id) then s.nombre || ' ' || fp.nombre
    else s.nombre
  end
  from sabores s
  left join familias_producto fp on fp.id = s.familia_id
  where s.id = p_sabor_id;
$$;
revoke execute on function nombre_sabor_resumen(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Renombrar la familia
-- ------------------------------------------------------------
do $$
declare
  v_cuantas integer;
begin
  select count(*) into v_cuantas
  from familias_producto
  where es_familia_clasica(nombre) and nombre <> 'Clásico';

  if v_cuantas > 1 or (v_cuantas = 1 and exists (select 1 from familias_producto where nombre = 'Clásico')) then
    raise exception 'Hay más de una familia de Clásicos (%). Únelas a mano antes de aplicar esta migración.',
      (select string_agg(nombre, ', ') from familias_producto where es_familia_clasica(nombre));
  end if;

  update familias_producto
  set nombre = 'Clásico'
  where es_familia_clasica(nombre) and nombre <> 'Clásico';
end
$$;

-- ------------------------------------------------------------
-- 5. Indicadores ya cargados: la clave del semielaborado y su observación
-- ------------------------------------------------------------
do $$
declare
  v_viejo text;
begin
  foreach v_viejo in array array['Clasicos', 'Clásicos', 'Clasico'] loop
    update indicadores_mes
    set datos = jsonb_set(
          datos #- array['semielaborado', v_viejo],
          '{semielaborado,Clásico}',
          coalesce(datos -> 'semielaborado' -> 'Clásico', datos -> 'semielaborado' -> v_viejo)
        )
    where datos -> 'semielaborado' ? v_viejo;

    update indicadores_mes
    set observaciones = jsonb_set(
          observaciones - ('semi|' || v_viejo),
          array['semi|Clásico'],
          coalesce(observaciones -> 'semi|Clásico', observaciones -> ('semi|' || v_viejo))
        )
    where observaciones ? ('semi|' || v_viejo);
  end loop;
end
$$;

select * from asegurar_control_usuario();
