-- ============================================================
-- VALIDAR JORNADA: la Analista revisa el día y recién ahí cuenta en los KPIs
-- ============================================================
-- Dueña, 2026-10-12 (maqueta aprobada, primero solo en Pruebas): la
-- Analista valida la jornada (7:00 a 7:00, por turnos.fecha) en cuatro
-- partes. Las cajas ya se validan por turno (validacion_turno,
-- 20261108590000); acá se suman las otras tres y el cierre del día:
--
--   * validacion_contador: por corrida (turno_linea). Confirmar, o corregir
--     el contador de la llenadora (ej. cargaron la lectura acumulada).
--   * validacion_lote: por lote y jornada. Confirmar, o corregir el volumen
--     final del día (el tanque se midió distinto).
--   * validacion_parada: por parada. Confirmar, corregir los minutos, o
--     "No cuenta" (EXCLUIDA: supervisor y Mantenimiento cargaron la misma).
--   * validacion_jornada: VALIDADA cierra el día (las tres de arriba ya no
--     se cambian); REABIERTA lo vuelve a abrir, con nota obligatoria.
--
-- Lo del supervisor nunca se toca: lo corregido vive en estas tablas. Los
-- KPIs (próximo paso) leen solo las jornadas VALIDADAS.
-- Permisos: VALIDAR, superadmin o dueño (puede_validar_dia). Mientras se
-- prueba: quien está en el Área de Pruebas valida las jornadas de Pruebas
-- (prueba_propia), también las cajas por turno.
-- ============================================================

create table if not exists validacion_jornada (
  area_id uuid not null references areas (id) on delete cascade,
  fecha date not null,
  estado text not null check (estado in ('VALIDADA', 'REABIERTA')),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now(),
  primary key (area_id, fecha)
);
alter table validacion_jornada enable row level security;

create table if not exists validacion_contador (
  turno_linea_id uuid primary key references turno_lineas (id) on delete cascade,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO')),
  -- Contador de la llenadora corregido (total de la corrida); null = vale el del supervisor.
  envases_llenadora integer check (envases_llenadora is null or envases_llenadora >= 0),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now()
);
alter table validacion_contador enable row level security;

create table if not exists validacion_lote (
  preparacion_id uuid not null references preparaciones (id) on delete cascade,
  fecha date not null,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO')),
  -- Volumen al final de la jornada, medido; null = vale el del sistema.
  volumen_final numeric(10, 2) check (volumen_final is null or volumen_final >= 0),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now(),
  primary key (preparacion_id, fecha)
);
alter table validacion_lote enable row level security;

create table if not exists validacion_parada (
  parada_id uuid primary key references paradas (id) on delete cascade,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO', 'EXCLUIDA')),
  -- Minutos corregidos; null = vale la duración registrada.
  minutos integer check (minutos is null or minutos > 0),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now()
);
alter table validacion_parada enable row level security;

-- ------------------------------------------------------------
-- Pruebas: su cuenta valida sus propias jornadas.
-- ------------------------------------------------------------
create or replace function prueba_propia(p_usuario text, p_area_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_area_codigo = 'PRUEBAS'
     and coalesce((select area_codigo = 'PRUEBAS' from rol_y_area_de(p_usuario)), false);
$$;
revoke execute on function prueba_propia(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Candado: con la jornada VALIDADA no se cambia nada de ese día.
-- ------------------------------------------------------------
create or replace function exigir_jornada_abierta(p_area_id uuid, p_fecha date)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (select 1 from validacion_jornada where area_id = p_area_id and fecha = p_fecha and estado = 'VALIDADA') then
    raise exception 'La jornada del % ya está validada. Reábrela para cambiarla.', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
end;
$$;
revoke execute on function exigir_jornada_abierta(uuid, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Lectura
-- ------------------------------------------------------------
-- Estado de las jornadas de un rango (para la tira de días).
create or replace function jornadas_validadas(p_usuario text, p_area_codigo text, p_desde date, p_hasta date)
returns table (fecha date, estado text, nota text, validado_por_nombre text, validado_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (puede_ver_resumen_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para ver la validación.';
  end if;
  return query
  select vj.fecha, vj.estado, vj.nota, u.nombre, vj.validado_en
  from validacion_jornada vj
  join areas a on a.id = vj.area_id
  left join usuarios u on u.id = vj.validado_por
  where a.codigo = p_area_codigo and vj.fecha between p_desde and p_hasta
  order by vj.fecha;
end;
$$;
grant execute on function jornadas_validadas(text, text, date, date) to anon, authenticated;

-- Lo validado de una jornada: contadores, lotes y paradas.
create or replace function validacion_jornada_de(p_usuario text, p_area_codigo text, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
begin
  if not (puede_ver_resumen_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para ver la validación.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;

  return jsonb_build_object(
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'turno_linea_id', vc.turno_linea_id, 'estado', vc.estado, 'envases_llenadora', vc.envases_llenadora,
        'nota', vc.nota, 'validado_por_nombre', u.nombre))
      from validacion_contador vc
      join turno_lineas tl on tl.id = vc.turno_linea_id
      join turnos t on t.id = tl.turno_id
      left join usuarios u on u.id = vc.validado_por
      where t.area_id = v_area_id and t.fecha = p_fecha
    ), '[]'::jsonb),
    'lotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'preparacion_id', vl.preparacion_id, 'estado', vl.estado, 'volumen_final', vl.volumen_final,
        'nota', vl.nota, 'validado_por_nombre', u.nombre))
      from validacion_lote vl
      join preparaciones p on p.id = vl.preparacion_id
      join turnos t on t.id = p.turno_id
      left join usuarios u on u.id = vl.validado_por
      where t.area_id = v_area_id and vl.fecha = p_fecha
    ), '[]'::jsonb),
    'paradas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'parada_id', vp.parada_id, 'estado', vp.estado, 'minutos', vp.minutos,
        'nota', vp.nota, 'validado_por_nombre', u.nombre))
      from validacion_parada vp
      join paradas pa on pa.id = vp.parada_id
      join turnos t on t.id = pa.turno_id
      left join usuarios u on u.id = vp.validado_por
      where t.area_id = v_area_id and t.fecha = p_fecha
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function validacion_jornada_de(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Confirmar / corregir
-- ------------------------------------------------------------
-- Contador de una corrida: p_envases_llenadora null = confirmar lo del supervisor.
create or replace function validar_contador(p_usuario text, p_turno_linea_id uuid, p_envases_llenadora integer default null, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
  v_estado text := case when p_envases_llenadora is null then 'CONFIRMADO' else 'EDITADO' end;
begin
  select t.* into v_turno from turnos t join turno_lineas tl on tl.turno_id = t.id where tl.id = p_turno_linea_id;
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, (select codigo from areas where id = v_turno.area_id))) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  if v_turno.id is null then
    raise exception 'No se encontró la corrida.';
  end if;
  perform exigir_jornada_abierta(v_turno.area_id, v_turno.fecha);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into validacion_contador (turno_linea_id, estado, envases_llenadora, nota, validado_por, validado_en)
  values (p_turno_linea_id, v_estado, p_envases_llenadora, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (turno_linea_id) do update
    set estado = excluded.estado, envases_llenadora = excluded.envases_llenadora, nota = excluded.nota,
        validado_por = excluded.validado_por, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_contador', p_turno_linea_id::text, 'Validar jornada',
    format('Contador de una corrida del turno %s: %s', v_turno.codigo,
           case when p_envases_llenadora is null then 'confirmó lo del supervisor' else format('corrigió a %s envases', p_envases_llenadora) end),
    null, jsonb_strip_nulls(jsonb_build_object('estado', v_estado, 'envases_llenadora', p_envases_llenadora))
  );
end;
$$;
grant execute on function validar_contador(text, uuid, integer, text) to anon, authenticated;

-- Lote en una jornada: p_volumen_final null = confirmar el volumen del sistema.
create or replace function validar_lote(p_usuario text, p_preparacion_id uuid, p_fecha date, p_volumen_final numeric default null, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prep preparaciones;
  v_area_id uuid;
  v_usuario_id uuid;
  v_estado text := case when p_volumen_final is null then 'CONFIRMADO' else 'EDITADO' end;
begin
  if p_volumen_final is not null and p_volumen_final < 0 then
    raise exception 'El volumen final no puede ser negativo.';
  end if;
  select * into v_prep from preparaciones where id = p_preparacion_id;
  if v_prep.id is null then
    raise exception 'No se encontró el lote.';
  end if;
  select area_id into v_area_id from turnos where id = v_prep.turno_id;
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, (select codigo from areas where id = v_area_id))) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  perform exigir_jornada_abierta(v_area_id, p_fecha);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into validacion_lote (preparacion_id, fecha, estado, volumen_final, nota, validado_por, validado_en)
  values (p_preparacion_id, p_fecha, v_estado, p_volumen_final, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (preparacion_id, fecha) do update
    set estado = excluded.estado, volumen_final = excluded.volumen_final, nota = excluded.nota,
        validado_por = excluded.validado_por, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_lote', p_preparacion_id::text || ' ' || p_fecha::text, 'Validar jornada',
    format('Lote %s (Tanque %s) del %s: %s', coalesce(v_prep.lote, '?'), v_prep.numero_tanque, to_char(p_fecha, 'DD/MM/YYYY'),
           case when p_volumen_final is null then 'confirmó el volumen del sistema' else format('corrigió el final a %s L', p_volumen_final) end),
    null, jsonb_strip_nulls(jsonb_build_object('estado', v_estado, 'volumen_final', p_volumen_final))
  );
end;
$$;
grant execute on function validar_lote(text, uuid, date, numeric, text) to anon, authenticated;

-- Parada: CONFIRMADO, EDITADO (con minutos) o EXCLUIDA ("No cuenta").
create or replace function validar_parada(p_usuario text, p_parada_id uuid, p_estado text, p_minutos integer default null, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
begin
  if p_estado not in ('CONFIRMADO', 'EDITADO', 'EXCLUIDA') then
    raise exception 'Estado de validación inválido: %', p_estado;
  end if;
  if p_estado = 'EDITADO' and (p_minutos is null or p_minutos <= 0) then
    raise exception 'Los minutos corregidos tienen que ser más de 0.';
  end if;
  select t.* into v_turno from turnos t join paradas pa on pa.turno_id = t.id where pa.id = p_parada_id;
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, (select codigo from areas where id = v_turno.area_id))) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  if v_turno.id is null then
    raise exception 'No se encontró la parada.';
  end if;
  perform exigir_jornada_abierta(v_turno.area_id, v_turno.fecha);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into validacion_parada (parada_id, estado, minutos, nota, validado_por, validado_en)
  values (p_parada_id, p_estado, case when p_estado = 'EDITADO' then p_minutos end, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (parada_id) do update
    set estado = excluded.estado, minutos = excluded.minutos, nota = excluded.nota,
        validado_por = excluded.validado_por, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_parada', p_parada_id::text, 'Validar jornada',
    format('Parada del turno %s: %s', v_turno.codigo,
           case p_estado when 'CONFIRMADO' then 'confirmó' when 'EXCLUIDA' then 'no cuenta' else format('corrigió a %s min', p_minutos) end),
    null, jsonb_strip_nulls(jsonb_build_object('estado', p_estado, 'minutos', p_minutos))
  );
end;
$$;
grant execute on function validar_parada(text, uuid, text, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Validar / reabrir la jornada
-- ------------------------------------------------------------
create or replace function validar_jornada(p_usuario text, p_area_codigo text, p_fecha date, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_usuario_id uuid;
begin
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'No se encontró el área %.', p_area_codigo;
  end if;
  if exists (select 1 from turnos where area_id = v_area_id and fecha = p_fecha and estado = 'ABIERTO') then
    raise exception 'Todavía hay un turno abierto en esa jornada: se valida cuando cierren los tres.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into validacion_jornada (area_id, fecha, estado, nota, validado_por, validado_en)
  values (v_area_id, p_fecha, 'VALIDADA', nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (area_id, fecha) do update
    set estado = 'VALIDADA', nota = excluded.nota, validado_por = excluded.validado_por, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_jornada', p_area_codigo || ' ' || p_fecha::text, 'Validar jornada',
    format('Validó la jornada del %s (%s)', to_char(p_fecha, 'DD/MM/YYYY'), p_area_codigo), null, jsonb_build_object('estado', 'VALIDADA')
  );
end;
$$;
grant execute on function validar_jornada(text, text, date, text) to anon, authenticated;

create or replace function reabrir_jornada(p_usuario text, p_area_codigo text, p_fecha date, p_nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_usuario_id uuid;
begin
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Escribe por qué se reabre la jornada.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update validacion_jornada
  set estado = 'REABIERTA', nota = trim(p_nota), validado_por = v_usuario_id, validado_en = now()
  where area_id = v_area_id and fecha = p_fecha and estado = 'VALIDADA';
  if not found then
    raise exception 'Esa jornada no está validada.';
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_jornada', p_area_codigo || ' ' || p_fecha::text, 'Validar jornada',
    format('Reabrió la jornada del %s (%s): %s', to_char(p_fecha, 'DD/MM/YYYY'), p_area_codigo, trim(p_nota)),
    jsonb_build_object('estado', 'VALIDADA'), jsonb_build_object('estado', 'REABIERTA')
  );
end;
$$;
grant execute on function reabrir_jornada(text, text, date, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Cajas por turno: mismas funciones, con prueba_propia.
-- ------------------------------------------------------------
-- Última versión: 20261108390000_resumen_diario_jefe_y_analista.sql
create or replace function resumen_produccion_dia_por_turno(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  turno_id uuid,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  linea_codigo text,
  cajas bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (puede_ver_resumen_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select
    t.id,
    nombre_sabor_resumen(pt.sabor_id),
    pr.volumen_ml,
    l.codigo,
    sum(pt.paletas * pt.cajas_x_paleta + pt.cajas_sueltas)::bigint
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join presentaciones pr on pr.id = pt.presentacion_id
  join lineas l on l.id = pt.linea_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha
  group by t.id, nombre_sabor_resumen(pt.sabor_id), pr.volumen_ml, l.codigo;
end;
$$;

-- Última versión: 20261108590000_validacion_por_turno.sql
create or replace function validacion_turnos_de(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  turno_id uuid,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  estado text,
  cajas integer,
  nota text,
  validado_por_nombre text,
  validado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (puede_ver_resumen_dia(p_usuario) or prueba_propia(p_usuario, p_area_codigo)) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select vt.turno_id, vt.sabor_nombre, vt.volumen_ml, vt.estado, vt.cajas, vt.nota, u.nombre, vt.validado_en
  from validacion_turno vt
  join turnos t on t.id = vt.turno_id
  join areas a on a.id = t.area_id
  left join usuarios u on u.id = vt.validado_por
  where a.codigo = p_area_codigo and t.fecha = p_fecha;
end;
$$;

-- Última versión: 20261108590000_validacion_por_turno.sql (+ prueba_propia y el candado de la jornada)
create or replace function validar_turno(
  p_usuario text,
  p_turno_id uuid,
  p_sabor_nombre text,
  p_volumen_ml integer,
  p_cajas integer default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
  v_antes validacion_turno;
  v_estado text := case when p_cajas is null then 'CONFIRMADO' else 'EDITADO' end;
begin
  if p_cajas is not null and p_cajas < 0 then
    raise exception 'Las cajas no pueden ser negativas.';
  end if;
  select * into v_turno from turnos where id = p_turno_id;
  if v_turno.id is null then
    raise exception 'No se encontró el turno.';
  end if;
  if not (puede_validar_dia(p_usuario) or prueba_propia(p_usuario, (select codigo from areas where id = v_turno.area_id))) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  perform exigir_jornada_abierta(v_turno.area_id, v_turno.fecha);

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_antes from validacion_turno
  where turno_id = p_turno_id and sabor_nombre = p_sabor_nombre and volumen_ml = p_volumen_ml;

  insert into validacion_turno (turno_id, sabor_nombre, volumen_ml, estado, cajas, nota, validado_por, validado_en)
  values (p_turno_id, p_sabor_nombre, p_volumen_ml, v_estado, p_cajas, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (turno_id, sabor_nombre, volumen_ml) do update
    set estado = excluded.estado,
        cajas = excluded.cajas,
        nota = excluded.nota,
        validado_por = excluded.validado_por,
        validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_turno', format('%s %s %s', v_turno.codigo, p_sabor_nombre, p_volumen_ml), 'Resumen Diario',
    format('%s %s ml del turno %s: %s', p_sabor_nombre, p_volumen_ml, v_turno.codigo,
           case when p_cajas is null then 'confirmó lo del supervisor' else format('corrigió a %s cajas', p_cajas) end),
    case when v_antes.turno_id is null then null else jsonb_strip_nulls(jsonb_build_object('estado', v_antes.estado, 'cajas', v_antes.cajas, 'nota', v_antes.nota)) end,
    jsonb_strip_nulls(jsonb_build_object('estado', v_estado, 'cajas', p_cajas, 'nota', nullif(trim(coalesce(p_nota, '')), '')))
  );
end;
$$;
