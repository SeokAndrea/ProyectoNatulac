-- Ensayo de 20261116390000_familia_clasico.sql (familia «Clásicos» → «Clásico»).
-- Todo dentro de una transacción con rollback; si algo no sale, hay una excepción.
--   cd scripts/base-local && node correr.mjs --migracion ../../supabase/migrations/20261116390000_familia_clasico.sql ../ensayo-familia-clasico.sql
begin;

do $$
declare
  v_mz uuid;
  v_n integer;
begin
  -- 1. La familia quedó con el nombre nuevo y no queda ninguna con el viejo.
  if not exists (select 1 from familias_producto where nombre = 'Clásico') then raise exception '1: falta la familia Clásico'; end if;
  if exists (select 1 from familias_producto where nombre in ('Clasicos', 'Clásicos')) then raise exception '1: quedó el nombre viejo'; end if;

  -- 2. es_familia_clasica() acepta las cuatro formas y nada más.
  if not (es_familia_clasica('Clásico') and es_familia_clasica('Clasico') and es_familia_clasica('Clásicos') and es_familia_clasica('CLASICOS')) then
    raise exception '2: no reconoce alguna forma de Clásico';
  end if;
  if es_familia_clasica('Jucosa') or es_familia_clasica(null) or es_familia_clasica('Clásico Premium') then raise exception '2: reconoce de más'; end if;

  -- 3. sabor_display(): los Clásicos siguen sin sufijo; el resto igual que antes.
  if sabor_display('Manzana', 'Clásico') <> 'Manzana' then raise exception '3: %', sabor_display('Manzana', 'Clásico'); end if;
  if sabor_display('Manzana', 'Clasicos') <> 'Manzana' then raise exception '3: forma vieja'; end if;
  if sabor_display('Manzana', 'Especiales') <> 'Manzana' then raise exception '3: Especiales'; end if;
  if sabor_display('Manzana', 'Selecto') <> 'Manzana 35%' then raise exception '3: Selecto'; end if;
  if sabor_display('Manzana', 'Jucosa') <> 'Manzana (Jucosa)' then raise exception '3: Jucosa'; end if;
  if sabor_display('Manzana', null) <> 'Manzana' then raise exception '3: sin familia'; end if;

  -- 4. Resumen Diario: el sabor clásico va con su nombre solo.
  select s.id into v_mz from sabores s join familias_producto f on f.id = s.familia_id where f.nombre = 'Clásico' and s.nombre = 'Manzana';
  if v_mz is null then raise exception '4: falta Manzana Clásico'; end if;
  if nombre_sabor_resumen(v_mz) <> 'Manzana' then raise exception '4: %', nombre_sabor_resumen(v_mz); end if;
  -- Un sabor con el mismo nombre en otra familia sigue con la familia al lado.
  select count(*) into v_n from sabores s join familias_producto f on f.id = s.familia_id
  where f.nombre <> 'Clásico' and s.nombre = 'Manzana' and nombre_sabor_resumen(s.id) <> 'Manzana ' || f.nombre;
  if v_n > 0 then raise exception '4: Manzana de otra familia mal nombrada'; end if;

  -- 5. Indicadores: ningún mes conserva la clave vieja y los que la tenían pasaron el valor a «Clásico».
  if exists (select 1 from indicadores_mes where datos -> 'semielaborado' ?| array['Clasicos', 'Clásicos', 'Clasico']) then raise exception '5: quedó la clave vieja'; end if;
  if exists (select 1 from indicadores_mes where observaciones ?| array['semi|Clasicos', 'semi|Clásicos', 'semi|Clasico']) then raise exception '5: quedó la observación vieja'; end if;
  select count(*) into v_n from indicadores_mes where datos -> 'semielaborado' ? 'Clásico';
  if v_n = 0 then raise exception '5: ningún mes con Clásico (los de septiembre/octubre traían Clasicos)'; end if;
  if exists (select 1 from indicadores_mes where mes = '2026-09-01' and (datos -> 'semielaborado' ->> 'Clásico')::numeric <> 100) then raise exception '5: septiembre perdió el valor'; end if;

  raise notice 'familia_clasico: todo bien (% meses con Clásico)', v_n;
end
$$;

rollback;
