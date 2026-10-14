-- ============================================================
-- INDICADORES: la Analista de Producción carga datos aunque su rol sea otro
-- ============================================================
-- Dueña, 2026-10-14: Daniela (dsanchez) es la analista, pero su ROL es
-- Super Administrador y su CARGO es Analista de Producción. Desde
-- 20261110190000 el modo del mes y la carga a mano eran solo del rol
-- ANALISTA y de la dueña (para dejar afuera a Jorge, superadmin con cargo
-- Jefe de Producción). Ahora también entra quien tiene el CARGO
-- ANALISTA_PRODUCCION. Jorge sigue afuera.
--
-- Único cambio en guardar_indicadores_mes (copia de 20261110190000): el
-- control de quién puede.
-- ============================================================

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
  -- Solo la Analista (por rol o por cargo) y la dueña cambian el modo o cargan datos (dueña, 2026-10-14).
  if not (coalesce((select rol_codigo from rol_y_area_de(p_usuario)) = 'ANALISTA', false)
          or exists (select 1 from usuarios where usuario = lower(p_usuario) and activo and cargo = 'ANALISTA_PRODUCCION')
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
