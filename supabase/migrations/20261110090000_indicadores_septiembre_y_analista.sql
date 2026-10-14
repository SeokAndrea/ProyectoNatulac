-- ============================================================
-- INDICADORES: septiembre de 2026 cargado a mano (del informe) y
-- solo la Analista carga datos
-- ============================================================
-- Dueña, 2026-10-14: septiembre la app no lo tenía completo, así que va
-- en modo MANUAL con los números del informe "Indicadores Septiembre
-- 2026.pptx" (prototipo aprobado). Lo que el informe no trae queda vacío
-- y en pantalla sale "—" (ej. la merma de la TPA-330, los minutos de las
-- paradas que no sean el suministro eléctrico).
--
-- Julio y agosto: solo lo que el informe trae claro (eficiencia por línea,
-- semielaborado y la merma de la TBA-1000), para que los gráficos de 3
-- meses de septiembre salgan completos. Las cajas de esos meses no están
-- por presentación en el informe.
--
-- Familias con el nombre de familias_producto ("Clasicos", "Selecto",
-- "Jucosa"). Presentaciones "línea|ml". Si un mes ya tiene datos cargados
-- a mano, NO se pisan; las observaciones se suman a las que haya.
-- Depende de 20261109990000_indicadores.sql.
-- ============================================================

with meses (mes, datos, observaciones) as (
  values
  (date '2026-07-01',
   '{"eficiencia": {"1": 64, "2": 59, "3": 54},
     "presentaciones": {"1|1000": {"corrio": true, "prod": null, "plan": null, "merma": 3.41, "paradas": []}},
     "semielaborado": {"Clasicos": 100, "Jucosa": 99}}'::jsonb,
   '{}'::jsonb),
  (date '2026-08-01',
   '{"eficiencia": {"1": 76, "2": 69, "3": 75},
     "presentaciones": {"1|1000": {"corrio": true, "prod": null, "plan": null, "merma": 3.14, "paradas": []}},
     "semielaborado": {"Clasicos": 99.6, "Jucosa": 96.4}}'::jsonb,
   '{}'::jsonb),
  (date '2026-09-01',
   '{"eficiencia": {"1": 76, "2": 53, "3": 66},
     "presentaciones": {
       "1|1000": {"corrio": true, "prod": 69157, "plan": 98085, "merma": 3.04, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 1200, "veces": 8},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null},
         {"causa": "Falta de paletas", "minutos": null, "veces": null},
         {"causa": "Falla del generador 440 V (correa reventada)", "minutos": null, "veces": null},
         {"causa": "Cambio de presentación a TBA-500", "minutos": null, "veces": null}]},
       "1|500": {"corrio": true, "prod": 10443, "plan": 9451, "merma": 10.10, "paradas": [
         {"causa": "Falla en plegadora por solapa inferior invertida", "minutos": null, "veces": null},
         {"causa": "Signados fuera de rango", "minutos": null, "veces": null},
         {"causa": "Cambio de presentación a TBA-1000", "minutos": null, "veces": null}]},
       "2|250": {"corrio": true, "prod": 18660, "plan": 27106, "merma": 2.56, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 900, "veces": 6},
         {"causa": "Falla en el sistema de sellado transversal", "minutos": null, "veces": null},
         {"causa": "Logística condicionada por correr las tres líneas con el FLEX", "minutos": null, "veces": null},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null}]},
       "3|200": {"corrio": true, "prod": 11479, "plan": 23670, "merma": 3.62, "paradas": [
         {"causa": "Falla de suministro eléctrico", "minutos": 780, "veces": 5},
         {"causa": "Falla en la plegadora", "minutos": null, "veces": null},
         {"causa": "Logística condicionada por correr las tres líneas con el FLEX", "minutos": null, "veces": null},
         {"causa": "Paradas por el RT de aluminio", "minutos": null, "veces": null}]},
       "3|330": {"corrio": true, "prod": 26054, "plan": 14256, "merma": null, "paradas": []}
     },
     "semielaborado": {"Clasicos": 100, "Selecto": 95, "Jucosa": 99}}'::jsonb,
   '{"1|500": "La planificación se realizó en función de los envases disponibles.",
     "3|330": "Se inicia la corrida tomando en cuenta el forecast trimestral.",
     "3|200": "Se detiene por necesidad de cambiar a TPA-330.",
     "semi|Selecto": "Corrida corta."}'::jsonb)
)
insert into indicadores_mes (area_id, mes, modo, datos, observaciones, actualizado_en)
select a.id, m.mes, 'MANUAL', m.datos, m.observaciones, now()
from meses m
cross join areas a
where a.codigo = 'ASEPTICO'
on conflict (area_id, mes) do update
  set modo = 'MANUAL',
      datos = excluded.datos,
      observaciones = excluded.observaciones || indicadores_mes.observaciones,
      actualizado_en = now()
  where indicadores_mes.datos is null;

-- ------------------------------------------------------------
-- Solo la Analista cambia el modo del mes y carga los datos a mano
-- (dueña, 2026-10-14). Igual que 20261109990000, con otro permiso.
-- Las observaciones siguen abiertas a jefe y analista.
-- ------------------------------------------------------------
create or replace function guardar_indicadores_mes(p_usuario text, p_area_codigo text, p_mes date, p_modo text, p_datos jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_mes date := date_trunc('month', p_mes)::date;
  v_antes indicadores_mes;
begin
  -- Solo la Analista (y superadmin o dueño) cambia el modo o carga datos (dueña, 2026-10-14).
  if not (coalesce((select rol_codigo from rol_y_area_de(p_usuario)) = 'ANALISTA', false)
          or coalesce(es_superadmin(p_usuario), false)
          or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'Solo la analista carga los datos de Indicadores.';
  end if;
  if p_modo not in ('AUTO', 'MANUAL') then
    raise exception 'Modo inválido: %', p_modo;
  end if;
  if p_datos is not null and jsonb_typeof(p_datos) <> 'object' then
    raise exception 'Los datos del mes no tienen la forma esperada.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'No se encontró el área %.', p_area_codigo;
  end if;

  select * into v_antes from indicadores_mes where area_id = v_area_id and mes = v_mes;
  insert into indicadores_mes (area_id, mes, modo, datos, actualizado_por, actualizado_en)
  values (v_area_id, v_mes, p_modo, p_datos, (select id from usuarios where usuario = lower(p_usuario)), now())
  on conflict (area_id, mes) do update
    set modo = excluded.modo,
        datos = coalesce(excluded.datos, indicadores_mes.datos),
        actualizado_por = excluded.actualizado_por,
        actualizado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'indicadores_mes', format('%s %s', p_area_codigo, to_char(v_mes, 'YYYY-MM')), 'Indicadores',
    case when p_datos is null then format('%s: modo %s', to_char(v_mes, 'MM/YYYY'), p_modo)
         else format('%s: cargó los datos a mano', to_char(v_mes, 'MM/YYYY')) end,
    case when v_antes.mes is null then null else jsonb_build_object('modo', v_antes.modo, 'datos', v_antes.datos) end,
    jsonb_strip_nulls(jsonb_build_object('modo', p_modo, 'datos', p_datos))
  );
end;
$$;
grant execute on function guardar_indicadores_mes(text, text, date, text, jsonb) to anon, authenticated;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();
