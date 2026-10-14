-- ENSAYO (se puede borrar): aplica la migración 20261109990000 (Indicadores) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede aplicar la migración.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Necesita un SUPERADMINISTRADOR activo.

begin;

-- ===================== MIGRACIÓN 20261109990000_indicadores.sql =====================
-- ============================================================
-- INDICADORES: tablero mensual por línea y presentación
-- ============================================================
-- Dueña, 2026-10-14 (prototipo aprobado): una pantalla de Indicadores en
-- Auditoría. Cada MES tiene su modo:
--
--   * AUTOMÁTICO: la app lo calcula con los turnos cerrados del mes
--     (src/lib/indicadores/automatico.ts). Para eso, indicadores_turnos()
--     trae en UNA consulta los turnos del rango con sus paradas y lo
--     programado (si no, eran cientos de consultas por mes).
--   * MANUAL: el jefe o la analista cargan los números a mano (la app
--     todavía no tenía todo, ej. septiembre de 2026). Se guardan enteros
--     en `datos` (jsonb, forma DatosMes de src/lib/indicadores/tipos.ts).
--
-- Las observaciones van aparte, por presentación ("1|250") o producto
-- ("semi|Selecto"), y valen en los dos modos.
-- Permisos: ver y cargar = puede_ver_resumen_dia (jefe, analista,
-- superadmin y dueño), igual que el Resumen Diario.
-- ============================================================

create table if not exists indicadores_mes (
  area_id uuid not null references areas (id) on delete cascade,
  -- Primer día del mes.
  mes date not null check (extract(day from mes) = 1),
  modo text not null default 'AUTO' check (modo in ('AUTO', 'MANUAL')),
  -- Lo cargado a mano; null = nunca se cargó. Se conserva al volver a AUTO.
  datos jsonb,
  -- { "1|250": "texto", "semi|Selecto": "texto" }
  observaciones jsonb not null default '{}'::jsonb,
  actualizado_por uuid references usuarios (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (area_id, mes)
);
alter table indicadores_mes enable row level security;

-- ------------------------------------------------------------
-- Lectura
-- ------------------------------------------------------------
-- Modo, datos manuales y observaciones de los meses del rango.
create or replace function indicadores_meses(p_usuario text, p_area_codigo text, p_desde date, p_hasta date)
returns table (mes date, modo text, datos jsonb, observaciones jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver los indicadores.';
  end if;
  return query
  select im.mes, im.modo, im.datos, im.observaciones
  from indicadores_mes im
  join areas a on a.id = im.area_id
  where a.codigo = p_area_codigo and im.mes between date_trunc('month', p_desde)::date and p_hasta
  order by im.mes;
end;
$$;
grant execute on function indicadores_meses(text, text, date, date) to anon, authenticated;

-- Para el modo AUTOMÁTICO: los turnos CERRADOS del rango (turno_json, igual
-- que turnos_de_fecha_tipo) con sus paradas (listar_paradas por turno, así
-- las de Mantenimiento vienen recortadas a la ventana del turno, igual que
-- el Panel de Producción) y las cajas programadas por presentación.
create or replace function indicadores_turnos(p_usuario text, p_area_codigo text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver los indicadores.';
  end if;
  return jsonb_build_object(
    'turnos', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'turno', turno_json(t.id),
          'paradas', (
            select coalesce(jsonb_agg(to_jsonb(lp)), '[]'::jsonb)
            from listar_paradas(t.fecha, t.fecha, null, null, t.id, null) lp
          )
        )
        order by t.fecha, t.hora_inicio
      ), '[]'::jsonb)
      from turnos t
      join areas a on a.id = t.area_id
      where a.codigo = p_area_codigo and t.fecha between p_desde and p_hasta and t.estado = 'CERRADO'
    ),
    'plan', (
      select coalesce(jsonb_agg(jsonb_build_object('volumen_ml', x.volumen_ml, 'cajas', x.cajas)), '[]'::jsonb)
      from (
        select p.volumen_ml, sum(pd.cajas_plan) as cajas
        from programacion_dia pd
        join areas a on a.id = pd.area_id
        join presentaciones p on p.id = pd.presentacion_id
        where a.codigo = p_area_codigo and pd.fecha between p_desde and p_hasta
        group by p.volumen_ml
      ) x
    )
  );
end;
$$;
grant execute on function indicadores_turnos(text, text, date, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Escritura
-- ------------------------------------------------------------
-- Cambia el modo del mes y, si viene p_datos, guarda lo cargado a mano.
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
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para cargar indicadores.';
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

-- Observación de una presentación o producto en el mes. Texto vacío = se borra.
create or replace function guardar_observacion_indicador(p_usuario text, p_area_codigo text, p_mes date, p_clave text, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_mes date := date_trunc('month', p_mes)::date;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_antes text;
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para escribir observaciones.';
  end if;
  if coalesce(trim(p_clave), '') = '' then
    raise exception 'Falta a qué presentación va la observación.';
  end if;
  if length(v_texto) > 400 then
    raise exception 'La observación pasa de 400 letras.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'No se encontró el área %.', p_area_codigo;
  end if;

  select observaciones ->> p_clave into v_antes from indicadores_mes where area_id = v_area_id and mes = v_mes;
  insert into indicadores_mes (area_id, mes, observaciones, actualizado_por, actualizado_en)
  values (v_area_id, v_mes, case when v_texto is null then '{}'::jsonb else jsonb_build_object(p_clave, v_texto) end,
          (select id from usuarios where usuario = lower(p_usuario)), now())
  on conflict (area_id, mes) do update
    set observaciones = case when v_texto is null then indicadores_mes.observaciones - p_clave
                             else indicadores_mes.observaciones || jsonb_build_object(p_clave, v_texto) end,
        actualizado_por = excluded.actualizado_por,
        actualizado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'indicadores_mes', format('%s %s %s', p_area_codigo, to_char(v_mes, 'YYYY-MM'), p_clave), 'Indicadores',
    format('Observación de %s (%s)', p_clave, to_char(v_mes, 'MM/YYYY')),
    case when v_antes is null then null else jsonb_build_object('texto', v_antes) end,
    case when v_texto is null then null else jsonb_build_object('texto', v_texto) end
  );
end;
$$;
grant execute on function guardar_observacion_indicador(text, text, date, text, text) to anon, authenticated;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();

-- ===================== CHEQUEOS =====================
do $$
declare
  v_admin text;
  v_mes date := date '2026-09-01';
  v_fila record;
  v_json jsonb;
  v_falla text;
  v_n integer := 0;
begin
  select u.usuario into v_admin from usuarios u where u.activo and coalesce(es_superadmin(u.usuario), false) limit 1;
  if v_admin is null then
    raise exception 'ENSAYO NO CORRIÓ: hace falta un SUPERADMINISTRADOR activo.';
  end if;

  -- 1. Pasar a MANUAL con datos y leerlos.
  perform guardar_indicadores_mes(v_admin, 'ASEPTICO', date '2026-09-15', 'MANUAL', '{"eficiencia": {"1": 76}}'::jsonb);
  select * into v_fila from indicadores_meses(v_admin, 'ASEPTICO', v_mes, v_mes);
  if v_fila.mes <> v_mes or v_fila.modo <> 'MANUAL' or (v_fila.datos #>> '{eficiencia,1}')::int <> 76 then
    raise exception 'ENSAYO FALLÓ (1): no quedó el mes en MANUAL con sus datos.';
  end if;
  v_n := v_n + 1;

  -- 2. Volver a AUTO conserva lo cargado a mano.
  perform guardar_indicadores_mes(v_admin, 'ASEPTICO', v_mes, 'AUTO', null);
  select * into v_fila from indicadores_meses(v_admin, 'ASEPTICO', v_mes, v_mes);
  if v_fila.modo <> 'AUTO' or v_fila.datos is null then
    raise exception 'ENSAYO FALLÓ (2): al volver a AUTO se perdieron los datos manuales.';
  end if;
  v_n := v_n + 1;

  -- 3. Observaciones: se agregan, se reemplazan y se borran con texto vacío.
  perform guardar_observacion_indicador(v_admin, 'ASEPTICO', v_mes, '1|1000', 'Ensayo');
  perform guardar_observacion_indicador(v_admin, 'ASEPTICO', v_mes, 'semi|Selecto', 'Corrida corta');
  perform guardar_observacion_indicador(v_admin, 'ASEPTICO', v_mes, '1|1000', '   ');
  select * into v_fila from indicadores_meses(v_admin, 'ASEPTICO', v_mes, v_mes);
  if v_fila.observaciones ? '1|1000' or v_fila.observaciones ->> 'semi|Selecto' <> 'Corrida corta' then
    raise exception 'ENSAYO FALLÓ (3): las observaciones no quedaron bien (%).', v_fila.observaciones;
  end if;
  v_n := v_n + 1;

  -- 4. Modo inválido: rechazado.
  v_falla := null;
  begin
    perform guardar_indicadores_mes(v_admin, 'ASEPTICO', v_mes, 'OTRO', null);
  exception when others then v_falla := sqlerrm;
  end;
  if v_falla is null then
    raise exception 'ENSAYO FALLÓ (4): aceptó un modo inválido.';
  end if;
  v_n := v_n + 1;

  -- 5. Turnos del mes para el modo automático.
  v_json := indicadores_turnos(v_admin, 'ASEPTICO', v_mes, (v_mes + interval '1 month - 1 day')::date);
  if jsonb_typeof(v_json -> 'turnos') <> 'array' or jsonb_typeof(v_json -> 'plan') <> 'array' then
    raise exception 'ENSAYO FALLÓ (5): indicadores_turnos no trae turnos y plan.';
  end if;
  if jsonb_array_length(v_json -> 'turnos') > 0 and jsonb_typeof(v_json #> '{turnos,0,paradas}') <> 'array' then
    raise exception 'ENSAYO FALLÓ (5): los turnos no traen sus paradas.';
  end if;
  v_n := v_n + 1;

  -- 6. Sin permiso: un usuario sin Resumen Diario no lee.
  select u.usuario into v_fila from usuarios u where u.activo and not puede_ver_resumen_dia(u.usuario) limit 1;
  if v_fila.usuario is not null then
    v_falla := null;
    begin
      perform indicadores_turnos(v_fila.usuario, 'ASEPTICO', v_mes, v_mes);
    exception when others then v_falla := sqlerrm;
    end;
    if v_falla is null then
      raise exception 'ENSAYO FALLÓ (6): % leyó los indicadores sin permiso.', v_fila.usuario;
    end if;
    v_n := v_n + 1;
  end if;

  raise exception 'ENSAYO OK: la migración 20261109990000 funciona (% chequeos, % turnos en septiembre). No quedó nada aplicado.',
    v_n, jsonb_array_length(v_json -> 'turnos');
end;
$$;

rollback;
