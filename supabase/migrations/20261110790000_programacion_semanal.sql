-- ============================================================
-- PROGRAMACIÓN SEMANAL + DIARIA
-- ============================================================
-- Dueña, 2026-10-14 (prototipo aprobado):
--   * SEMANAL: la analista carga el plan de la semana (lunes a viernes)
--     por sabor + presentación, en cajas.
--   * DIARIO: cada día elige qué del semanal entra ese día y en qué LÍNEA.
--     Lo que no se termina pasa solo al día siguiente (eso se calcula en
--     la app, src/lib/programacionSemanal.ts); acá se guarda solo lo que
--     ella eligió o sacó de cada día.
--   * El viernes la semana cierra: lo que faltó queda incumplido y no pasa
--     a la semana siguiente. Sábado y domingo no se programan.
--   * Lo producido sale del Producto Terminado del supervisor, en vivo.
-- La tabla vieja programacion_dia queda para el historial: las semanas sin
-- plan semanal se siguen leyendo de ahí (Panel e Indicadores).
-- Edita quien tenga PROGRAMACION_EDITAR.
-- ============================================================

create table if not exists programacion_semana (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id) on delete cascade,
  -- Lunes de la semana.
  semana date not null check (extract(isodow from semana) = 1),
  sabor_id uuid not null references sabores (id),
  presentacion_id uuid not null references presentaciones (id),
  cajas_plan integer not null check (cajas_plan > 0),
  creado_por uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (area_id, semana, sabor_id, presentacion_id)
);
alter table programacion_semana enable row level security;

-- Lo que la analista decidió para un producto en un día: lo ELEGIDO (con su
-- línea) o lo QUITADO (deja de pasar solo desde el día anterior).
create table if not exists programacion_semana_dia (
  item_id uuid not null references programacion_semana (id) on delete cascade,
  fecha date not null check (extract(isodow from fecha) between 1 and 5),
  estado text not null check (estado in ('ELEGIDO', 'QUITADO')),
  linea_id uuid references lineas (id),
  actualizado_por uuid references usuarios (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (item_id, fecha),
  check ((estado = 'ELEGIDO') = (linea_id is not null))
);
alter table programacion_semana_dia enable row level security;

-- Jornada de planta de hoy (7:00 a 7:00, hora de Caracas).
create or replace function jornada_planta_hoy()
returns date
language sql
stable
as $$
  select ((now() at time zone 'America/Caracas') - interval '7 hours')::date;
$$;

-- ------------------------------------------------------------
-- Lectura: las semanas cuyo lunes cae entre p_desde y p_hasta (p_desde se
-- lleva a su lunes), con lo elegido cada día, lo producido por día (lunes
-- a viernes) y, para las semanas viejas sin plan semanal, la programación
-- diaria de antes.
-- ------------------------------------------------------------
create or replace function programacion_semanal_de(p_area_codigo text, p_desde date, p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with area as (
    select id from areas where codigo = p_area_codigo
  ),
  rango as (
    select date_trunc('week', p_desde)::date as desde, (date_trunc('week', p_hasta)::date + 4) as hasta
  ),
  items as (
    select ps.*
    from programacion_semana ps, area, rango
    where ps.area_id = area.id and ps.semana between rango.desde and rango.hasta
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'semana', i.semana,
        'sabor_id', i.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, f.nombre),
        'presentacion_id', i.presentacion_id,
        'presentacion_ml', p.volumen_ml,
        'cajas_plan', i.cajas_plan
      ) order by i.semana, i.creado_en)
      from items i
      join sabores s on s.id = i.sabor_id
      left join familias_producto f on f.id = s.familia_id
      join presentaciones p on p.id = i.presentacion_id
    ), '[]'::jsonb),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', d.item_id,
        'fecha', d.fecha,
        'estado', d.estado,
        'linea_codigo', l.codigo
      ) order by d.fecha)
      from programacion_semana_dia d
      join items i on i.id = d.item_id
      left join lineas l on l.id = d.linea_id
    ), '[]'::jsonb),
    'producido', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', x.fecha,
        'sabor_id', x.sabor_id,
        'presentacion_id', x.presentacion_id,
        'cajas', x.cajas
      ))
      from (
        select t.fecha, pt.sabor_id, pt.presentacion_id,
               sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint as cajas
        from producto_terminado pt
        join turnos t on t.id = pt.turno_id, area, rango
        where t.area_id = area.id
          and t.fecha between rango.desde and rango.hasta
          and extract(isodow from t.fecha) between 1 and 5
          and pt.sabor_id is not null
        group by t.fecha, pt.sabor_id, pt.presentacion_id
      ) x
    ), '[]'::jsonb),
    'diario_viejo', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', pd.fecha,
        'sabor_id', pd.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, f.nombre),
        'presentacion_id', pd.presentacion_id,
        'presentacion_ml', p.volumen_ml,
        'cajas_plan', pd.cajas_plan
      ) order by pd.fecha)
      from programacion_dia pd
      join sabores s on s.id = pd.sabor_id
      left join familias_producto f on f.id = s.familia_id
      join presentaciones p on p.id = pd.presentacion_id, area, rango
      where pd.area_id = area.id
        and pd.fecha between rango.desde and rango.hasta
        and not exists (
          select 1 from programacion_semana ps
          where ps.area_id = area.id and ps.semana = date_trunc('week', pd.fecha)::date
        )
    ), '[]'::jsonb)
  );
$$;
grant execute on function programacion_semanal_de(text, date, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Escritura. Solo semanas que no cerraron (el viernes ya pasó = cerrada).
-- ------------------------------------------------------------
create or replace function programacion_validar_semana(p_usuario text, p_semana date)
returns void
language plpgsql
-- Sin "stable": asegurar_control_usuario() le inyecta el control de la sesión, que puede anotar.
security definer
set search_path = public
as $$
begin
  if not tiene_permiso(p_usuario, 'PROGRAMACION_EDITAR') then
    raise exception 'No tienes permiso para editar la programación.';
  end if;
  if extract(isodow from p_semana) <> 1 then
    raise exception 'La semana tiene que empezar un lunes.';
  end if;
  if p_semana + 4 < jornada_planta_hoy() then
    raise exception 'Esa semana ya cerró el viernes: solo se puede ver.';
  end if;
end;
$$;
revoke execute on function programacion_validar_semana(text, date) from public, anon, authenticated;

-- Agrega un producto a la semana o cambia sus cajas.
create or replace function guardar_item_semana(
  p_usuario text,
  p_area_codigo text,
  p_semana date,
  p_sabor_id uuid,
  p_presentacion_id uuid,
  p_cajas integer,
  p_pagina text default 'Programación'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes programacion_semana;
  v_id uuid;
  v_nombre text;
begin
  perform programacion_validar_semana(p_usuario, p_semana);
  if coalesce(p_cajas, 0) <= 0 then
    raise exception 'Escribe cuántas cajas se planifican en la semana.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'No se encontró el área %.', p_area_codigo;
  end if;

  select * into v_antes from programacion_semana
  where area_id = v_area_id and semana = p_semana and sabor_id = p_sabor_id and presentacion_id = p_presentacion_id;

  insert into programacion_semana (area_id, semana, sabor_id, presentacion_id, cajas_plan, creado_por)
  values (v_area_id, p_semana, p_sabor_id, p_presentacion_id, p_cajas, (select id from usuarios where usuario = lower(p_usuario)))
  on conflict (area_id, semana, sabor_id, presentacion_id) do update set cajas_plan = excluded.cajas_plan
  returning id into v_id;

  select format('%s %s ml', sabor_display(s.nombre, f.nombre), p.volumen_ml) into v_nombre
  from sabores s left join familias_producto f on f.id = s.familia_id, presentaciones p
  where s.id = p_sabor_id and p.id = p_presentacion_id;

  perform registrar_auditoria(
    p_usuario, case when v_antes.id is null then 'CREAR' else 'EDITAR' end, 'programacion_semana', v_id::text, p_pagina,
    format('Semana del %s · %s: %s', to_char(p_semana, 'DD/MM'), v_nombre,
           case when v_antes.id is null then p_cajas || ' cajas' else v_antes.cajas_plan || ' → ' || p_cajas || ' cajas' end),
    case when v_antes.id is null then null else jsonb_build_object('cajas_plan', v_antes.cajas_plan) end,
    jsonb_build_object('cajas_plan', p_cajas)
  );
  return v_id;
end;
$$;
grant execute on function guardar_item_semana(text, text, date, uuid, uuid, integer, text) to anon, authenticated;

-- Saca un producto de la semana (con lo que se eligió para sus días).
create or replace function eliminar_item_semana(p_usuario text, p_item_id uuid, p_pagina text default 'Programación')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item programacion_semana;
begin
  select * into v_item from programacion_semana where id = p_item_id;
  if v_item.id is null then
    raise exception 'Ese producto ya no está en la semana.';
  end if;
  perform programacion_validar_semana(p_usuario, v_item.semana);
  delete from programacion_semana where id = p_item_id;
  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'programacion_semana', p_item_id::text, p_pagina,
    format('Semana del %s: quitó un producto de %s cajas', to_char(v_item.semana, 'DD/MM'), v_item.cajas_plan),
    jsonb_build_object('sabor_id', v_item.sabor_id, 'presentacion_id', v_item.presentacion_id, 'cajas_plan', v_item.cajas_plan),
    null
  );
end;
$$;
grant execute on function eliminar_item_semana(text, uuid, text) to anon, authenticated;

-- Pasa un producto a un día con su línea (p_linea_codigo), o lo saca de
-- ese día (p_linea_codigo null). Solo hoy o días que vienen.
create or replace function programar_item_dia(
  p_usuario text,
  p_item_id uuid,
  p_fecha date,
  p_linea_codigo text,
  p_pagina text default 'Programación'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item programacion_semana;
  v_linea_id uuid;
begin
  select * into v_item from programacion_semana where id = p_item_id;
  if v_item.id is null then
    raise exception 'Ese producto ya no está en la semana.';
  end if;
  perform programacion_validar_semana(p_usuario, v_item.semana);
  if p_fecha not between v_item.semana and v_item.semana + 4 then
    raise exception 'El día no es de esa semana.';
  end if;
  if p_fecha < jornada_planta_hoy() then
    raise exception 'Ese día ya pasó: solo se puede ver.';
  end if;

  if p_linea_codigo is not null then
    select id into v_linea_id from lineas where codigo = p_linea_codigo and area_id = v_item.area_id;
    if v_linea_id is null then
      raise exception 'No se encontró la línea %.', p_linea_codigo;
    end if;
  end if;

  insert into programacion_semana_dia (item_id, fecha, estado, linea_id, actualizado_por)
  values (p_item_id, p_fecha, case when v_linea_id is null then 'QUITADO' else 'ELEGIDO' end, v_linea_id,
          (select id from usuarios where usuario = lower(p_usuario)))
  on conflict (item_id, fecha) do update
    set estado = excluded.estado, linea_id = excluded.linea_id,
        actualizado_por = excluded.actualizado_por, actualizado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'programacion_semana', p_item_id::text, p_pagina,
    case when v_linea_id is null then format('Lo sacó del %s', to_char(p_fecha, 'DD/MM'))
         else format('Lo pasó al %s en %s', to_char(p_fecha, 'DD/MM'), p_linea_codigo) end,
    null,
    jsonb_build_object('fecha', p_fecha, 'linea', p_linea_codigo)
  );
end;
$$;
grant execute on function programar_item_dia(text, uuid, date, text, text) to anon, authenticated;

-- Regla de seguridad (20261109690000): toda función nueva con p_usuario queda controlada.
select * from asegurar_control_usuario();
