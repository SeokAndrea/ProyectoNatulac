-- ============================================================
-- CONECTAR TURNOS A SUPABASE + RECEPCIÓN DE TANQUES
-- ============================================================
-- Hasta acá, Comenzar/Finalizar Turno y Contadores y Merma vivían
-- solo en localStorage (ver el comentario viejo en
-- src/lib/turno.tsx). Esta migración conecta ese flujo a las tablas
-- reales "turnos", "turno_lineas" y "contadores" (ya creadas en
-- 20260819120000_core_schema.sql) y agrega "Recepción": 3 tanques
-- fijos que el supervisor completa al iniciar el turno.
--
-- Dos ajustes de esquema que hacían falta:
--   1. "lineas" no tenía columna "codigo" (solo "nombre") — el
--      frontend ya usa códigos fijos LINEA_1/2/3 en todos lados
--      (catalogos.ts), así que se agrega acá para que coincidan.
--   2. La presentación/velocidad de cada línea es POR LÍNEA (dos
--      líneas pueden llenar presentaciones distintas al mismo
--      tiempo — ya así en el frontend), no una sola por turno como
--      había quedado comentado en la migración original. Se agrega
--      a "turno_lineas" en vez de usar turnos.velocidad_llenadora
--      (esa columna queda sin usar, no se borra para no romper nada).
-- ============================================================

alter table lineas add column codigo text;
update lineas set codigo = case nombre
  when 'Línea 1' then 'LINEA_1'
  when 'Línea 2' then 'LINEA_2'
  when 'Línea 3' then 'LINEA_3'
end;
alter table lineas alter column codigo set not null;
alter table lineas add constraint lineas_codigo_unique unique (codigo);

alter table turno_lineas add column presentacion_id uuid references presentaciones (id);
alter table turno_lineas add column envases_hora integer;
alter table turno_lineas add column litros_hora numeric(10, 2);

-- ------------------------------------------------------------
-- RECEPCIÓN: 3 tanques fijos por turno, completados al iniciar
-- (obligatorio — ver iniciar_turno() más abajo, que crea turno y
-- tanques en la misma transacción). Sabor y volumen solo tienen
-- sentido si el tanque tiene producto (condicion = 'VOLUMEN'); si
-- está sucio o vacío, esos datos no aplican.
-- ------------------------------------------------------------
create table recepcion_tanques (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  numero_tanque smallint not null check (numero_tanque between 1 and 3),
  sabor_id uuid references sabores (id),
  condicion text not null check (condicion in ('VOLUMEN', 'SUCIO', 'VACIO')),
  volumen_l numeric(10, 2) check (volumen_l is null or (volumen_l >= 0 and volumen_l <= 20000)),
  lote text,
  created_at timestamptz not null default now(),
  unique (turno_id, numero_tanque),
  check (condicion <> 'VOLUMEN' or sabor_id is not null)
);

alter table recepcion_tanques enable row level security;

-- ------------------------------------------------------------
-- Funciones (security definer, mismo patrón que usuarios/sabores —
-- todas estas tablas tienen RLS activado y sin políticas).
-- ------------------------------------------------------------

-- Arma el turno abierto de un supervisor como un solo objeto JSON
-- (turno + líneas + tanques + contadores), para no tener que hacer
-- 4 consultas separadas desde el frontend cada vez que se carga la
-- página. Devuelve null si no tiene ningún turno ABIERTO.
create or replace function turno_activo_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
  v_result jsonb;
begin
  select t.id into v_turno_id
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where u.usuario = lower(p_usuario) and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora
      ))
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
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
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where t.id = v_turno_id;

  return v_result;
end;
$$;

-- Crea el turno + sus líneas + sus 3 tanques de recepción en una
-- sola transacción (si algo falla, no queda un turno a medias).
-- p_lineas: [{linea_codigo, presentacion_volumen_ml, envases_hora, litros_hora}]
-- p_tanques: [{numero_tanque, sabor_id, condicion, volumen_l, lote}]
create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_lineas jsonb,
  p_tanques jsonb
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

  v_codigo := 'T-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id)
  returning id into v_turno_id;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into turno_lineas (turno_id, linea_id, presentacion_id, envases_hora, litros_hora)
    select v_turno_id, l.id, p.id, (v_linea ->> 'envases_hora')::integer, (v_linea ->> 'litros_hora')::numeric
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

  return turno_activo_de(p_usuario);
end;
$$;

create or replace function finalizar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update turnos
  set estado = 'CERRADO', fecha_fin = current_date, hora_fin = current_time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

create or replace function registrar_contador(
  p_turno_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_envases_buenos integer,
  p_envases_desechados integer,
  p_justificacion text,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
  v_contador contadores%rowtype;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, linea_id, envases_llenadora, envases_buenos, envases_desechados, justificacion, usuario_id)
  values (p_turno_id, v_linea_id, p_envases_llenadora, p_envases_buenos, p_envases_desechados, nullif(p_justificacion, ''), v_usuario_id)
  returning * into v_contador;

  return jsonb_build_object(
    'id', v_contador.id,
    'linea_codigo', p_linea_codigo,
    'envases_llenadora', v_contador.envases_llenadora,
    'envases_buenos', v_contador.envases_buenos,
    'envases_desechados', v_contador.envases_desechados,
    'merma_pct', v_contador.merma_pct,
    'requiere_justificacion', v_contador.requiere_justificacion,
    'justificacion', v_contador.justificacion,
    'creado_en', v_contador.created_at
  );
end;
$$;

grant execute on function turno_activo_de(text) to anon, authenticated;
grant execute on function iniciar_turno(text, text, text, text, jsonb, jsonb) to anon, authenticated;
grant execute on function finalizar_turno(uuid) to anon, authenticated;
grant execute on function registrar_contador(uuid, text, integer, integer, integer, text, text) to anon, authenticated;
