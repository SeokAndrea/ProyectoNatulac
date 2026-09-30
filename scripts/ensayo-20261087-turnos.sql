-- ENSAYO (se puede borrar): aplica la migración 20261087 (rotación de grupos, calendario, 12x12 continuo) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Los chequeos del respaldo usan el Área de Pruebas con una hora simulada (relevo_de_respaldo_en).

begin;

-- ===================== MIGRACIÓN 20261087090000_turnos_rotacion_calendario_12x12.sql =====================
-- ============================================================
-- TURNOS: rotación de grupos, calendario laboral, 12x12 continuo y
-- comenzar el turno de ahora cuando el abierto ya terminó
-- ============================================================
-- Rework 2026-09-29. Caso real (Gabriel, 29/09): el respaldo abrió el T3 del
-- 28 a las 23:00 sin responsable; a las 7:20 Gabriel lo asumió (era lo único
-- que ofrecía Comenzar Turno); a las 7:30 el respaldo lo cerró y abrió el T1
-- sin responsable; a las 8:12 lo tuvo que asumir de nuevo. En 12x12 además
-- pasaba todos los días a las 15:30 y a las 23:00 (el mismo supervisor sigue,
-- pero el respaldo dejaba el turno nuevo sin responsable).
--
--   * ROTACIÓN DE GRUPOS: el grupo es fijo por semana (lunes a viernes) y
--     rota: el de T1 pasa a T3, el de T3 a T2 y el de T2 a T1. Tabla
--     rotacion_grupos (una semana base por área) + grupo_de_rotacion(). El
--     respaldo abre con el grupo de la rotación (ya no "Sin grupo") y el
--     front lo trae elegido al comenzar o asumir. Se puede cambiar a mano
--     (cambiar_grupo_turno).
--   * CALENDARIO: se trabaja de lunes a jueves los 3 turnos y el viernes
--     T1 y T2. Sábado, domingo y el T3 del viernes no se abren solos; si
--     quedó un turno abierto, se cierra 30 min después de su fin (como hacía
--     cerrar_turnos_vencidos antes del respaldo).
--   * 12x12 CONTINUO: a las 15:00 (T1 → T2) y a las 22:30 (T2 → T3) el
--     supervisor no cambia, solo el turno y el grupo. El respaldo abre el
--     turno nuevo con el MISMO responsable, sin esperar los 30 min y sin
--     repetir la revisión de inicio. El cambio de persona sigue siendo a las
--     7:00 y a las 19:00.
--   * iniciar_turno: si el turno sin responsable que está abierto es de
--     OTRA franja (ya terminó, o el supervisor llegó antes del cambio), se
--     puede comenzar el de ahora: abrir_turno cierra el viejo entregando
--     las corridas activas y el nuevo las hereda. Solo se sigue rechazando
--     si el abierto sin responsable es el mismo turno que se quiere abrir.
--   * Datos: el T3 del 28/09 quedó con G3 (lo eligió Gabriel al asumirlo a
--     las 7:20); por la rotación era G1. Se corrige como corrección.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rotación de grupos
-- ------------------------------------------------------------
create table rotacion_grupos (
  area_id uuid primary key references areas (id),
  -- Un lunes cualquiera de referencia y qué grupo tenía cada turno esa semana.
  semana_base date not null check (extract(isodow from semana_base) = 1),
  grupo_t1 text not null references grupos (codigo),
  grupo_t2 text not null references grupos (codigo),
  grupo_t3 text not null references grupos (codigo),
  check (grupo_t1 <> grupo_t2 and grupo_t2 <> grupo_t3 and grupo_t1 <> grupo_t3)
);

alter table rotacion_grupos enable row level security;

-- Aséptico, confirmado con el historial desde el 31/08: semana del 28/09 → T1 G3, T2 G2, T3 G1.
insert into rotacion_grupos (area_id, semana_base, grupo_t1, grupo_t2, grupo_t3)
select id, date '2026-09-28', 'GRUPO_3', 'GRUPO_2', 'GRUPO_1' from areas where codigo = 'ASEPTICO'
on conflict (area_id) do nothing;

-- Grupo que le toca a un turno por la rotación. null = el área no tiene rotación.
-- Cada semana: T1 ← el que estaba en T2, T2 ← el de T3, T3 ← el de T1.
create or replace function grupo_de_rotacion(p_area_codigo text, p_fecha date, p_turno_tipo_codigo text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_r rotacion_grupos;
  v_orden text[];
  v_semana integer;
  v_desfase integer;
begin
  select r.* into v_r from rotacion_grupos r join areas a on a.id = r.area_id where a.codigo = p_area_codigo;
  if v_r.area_id is null or p_fecha is null then
    return null;
  end if;
  v_orden := array[v_r.grupo_t1, v_r.grupo_t2, v_r.grupo_t3];
  v_semana := floor((p_fecha - v_r.semana_base)::numeric / 7)::integer;
  v_desfase := case p_turno_tipo_codigo when 'TURNO_1' then 0 when 'TURNO_2' then 1 when 'TURNO_3' then 2 end;
  if v_desfase is null then
    return null;
  end if;
  return v_orden[(((v_semana + v_desfase) % 3) + 3) % 3 + 1];
end;
$$;

grant execute on function grupo_de_rotacion(text, date, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Calendario laboral: lun–jue T1/T2/T3, vie T1/T2. p_fecha es la fecha
--    operativa del turno (el T3 del jueves es del jueves aunque termine el
--    viernes a las 7:00).
-- ------------------------------------------------------------
create or replace function franja_laborable(p_fecha date, p_turno_tipo_codigo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case extract(isodow from p_fecha)::int
    when 1 then true
    when 2 then true
    when 3 then true
    when 4 then true
    when 5 then p_turno_tipo_codigo in ('TURNO_1', 'TURNO_2')
    else false
  end;
$$;

-- ------------------------------------------------------------
-- 3. Poner el grupo a un turno (código con G). Interno: lo usan el respaldo,
--    cambiar_grupo_turno y la corrección de datos de abajo.
-- ------------------------------------------------------------
create or replace function fijar_grupo_turno(p_turno_id uuid, p_grupo_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_grupo_id uuid;
  v_base text;
begin
  select * into v_turno from turnos where id = p_turno_id for update;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;
  if v_turno.id is null or v_grupo_id is null then
    raise exception 'No se pudo poner el grupo al turno.';
  end if;
  v_base := (select left(a.codigo, 1) from areas a where a.id = v_turno.area_id)
    || to_char(v_turno.fecha, 'YYYYMMDD') || '_T'
    || replace((select codigo from turno_tipos where id = v_turno.turno_tipo_id), 'TURNO_', '')
    || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');
  update turnos
  set grupo_id = v_grupo_id, grupo_pendiente = false, codigo = codigo_turno_libre(v_base, v_turno.id)
  where id = v_turno.id;
end;
$$;

-- ------------------------------------------------------------
-- 4. cambiar_grupo_turno(): el responsable (o quien tenga TURNO_CORREGIR)
--    cambia el grupo del turno ABIERTO, por si ese día no se cumplió la
--    rotación. Los turnos cerrados sin grupo siguen por asignar_grupo_turno.
-- ------------------------------------------------------------
create or replace function cambiar_grupo_turno(p_usuario text, p_turno_id uuid, p_grupo_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
  v_antes text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_turno from turnos where id = p_turno_id;
  if v_turno.id is null then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;
  if not (coalesce(v_turno.supervisor_id = v_usuario_id, false) or tiene_permiso(p_usuario, 'TURNO_CORREGIR')) then
    raise exception 'Solo el responsable del turno puede cambiar el grupo.';
  end if;
  if not exists (select 1 from grupos where codigo = p_grupo_codigo) then
    raise exception 'Elige el grupo del turno.';
  end if;

  v_antes := v_turno.codigo;
  perform fijar_grupo_turno(v_turno.id, p_grupo_codigo);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno', v_turno.id::text, 'Comenzar Turno',
    'Cambió el grupo del turno ' || v_antes || ' a ' || (select nombre from grupos where codigo = p_grupo_codigo),
    jsonb_build_object('codigo', v_antes),
    jsonb_build_object('codigo', (select codigo from turnos where id = v_turno.id), 'grupo', p_grupo_codigo)
  );

  return turno_json(v_turno.id);
end;
$$;

grant execute on function cambiar_grupo_turno(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. iniciar_turno(): solo rechaza si el turno sin responsable abierto es el
--    MISMO que se quiere abrir (misma fecha operativa y tipo). Si es de otra
--    franja, abrir_turno lo cierra (entregando las corridas) y el nuevo lo
--    hereda.
-- ------------------------------------------------------------
-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
  v_ahora timestamp := now() at time zone 'America/Caracas';
  v_fecha date := v_ahora::date;
  v_hora_inicio time;
  v_hora_fin time;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;
  if not tiene_permiso(p_usuario, 'TURNO_ASUMIR') then
    raise exception 'No tienes permiso para iniciar turnos.';
  end if;

  -- Misma fecha operativa que calcula abrir_turno (T3 en la madrugada = día anterior).
  select hora_inicio, hora_fin into v_hora_inicio, v_hora_fin from turno_tipos where codigo = p_turno_tipo_codigo;
  if v_hora_fin < v_hora_inicio and v_ahora::time < v_hora_fin then
    v_fecha := v_fecha - 1;
  end if;

  if exists (
    select 1 from turnos t
    join areas a on a.id = t.area_id
    join turno_tipos tt on tt.id = t.turno_tipo_id
    where a.codigo = p_area_codigo and t.estado = 'ABIERTO' and t.supervisor_id = usuario_sistema_id()
      and tt.codigo = p_turno_tipo_codigo and t.fecha = v_fecha
  ) then
    raise exception 'Ese turno ya está abierto sin responsable. Asúmelo en vez de iniciar otro.';
  end if;

  return turno_json(abrir_turno(v_supervisor_id, p_area_codigo, p_turno_tipo_codigo, p_grupo_codigo, false));
end;
$$;

grant execute on function iniciar_turno(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. relevo_de_respaldo(): calendario, grupo por rotación y 12x12 continuo.
--    El cuerpo pasa a relevo_de_respaldo_en(hora, área) para poder probarlo
--    con una hora simulada en el Área de Pruebas; el cron sigue llamando a
--    relevo_de_respaldo() igual que antes.
-- ------------------------------------------------------------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function relevo_de_respaldo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform relevo_de_respaldo_en(now() at time zone 'America/Caracas', null);
end;
$$;

-- p_ahora: hora de planta. p_area_codigo null = todas las áreas con respaldo menos Pruebas.
create or replace function relevo_de_respaldo_en(p_ahora timestamp, p_area_codigo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := p_ahora;
  v_franja record;
  v_vencio boolean;
  v_area record;
  v_abierto turnos;
  v_tipo_abierto text;
  v_grupo text;
  v_continua boolean;
  v_nuevo uuid;
begin
  select * into v_franja from turno_de_hora(v_ahora);
  v_vencio := v_ahora >= v_franja.inicio + interval '30 minutes';

  for v_area in
    select id, codigo from areas
    where (p_area_codigo is null and turnos_automaticos and codigo <> 'PRUEBAS') or codigo = p_area_codigo
  loop
    v_abierto := null;
    v_tipo_abierto := null;
    select t.* into v_abierto from turnos t
    where t.area_id = v_area.id and t.estado = 'ABIERTO'
    order by t.created_at desc limit 1;
    if v_abierto.id is not null then
      select codigo into v_tipo_abierto from turno_tipos where id = v_abierto.turno_tipo_id;
    end if;

    -- Ya hay un turno abierto de esta franja: nada que hacer.
    if v_abierto.id is not null and v_abierto.fecha = v_franja.fecha and v_tipo_abierto = v_franja.tipo_codigo then
      continue;
    end if;

    -- Abierto por alguien en la hora previa al cambio de franja: es el de esta franja.
    if v_abierto.id is not null and v_abierto.supervisor_id is distinct from usuario_sistema_id()
       and v_abierto.created_at >= (v_franja.inicio - interval '60 minutes') at time zone 'America/Caracas' then
      continue;
    end if;

    -- Franja que no se trabaja (viernes T3, sábado, domingo): no se abre nada;
    -- el turno que quedó abierto se cierra 30 min después de su fin.
    if not franja_laborable(v_franja.fecha, v_franja.tipo_codigo) then
      if v_abierto.id is not null and v_vencio then
        perform cerrar_turno_forzado(v_abierto.id, v_ahora);
      end if;
      continue;
    end if;

    -- 12x12: el T1 pasa al T2 (15:00) y el T2 al T3 (22:30) con el mismo
    -- supervisor. No hace falta esperar a que alguien lo inicie.
    v_continua := v_abierto.id is not null
      and v_abierto.esquema = '12x12'
      and v_abierto.supervisor_id is distinct from usuario_sistema_id()
      and v_abierto.fecha = v_franja.fecha
      and (
        (v_tipo_abierto = 'TURNO_1' and v_franja.tipo_codigo = 'TURNO_2')
        or (v_tipo_abierto = 'TURNO_2' and v_franja.tipo_codigo = 'TURNO_3')
      );

    if not v_continua and not v_vencio then
      continue;
    end if;

    -- Un turno de esta franja ya se abrió y se finalizó: no se reabre.
    if v_abierto.id is null and exists (
      select 1 from turnos t join turno_tipos tt on tt.id = t.turno_tipo_id
      where t.area_id = v_area.id and t.fecha = v_franja.fecha and tt.codigo = v_franja.tipo_codigo
    ) then
      continue;
    end if;

    v_grupo := grupo_de_rotacion(v_area.codigo, v_franja.fecha, v_franja.tipo_codigo);

    if v_continua then
      v_nuevo := abrir_turno(v_abierto.supervisor_id, v_area.codigo, v_franja.tipo_codigo, coalesce(v_grupo, 'GRUPO_1'), true);
      -- Mismo supervisor, mismos tanques y líneas: no repite la revisión de inicio.
      update recepcion_tanques
      set confirmado_inicio_en = now(), confirmado_inicio_por = v_abierto.supervisor_id
      where turno_id = v_nuevo and confirmado_inicio_en is null;
      update turno_lineas
      set confirmado_inicio_en = now(), confirmado_inicio_por = v_abierto.supervisor_id
      where turno_id = v_nuevo and activa and confirmado_inicio_en is null;
    else
      -- Sin rotación: grupo provisorio (el del último turno), pendiente hasta que lo asuman.
      if v_grupo is null then
        select g.codigo into v_grupo from turnos t join grupos g on g.id = t.grupo_id
        where t.area_id = v_area.id order by t.created_at desc limit 1;
        perform abrir_turno(usuario_sistema_id(), v_area.codigo, v_franja.tipo_codigo, coalesce(v_grupo, 'GRUPO_1'), true);
        continue;
      end if;
      v_nuevo := abrir_turno(usuario_sistema_id(), v_area.codigo, v_franja.tipo_codigo, v_grupo, true);
    end if;

    if v_grupo is not null then
      perform fijar_grupo_turno(v_nuevo, v_grupo);
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 7. Datos: el T3 del 28/09 quedó con G3; por la rotación era G1.
-- ------------------------------------------------------------
do $$
declare
  v_turno_id uuid;
  v_usuario_id uuid;
begin
  select id into v_turno_id from turnos where codigo = 'A20260928_T3G3';
  select id into v_usuario_id from usuarios where usuario = 'agomez';
  if v_turno_id is null or v_usuario_id is null then
    return;
  end if;

  perform fijar_grupo_turno(v_turno_id, 'GRUPO_1');
  insert into turno_correcciones (turno_id, usuario_id, motivo)
  values (v_turno_id, v_usuario_id, 'Grupo corregido por la rotación: Grupo 1 (quedó Grupo 3 al asumirlo a las 7:20 del 29/09)');
  perform registrar_auditoria(
    'agomez', 'EDITAR', 'turno', v_turno_id::text, 'Auditoría',
    'Corrigió el grupo del turno A20260928_T3G3 a Grupo 1 (rotación de grupos)',
    jsonb_build_object('codigo', 'A20260928_T3G3'),
    jsonb_build_object('codigo', (select codigo from turnos where id = v_turno_id), 'grupo', 'GRUPO_1')
  );
end;
$$;

-- ===================== CHEQUEOS =====================
do $$
declare
  v_pr uuid := (select id from areas where codigo = 'PRUEBAS');
  v_sis uuid := usuario_sistema_id();
  v_a uuid;
  v_b uuid;
  v_tipo text;
  v_otro text;
  v_x uuid;
  v_t uuid;
  v_j jsonb;
  v_ab turnos;
  v_tipo_ab text;
  v_casos text[][] := array[
    -- fecha, turno, grupo esperado (historial real de Aséptico)
    ['2026-08-31', 'TURNO_1', 'GRUPO_1'], ['2026-08-31', 'TURNO_2', 'GRUPO_3'], ['2026-08-31', 'TURNO_3', 'GRUPO_2'],
    ['2026-09-07', 'TURNO_1', 'GRUPO_3'], ['2026-09-08', 'TURNO_2', 'GRUPO_2'], ['2026-09-09', 'TURNO_3', 'GRUPO_1'],
    ['2026-09-15', 'TURNO_1', 'GRUPO_2'], ['2026-09-16', 'TURNO_2', 'GRUPO_1'], ['2026-09-17', 'TURNO_3', 'GRUPO_3'],
    ['2026-09-21', 'TURNO_1', 'GRUPO_1'], ['2026-09-22', 'TURNO_2', 'GRUPO_3'], ['2026-09-24', 'TURNO_3', 'GRUPO_2'],
    ['2026-09-28', 'TURNO_1', 'GRUPO_3'], ['2026-09-28', 'TURNO_2', 'GRUPO_2'], ['2026-09-29', 'TURNO_3', 'GRUPO_1'],
    ['2026-10-05', 'TURNO_1', 'GRUPO_2'], ['2026-10-06', 'TURNO_3', 'GRUPO_3']
  ];
  v_i int;
begin
  -- 1. Rotación: coincide con el historial real
  for v_i in 1..array_length(v_casos, 1) loop
    if grupo_de_rotacion('ASEPTICO', v_casos[v_i][1]::date, v_casos[v_i][2]) is distinct from v_casos[v_i][3] then
      raise exception 'FALLA 1: rotación % % dio % (esperado %)', v_casos[v_i][1], v_casos[v_i][2],
        grupo_de_rotacion('ASEPTICO', v_casos[v_i][1]::date, v_casos[v_i][2]), v_casos[v_i][3];
    end if;
  end loop;
  if grupo_de_rotacion('PRUEBAS', date '2026-10-01', 'TURNO_1') is not null then
    raise exception 'FALLA 1: Pruebas no debería tener rotación';
  end if;

  -- 2. Calendario
  if not franja_laborable(date '2026-10-01', 'TURNO_3') then raise exception 'FALLA 2: jueves T3 se trabaja'; end if;
  if franja_laborable(date '2026-10-02', 'TURNO_3') then raise exception 'FALLA 2: viernes T3 no se trabaja'; end if;
  if not franja_laborable(date '2026-10-02', 'TURNO_2') then raise exception 'FALLA 2: viernes T2 se trabaja'; end if;
  if franja_laborable(date '2026-10-03', 'TURNO_1') then raise exception 'FALLA 2: sábado no se trabaja'; end if;
  if franja_laborable(date '2026-10-04', 'TURNO_3') then raise exception 'FALLA 2: domingo T3 no se trabaja'; end if;
  if not franja_laborable(date '2026-10-05', 'TURNO_1') then raise exception 'FALLA 2: lunes T1 se trabaja'; end if;

  -- Preparación en Pruebas (todo se deshace al final)
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  insert into usuarios (usuario, password_hash, nombre) values ('ens_a', 'x', 'Sup A'), ('ens_b', 'x', 'Sup B');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, v_pr from usuarios u join roles r on r.codigo = 'SUPERVISOR' where u.usuario in ('ens_a', 'ens_b');
  select id into v_a from usuarios where usuario = 'ens_a';
  select id into v_b from usuarios where usuario = 'ens_b';
  insert into rotacion_grupos (area_id, semana_base, grupo_t1, grupo_t2, grupo_t3)
  values (v_pr, date '2026-09-28', 'GRUPO_3', 'GRUPO_2', 'GRUPO_1');

  -- 3. iniciar_turno: rechaza el MISMO turno sin responsable; el de otra franja lo reemplaza
  v_tipo := (select tipo_codigo from turno_de_hora(now() at time zone 'America/Caracas'));
  v_otro := case v_tipo when 'TURNO_1' then 'TURNO_2' else 'TURNO_1' end;
  v_x := abrir_turno(v_sis, 'PRUEBAS', v_tipo, 'GRUPO_1', true);
  begin
    perform iniciar_turno('ens_a', 'PRUEBAS', v_tipo, 'GRUPO_1');
    raise exception 'FALLA 3a: inició el mismo turno que estaba sin responsable';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
    if sqlerrm not like 'Ese turno ya está abierto sin responsable%' then
      raise exception 'FALLA 3a: mensaje inesperado: %', sqlerrm;
    end if;
  end;
  v_x := abrir_turno(v_sis, 'PRUEBAS', v_otro, 'GRUPO_1', true);
  v_j := iniciar_turno('ens_a', 'PRUEBAS', v_tipo, 'GRUPO_2');
  v_t := (v_j ->> 'id')::uuid;
  if (select estado from turnos where id = v_x) <> 'CERRADO' then
    raise exception 'FALLA 3b: el turno viejo sin responsable no se cerró';
  end if;
  if (select supervisor_id from turnos where id = v_t) <> v_a then
    raise exception 'FALLA 3c: el turno nuevo no quedó a cargo de quien lo comenzó';
  end if;

  -- 4. cambiar_grupo_turno
  begin
    perform cambiar_grupo_turno('no_existe_ensayo', v_t, 'GRUPO_3');
    raise exception 'FALLA 4a: un usuario inexistente cambió el grupo';
  exception when others then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;
  perform cambiar_grupo_turno('ens_a', v_t, 'GRUPO_3');
  if (select codigo from turnos where id = v_t) not like '%G3%' then
    raise exception 'FALLA 4b: el código no quedó con G3: %', (select codigo from turnos where id = v_t);
  end if;

  -- 5. 12x12, jueves 01/10 15:10: T1 → T2 con el mismo supervisor, sin esperar 30 min, grupo por rotación
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  v_x := abrir_turno(v_a, 'PRUEBAS', 'TURNO_1', 'GRUPO_3', false);
  update turnos set fecha = date '2026-10-01', esquema = '12x12',
    created_at = timestamp '2026-10-01 07:00' at time zone 'America/Caracas' where id = v_x;
  perform relevo_de_respaldo_en(timestamp '2026-10-01 15:10', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  select codigo into v_tipo_ab from turno_tipos where id = v_ab.turno_tipo_id;
  if (select estado from turnos where id = v_x) <> 'CERRADO' or v_tipo_ab <> 'TURNO_2' then
    raise exception 'FALLA 5a: 12x12 a las 15:10 no pasó al T2';
  end if;
  if v_ab.supervisor_id <> v_a or not exists (select 1 from turno_responsables where turno_id = v_ab.id and usuario_id = v_a and motivo = 'INICIO') then
    raise exception 'FALLA 5b: el T2 no quedó con el mismo supervisor';
  end if;
  if v_ab.grupo_pendiente or (select codigo from grupos where id = v_ab.grupo_id) <> 'GRUPO_2' then
    raise exception 'FALLA 5c: el T2 del 01/10 debería tener Grupo 2 por rotación';
  end if;

  -- 6. 12x12, jueves 22:40: T2 (ya con relevo de B) → T3 con B.
  --    El T2 nació con el esquema del área (Pruebas es 3x8): se marca 12x12, como en Aséptico.
  update turnos set fecha = date '2026-10-01', supervisor_id = v_b, esquema = '12x12',
    created_at = timestamp '2026-10-01 15:00' at time zone 'America/Caracas' where id = v_ab.id;
  perform relevo_de_respaldo_en(timestamp '2026-10-01 22:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  select codigo into v_tipo_ab from turno_tipos where id = v_ab.turno_tipo_id;
  if v_tipo_ab <> 'TURNO_3' or v_ab.supervisor_id <> v_b then
    raise exception 'FALLA 6: 12x12 a las 22:40 no pasó al T3 con el supervisor de la noche';
  end if;
  if (select codigo from grupos where id = v_ab.grupo_id) <> 'GRUPO_1' then
    raise exception 'FALLA 6: el T3 del 01/10 debería tener Grupo 1';
  end if;

  -- 7. 12x12, viernes 7:10: a las 7:00 SÍ cambia la persona → no pasa solo; a las 7:40 respaldo sin responsable
  update turnos set fecha = date '2026-10-01',
    created_at = timestamp '2026-10-01 22:30' at time zone 'America/Caracas' where id = v_ab.id;
  v_x := v_ab.id;
  perform relevo_de_respaldo_en(timestamp '2026-10-02 07:10', 'PRUEBAS');
  if (select estado from turnos where id = v_x) <> 'ABIERTO' then
    raise exception 'FALLA 7a: a las 7:10 no debería tocar el T3';
  end if;
  perform relevo_de_respaldo_en(timestamp '2026-10-02 07:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  if (select estado from turnos where id = v_x) <> 'CERRADO' or v_ab.supervisor_id <> v_sis then
    raise exception 'FALLA 7b: a las 7:40 debería abrir el T1 sin responsable';
  end if;
  if v_ab.grupo_pendiente or (select codigo from grupos where id = v_ab.grupo_id) <> 'GRUPO_3' then
    raise exception 'FALLA 7c: el T1 del viernes 02/10 debería nacer con Grupo 3 por rotación';
  end if;

  -- 8. 3x8, jueves 08/10: a las 15:10 espera; a las 15:40 abre el T2 sin responsable.
  --    Fecha propia: dentro del ensayo now() no avanza y todos los turnos tienen la misma
  --    hora_inicio, así que abrir_turno elegiría como "anterior" a uno de los chequeos de arriba.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  v_x := abrir_turno(v_a, 'PRUEBAS', 'TURNO_1', 'GRUPO_3', false);
  update turnos set fecha = date '2026-10-08', esquema = '3x8',
    created_at = timestamp '2026-10-08 07:00' at time zone 'America/Caracas' where id = v_x;
  perform relevo_de_respaldo_en(timestamp '2026-10-08 15:10', 'PRUEBAS');
  if (select estado from turnos where id = v_x) <> 'ABIERTO' then
    raise exception 'FALLA 8a: en 3x8 no debería actuar antes de los 30 min';
  end if;
  perform relevo_de_respaldo_en(timestamp '2026-10-08 15:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  if (select estado from turnos where id = v_x) <> 'CERRADO' or v_ab.supervisor_id <> v_sis then
    raise exception 'FALLA 8b: en 3x8 a las 15:40 debería abrir el T2 sin responsable';
  end if;

  -- 9. Viernes 23:10: cierra el T2 y no abre T3
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  v_x := abrir_turno(v_a, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2026-10-02', esquema = '12x12',
    created_at = timestamp '2026-10-02 15:00' at time zone 'America/Caracas' where id = v_x;
  perform relevo_de_respaldo_en(timestamp '2026-10-02 22:40', 'PRUEBAS');
  if (select estado from turnos where id = v_x) <> 'ABIERTO' then
    raise exception 'FALLA 9a: viernes 22:40 no debería cerrar todavía (ni pasar a T3 en 12x12)';
  end if;
  perform relevo_de_respaldo_en(timestamp '2026-10-02 23:10', 'PRUEBAS');
  if (select estado from turnos where id = v_x) <> 'CERRADO' then
    raise exception 'FALLA 9b: viernes 23:10 debería cerrar el T2';
  end if;
  if exists (select 1 from turnos where area_id = v_pr and estado = 'ABIERTO') then
    raise exception 'FALLA 9c: viernes de noche no debería abrir T3';
  end if;

  -- 10. Sábado y domingo: nada
  perform relevo_de_respaldo_en(timestamp '2026-10-03 07:40', 'PRUEBAS');
  perform relevo_de_respaldo_en(timestamp '2026-10-04 23:10', 'PRUEBAS');
  perform relevo_de_respaldo_en(timestamp '2026-10-05 03:00', 'PRUEBAS');
  if exists (select 1 from turnos where area_id = v_pr and estado = 'ABIERTO') then
    raise exception 'FALLA 10: el fin de semana no debería abrir turnos';
  end if;

  -- 11. Lunes 7:40: sí abre el T1
  perform relevo_de_respaldo_en(timestamp '2026-10-05 07:40', 'PRUEBAS');
  if not exists (select 1 from turnos where area_id = v_pr and estado = 'ABIERTO') then
    raise exception 'FALLA 11: el lunes 7:40 debería abrir el T1';
  end if;

  -- 12. El cron real corre sin error
  perform relevo_de_respaldo();

  -- 13. Dato: T3 del 28/09 pasa a Grupo 1
  if exists (select 1 from turnos where codigo = 'A20260928_T3G3') then
    raise exception 'FALLA 13: el T3 del 28/09 sigue con G3';
  end if;
end;
$$;

do $$
begin
  raise exception 'ENSAYO OK: la migración 20261087 funciona (13 chequeos). No quedó nada aplicado.';
end;
$$;

rollback;
