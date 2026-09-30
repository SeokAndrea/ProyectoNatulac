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
