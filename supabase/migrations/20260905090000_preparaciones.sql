-- ============================================================
-- PREPARACIONES + "Líneas en uso" (sabor) + tanque "EN PREPARACIÓN"
-- ============================================================
-- Lo que el documento de diseño (resumen-diseno-dashboard-natulac.md)
-- llama "corrida" — nombre real en planta: Preparación. Especificado
-- por el usuario tras consultarlo con el analista de producción.
--
--   1. Recepción gana una 4ª condición de tanque: EN_PREPARACION —
--      igual que Sucio/Vacío, no pide sabor/volumen/lote en ese
--      momento (eso se carga después, en Preparaciones).
--   2. "Líneas a usar" (Comenzar Turno) pasa a ser "Líneas en uso" en
--      el frontend — conceptualmente, ahora una línea puede traer un
--      sabor ya asignado si viene corriendo del turno anterior. Acá
--      se agrega la columna para guardarlo (turno_lineas.sabor_id).
--   3. Preparaciones: sección aparte (como Contadores), puede haber
--      VARIAS por tanque en el mismo turno (se prepara, se usa, se
--      vuelve a preparar). Carga 100% manual — el supervisor solo
--      anota cuántos tambores usó (el cálculo cajas→litros→tambores
--      lo hace el analista de producción, fuera de la app). Los
--      ajustes (agua, azúcar, ácido cítrico) son solo para
--      calidad/inventario — no afectan ningún cálculo, se guardan
--      planos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tanques: nueva condición
-- ------------------------------------------------------------
alter table recepcion_tanques drop constraint recepcion_tanques_condicion_check;
alter table recepcion_tanques add constraint recepcion_tanques_condicion_check
  check (condicion in ('VOLUMEN', 'SUCIO', 'VACIO', 'EN_PREPARACION'));

-- ------------------------------------------------------------
-- 2. Líneas en uso: sabor opcional (cuando la línea continúa del
--    turno anterior en vez de arrancar de cero).
-- ------------------------------------------------------------
alter table turno_lineas add column sabor_id uuid references sabores (id);

-- ------------------------------------------------------------
-- 3. Preparaciones
-- ------------------------------------------------------------
create table preparaciones (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  numero_tanque smallint not null check (numero_tanque between 1 and 3),
  sabor_id uuid references sabores (id),
  lote text,
  tambores integer not null check (tambores >= 0),
  agua numeric(10, 2) check (agua is null or agua >= 0),
  azucar numeric(10, 2) check (azucar is null or azucar >= 0),
  acido_citrico numeric(10, 2) check (acido_citrico is null or acido_citrico >= 0),
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

alter table preparaciones enable row level security;

create or replace function registrar_preparacion(
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_sabor_nombre text;
  v_prep preparaciones%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select nombre into v_sabor_nombre from sabores where id = p_sabor_id;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, nullif(p_lote, ''), p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning * into v_prep;

  return jsonb_build_object(
    'id', v_prep.id,
    'numero_tanque', v_prep.numero_tanque,
    'sabor_id', v_prep.sabor_id,
    'sabor_nombre', v_sabor_nombre,
    'lote', v_prep.lote,
    'tambores', v_prep.tambores,
    'agua', v_prep.agua,
    'azucar', v_prep.azucar,
    'acido_citrico', v_prep.acido_citrico,
    'creado_en', v_prep.created_at
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. turno_json(): agrega sabor a "lineas" y el array "preparaciones"
-- ------------------------------------------------------------
create or replace function turno_json(p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'estado', t.estado,
    'fecha_fin', t.fecha_fin,
    'hora_fin', t.hora_fin,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sl.nombre
      ))
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre,
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'envases_desechados', c.envases_desechados,
        'merma_pct', c.merma_pct,
        'requiere_justificacion', c.requiere_justificacion,
        'justificacion', c.justificacion,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l3.codigo,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', s2.nombre,
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at
      ))
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', s3.nombre,
        'lote', prep.lote,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      where prep.turno_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- 5. iniciar_turno(): guarda sabor_id por línea (cuando la línea
--    continúa del turno anterior con un sabor conocido).
-- ------------------------------------------------------------
create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_lineas jsonb,
  p_tanques jsonb,
  p_fecha date,
  p_hora_inicio time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_area_id uuid;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_linea jsonb;
  v_tanque jsonb;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := 'T-' || to_char(p_fecha, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio)
  returning id into v_turno_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id)
    select v_turno_id, l.id, p.id, (v_linea ->> 'envases_hora')::integer, (v_linea ->> 'litros_hora')::numeric,
           nullif(v_linea ->> 'sabor_id', '')::uuid
    from lineas l
    left join presentaciones p on p.volumen_ml = (v_linea ->> 'presentacion_volumen_ml')::integer
    where l.codigo = v_linea ->> 'linea_codigo';
  end loop;

  for v_tanque in select * from jsonb_array_elements(p_tanques)
  loop
    insert into recepcion_tanques (turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote)
    values (
      v_turno_id,
      (v_tanque ->> 'numero_tanque')::smallint,
      nullif(v_tanque ->> 'sabor_id', '')::uuid,
      v_tanque ->> 'condicion',
      nullif(v_tanque ->> 'volumen_l', '')::numeric,
      nullif(v_tanque ->> 'lote', '')
    );
  end loop;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function registrar_preparacion(uuid, smallint, uuid, text, integer, numeric, numeric, numeric, text) to anon, authenticated;
