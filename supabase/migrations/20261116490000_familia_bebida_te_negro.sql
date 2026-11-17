-- ============================================================
-- Familia «Especiales» → «Bebida té negro» (Alexander, 2026-11-17)
-- ============================================================
-- Igual que 20261116390000 (Clásico): sabor_display() comparaba
-- 'Especiales' al pie de la letra para mostrar los tés sin « (Familia)»
-- al final. Ahora usa es_familia_te(), que acepta el nombre viejo y el
-- nuevo (sin importar tildes ni mayúsculas).
--
-- Los meses de Indicadores que tengan la clave "Especiales" en el
-- semielaborado (o su observación "semi|Especiales") pasan al nombre
-- nuevo. En la pantalla de Indicadores se sigue mostrando «Té».
--
-- El cambio de la fila queda en Auditoría por el disparador
-- auditar_familias_producto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ¿Es la familia de los tés?
-- ------------------------------------------------------------
create or replace function es_familia_te(p_familia text)
returns boolean
language sql
immutable
as $$
  select lower(translate(coalesce(p_familia, ''), 'Éé', 'Ee')) in ('especiales', 'bebida te negro');
$$;
grant execute on function es_familia_te(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. sabor_display() — última versión: 20261116390000_familia_clasico.sql
-- ------------------------------------------------------------
create or replace function sabor_display(p_nombre text, p_familia text)
returns text
language sql
immutable
as $$
  select case
    when p_nombre is null then null
    when p_familia is null then p_nombre
    when es_familia_clasica(p_familia) or es_familia_te(p_familia) then p_nombre
    when p_familia = 'Selecto' then
      case when p_nombre ~* '35\s*%' then p_nombre else p_nombre || ' 35%' end
    else p_nombre || ' (' || p_familia || ')'
  end;
$$;

grant execute on function sabor_display(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Renombrar la familia
-- ------------------------------------------------------------
do $$
declare
  v_cuantas integer;
begin
  select count(*) into v_cuantas
  from familias_producto
  where es_familia_te(nombre) and nombre <> 'Bebida té negro';

  if v_cuantas > 1 or (v_cuantas = 1 and exists (select 1 from familias_producto where nombre = 'Bebida té negro')) then
    raise exception 'Hay más de una familia de tés (%). Únelas a mano antes de aplicar esta migración.',
      (select string_agg(nombre, ', ') from familias_producto where es_familia_te(nombre));
  end if;

  update familias_producto
  set nombre = 'Bebida té negro'
  where es_familia_te(nombre) and nombre <> 'Bebida té negro';
end
$$;

-- ------------------------------------------------------------
-- 4. Indicadores ya cargados: la clave del semielaborado y su observación
-- ------------------------------------------------------------
update indicadores_mes
set datos = jsonb_set(
      datos #- '{semielaborado,Especiales}',
      '{semielaborado,Bebida té negro}',
      coalesce(datos -> 'semielaborado' -> 'Bebida té negro', datos -> 'semielaborado' -> 'Especiales')
    )
where datos -> 'semielaborado' ? 'Especiales';

update indicadores_mes
set observaciones = jsonb_set(
      observaciones - 'semi|Especiales',
      array['semi|Bebida té negro'],
      coalesce(observaciones -> 'semi|Bebida té negro', observaciones -> 'semi|Especiales')
    )
where observaciones ? 'semi|Especiales';

select * from asegurar_control_usuario();
