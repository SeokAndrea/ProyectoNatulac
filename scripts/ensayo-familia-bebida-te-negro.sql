-- Ensayo de 20261116490000_familia_bebida_te_negro.sql (familia «Especiales» → «Bebida té negro»).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   cd scripts/base-local && node correr.mjs --migracion ../../supabase/migrations/20261116490000_familia_bebida_te_negro.sql ../ensayo-familia-bebida-te-negro.sql
begin;

-- Un mes de Indicadores con la clave vieja, para ver que se pasa (se vuelve a correr la parte 4 de la migración).
do $$
declare
  v_area uuid := (select id from areas where codigo = 'ASEPTICO');
begin
  insert into indicadores_mes (area_id, mes, modo, datos, observaciones)
  values (v_area, '2020-01-01', 'MANUAL', '{"semielaborado": {"Especiales": 97.5, "Jucosa": 99}}', '{"semi|Especiales": "nota"}');

  update indicadores_mes
  set datos = jsonb_set(datos #- '{semielaborado,Especiales}', '{semielaborado,Bebida té negro}',
        coalesce(datos -> 'semielaborado' -> 'Bebida té negro', datos -> 'semielaborado' -> 'Especiales'))
  where datos -> 'semielaborado' ? 'Especiales';
  update indicadores_mes
  set observaciones = jsonb_set(observaciones - 'semi|Especiales', array['semi|Bebida té negro'],
        coalesce(observaciones -> 'semi|Bebida té negro', observaciones -> 'semi|Especiales'))
  where observaciones ? 'semi|Especiales';
end
$$;

do $$
declare
  v_te uuid;
begin
  -- 1. La familia quedó con el nombre nuevo.
  if not exists (select 1 from familias_producto where nombre = 'Bebida té negro') then raise exception '1: falta la familia Bebida té negro'; end if;
  if exists (select 1 from familias_producto where nombre = 'Especiales') then raise exception '1: quedó Especiales'; end if;

  -- 2. es_familia_te() acepta el nombre viejo y el nuevo, y nada más.
  if not (es_familia_te('Especiales') and es_familia_te('Bebida té negro') and es_familia_te('BEBIDA TE NEGRO')) then raise exception '2: no reconoce'; end if;
  if es_familia_te('Premium') or es_familia_te(null) or es_familia_te('Clásico') then raise exception '2: reconoce de más'; end if;

  -- 3. sabor_display(): los tés siguen sin sufijo y lo demás igual.
  if sabor_display('Té de Durazno', 'Bebida té negro') <> 'Té de Durazno' then raise exception '3: %', sabor_display('Té de Durazno', 'Bebida té negro'); end if;
  if sabor_display('Té de Durazno', 'Especiales') <> 'Té de Durazno' then raise exception '3: nombre viejo'; end if;
  if sabor_display('Manzana', 'Clásico') <> 'Manzana' then raise exception '3: Clásico'; end if;
  if sabor_display('Manzana', 'Selecto') <> 'Manzana 35%' then raise exception '3: Selecto'; end if;
  if sabor_display('Manzana', 'Jucosa') <> 'Manzana (Jucosa)' then raise exception '3: Jucosa'; end if;

  -- 4. Los sabores de la familia siguen ahí.
  select s.id into v_te from sabores s join familias_producto f on f.id = s.familia_id where f.nombre = 'Bebida té negro' limit 1;
  if v_te is null then raise exception '4: la familia quedó sin sabores'; end if;

  -- 5. Indicadores: el mes de prueba pasó la clave y la observación.
  if (select datos -> 'semielaborado' ->> 'Bebida té negro' from indicadores_mes where mes = '2020-01-01')::numeric <> 97.5 then raise exception '5: valor'; end if;
  if exists (select 1 from indicadores_mes where datos -> 'semielaborado' ? 'Especiales' or observaciones ? 'semi|Especiales') then raise exception '5: quedó la clave vieja'; end if;
  if (select observaciones ->> 'semi|Bebida té negro' from indicadores_mes where mes = '2020-01-01') <> 'nota' then raise exception '5: observación'; end if;

  raise notice 'familia_bebida_te_negro: todo bien';
end
$$;

rollback;
