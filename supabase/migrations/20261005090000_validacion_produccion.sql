-- ============================================================
-- MÓDULO VALIDAR (SUPERADMINISTRADOR) — plan-validar-produccion.md §3
-- ============================================================
-- Una fila por corrida (turno_linea) de los turnos CERRADOS. El
-- SUPERADMINISTRADOR marca SÍ (el dato del supervisor es el bueno) o
-- EDITA (lo corrige). Solo lo validado alimenta el dashboard de KPIs
-- futuro. Nunca se toca el producto_terminado del supervisor — la
-- validación vive acá.
-- ============================================================

create table validacion_produccion (
  turno_linea_id uuid primary key references turno_lineas (id) on delete cascade,
  turno_id uuid references turnos (id) on delete cascade,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO')),
  paletas integer,
  cajas_sueltas integer,
  envases_llenadora integer,
  litros_consumidos numeric,
  lote text,
  merma_envases_pct numeric,
  merma_semielaborado_pct numeric,
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now()
);

alter table validacion_produccion enable row level security;
create index validacion_produccion_turno_idx on validacion_produccion (turno_id);

-- ------------------------------------------------------------
-- Solo SUPERADMINISTRADOR.
-- ------------------------------------------------------------
create or replace function es_superadmin(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (select rol_codigo from rol_y_area_de(p_usuario)) = 'SUPERADMINISTRADOR';
$$;

grant execute on function es_superadmin(text) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_validacion_produccion(): una fila por corrida de turnos
-- CERRADOS del rango (áreas ≠ Pruebas) con Producto Terminado o
-- contador. Valores del supervisor (calculados) + estado + overrides.
-- ------------------------------------------------------------
create or replace function listar_validacion_produccion(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_agg(fila order by fila ->> 'fecha' desc, fila ->> 'supervisor_nombre', fila ->> 'turno_codigo', fila ->> 'linea'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'turno_linea_id', tl.id,
      'turno_codigo', t.codigo,
      'fecha', t.fecha,
      'supervisor_nombre', su.nombre,
      'area_nombre', ar.nombre,
      'linea', ln.nombre,
      'presentacion', coalesce(p.volumen_ml::text || ' ml', '—'),
      'sabor', sabor_display(s.nombre, f.nombre),
      'lote', tl.lote,
      'supervisor', jsonb_build_object(
        'paletas', coalesce(pt.paletas, 0),
        'cajas_sueltas', coalesce(pt.cajas_sueltas, 0),
        'cajas', coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0),
        'envases_llenadora', coalesce(cont.llenadora, 0),
        'litros_producidos', round(coalesce(pt.litros_producidos, 0)),
        'litros_consumidos', round(coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) / 1000.0),
        'merma_envases_pct', case
          when coalesce(cont.llenadora, 0) > 0 then round(
            (1 - ((coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0))
                  * coalesce(p.envases_x_caja, 0))::numeric / cont.llenadora) * 100, 1)
          end,
        'merma_semielaborado_pct', case
          when coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) > 0 then round(
            (1 - coalesce(pt.litros_producidos, 0) / (cont.llenadora * p.volumen_ml / 1000.0)) * 100, 1)
          end
      ),
      'estado', coalesce(v.estado, 'PENDIENTE'),
      'overrides', case when v.estado = 'EDITADO' then jsonb_strip_nulls(jsonb_build_object(
          'paletas', v.paletas,
          'cajasSueltas', v.cajas_sueltas,
          'envasesLlenadora', v.envases_llenadora,
          'litrosConsumidos', v.litros_consumidos,
          'lote', v.lote,
          'mermaEnvasesPct', v.merma_envases_pct,
          'mermaSemielaboradoPct', v.merma_semielaborado_pct,
          'nota', v.nota
        )) else null end,
      'validado_por_nombre', vu.nombre,
      'validado_en', v.validado_en
    ) as fila
    from turno_lineas tl
    join turnos t on t.id = tl.turno_id and t.estado = 'CERRADO'
    join areas ar on ar.id = t.area_id and ar.codigo <> 'PRUEBAS'
    join usuarios su on su.id = t.supervisor_id
    join lineas ln on ln.id = tl.linea_id
    left join presentaciones p on p.id = tl.presentacion_id
    left join sabores s on s.id = tl.sabor_id
    left join familias_producto f on f.id = s.familia_id
    left join producto_terminado pt on pt.turno_linea_id = tl.id
    left join lateral (
      select sum(c.envases_llenadora) as llenadora
      from contadores c
      where c.turno_linea_id = tl.id and coalesce(c.parcial, false) = false
    ) cont on true
    left join validacion_produccion v on v.turno_linea_id = tl.id
    left join usuarios vu on vu.id = v.validado_por
    where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
      and (pt.turno_linea_id is not null or cont.llenadora is not null)
  ) x;

  return v_result;
end;
$$;

grant execute on function listar_validacion_produccion(text, date, date) to anon, authenticated;

-- ------------------------------------------------------------
-- confirmar_produccion(): SÍ — el dato del supervisor es el bueno.
-- ------------------------------------------------------------
create or replace function confirmar_produccion(p_usuario text, p_turno_linea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para validar producción.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select turno_id into v_turno_id from turno_lineas where id = p_turno_linea_id;
  if v_turno_id is null then
    raise exception 'Esa corrida no existe.';
  end if;

  insert into validacion_produccion (turno_linea_id, turno_id, estado, validado_por, validado_en)
  values (p_turno_linea_id, v_turno_id, 'CONFIRMADO', v_usuario_id, now())
  on conflict (turno_linea_id) do update
    set estado = 'CONFIRMADO',
        paletas = null, cajas_sueltas = null, envases_llenadora = null, litros_consumidos = null,
        lote = null, merma_envases_pct = null, merma_semielaborado_pct = null, nota = null,
        validado_por = v_usuario_id, validado_en = now();
end;
$$;

grant execute on function confirmar_produccion(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- editar_produccion_validada(): EDITAR — guarda los valores corregidos
-- (los que vienen null quedan como el supervisor).
-- ------------------------------------------------------------
create or replace function editar_produccion_validada(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer default null,
  p_cajas_sueltas integer default null,
  p_envases_llenadora integer default null,
  p_litros_consumidos numeric default null,
  p_lote text default null,
  p_merma_envases_pct numeric default null,
  p_merma_semielaborado_pct numeric default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para validar producción.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select turno_id into v_turno_id from turno_lineas where id = p_turno_linea_id;
  if v_turno_id is null then
    raise exception 'Esa corrida no existe.';
  end if;

  insert into validacion_produccion (
    turno_linea_id, turno_id, estado,
    paletas, cajas_sueltas, envases_llenadora, litros_consumidos, lote,
    merma_envases_pct, merma_semielaborado_pct, nota,
    validado_por, validado_en
  )
  values (
    p_turno_linea_id, v_turno_id, 'EDITADO',
    p_paletas, p_cajas_sueltas, p_envases_llenadora, p_litros_consumidos, nullif(trim(coalesce(p_lote, '')), ''),
    p_merma_envases_pct, p_merma_semielaborado_pct, nullif(trim(coalesce(p_nota, '')), ''),
    v_usuario_id, now()
  )
  on conflict (turno_linea_id) do update
    set estado = 'EDITADO',
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        envases_llenadora = excluded.envases_llenadora,
        litros_consumidos = excluded.litros_consumidos,
        lote = excluded.lote,
        merma_envases_pct = excluded.merma_envases_pct,
        merma_semielaborado_pct = excluded.merma_semielaborado_pct,
        nota = excluded.nota,
        validado_por = v_usuario_id, validado_en = now();
end;
$$;

grant execute on function editar_produccion_validada(text, uuid, integer, integer, integer, numeric, text, numeric, numeric, text) to anon, authenticated;

-- ------------------------------------------------------------
-- tanques_de_turnos(): los tanques recibidos (tanques_encontrados) y
-- dejados (recepcion_tanques) de una lista de códigos de turno — solo
-- lectura, para que se cruce contra el acta en Validar.
-- ------------------------------------------------------------
create or replace function tanques_de_turnos(p_usuario text, p_codigos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_object_agg(t.codigo, jsonb_build_object(
    'turnoCodigo', t.codigo,
    'recibidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', (e ->> 'numero_tanque')::int,
        'condicion', e ->> 'condicion',
        'sabor', e ->> 'sabor_nombre',
        'lote', e ->> 'lote',
        'volumenL', (e ->> 'volumen_l')::numeric
      ) order by (e ->> 'numero_tanque')::int)
      from jsonb_array_elements(coalesce(t.tanques_encontrados, '[]'::jsonb)) e
    ), '[]'::jsonb),
    'dejados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', rt.numero_tanque,
        'condicion', rt.condicion,
        'sabor', sabor_display(s.nombre, f.nombre),
        'lote', rt.lote,
        'volumenL', rt.volumen_l
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto f on f.id = s.familia_id
      where rt.turno_id = t.id
    ), '[]'::jsonb)
  )), '{}'::jsonb)
  into v_result
  from turnos t
  where t.codigo = any(p_codigos);

  return v_result;
end;
$$;

grant execute on function tanques_de_turnos(text, text[]) to anon, authenticated;
