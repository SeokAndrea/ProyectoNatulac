-- ENSAYO (se puede borrar): aplica la migración 20261106 (12x12: el Turno 2 se parte a las 19:00) + chequeos y DESHACE todo.
-- Pegar entero en Supabase → SQL Editor → Run. SIEMPRE termina en error (a propósito, para deshacer todo):
--   'ENSAYO OK: ...'  => funciona, ya se puede hacer db push.
--   cualquier otro error => algo falla; no quedó nada aplicado.
-- Los chequeos del respaldo usan el Área de Pruebas puesta en 12x12 con una hora simulada (relevo_de_respaldo_en).

begin;

-- ===================== MIGRACIÓN 20261106090000_12x12_t2_se_parte_a_las_19.sql =====================
-- ============================================================
-- 12x12: el Turno 2 se parte a las 19:00
-- ============================================================
-- Dueña, 2026-10-06: antes el T2 del 12x12 era un solo turno con relevo a
-- las 19:00 (A → B) y el acta salía mezclada con los dos supervisores.
-- Ahora a las 19:00 el supervisor del día FINALIZA su T2 (con su acta) y el
-- de la noche COMIENZA otro T2 (19:00–22:30). Un día 12x12 tiene dos T2;
-- se distinguen por la hora real de inicio (antes o después de las 17:00,
-- ver src/lib/turno12x12.ts).
--
-- Lo que ya funcionaba sin cambios: no hay único por (área, fecha, tipo);
-- el segundo T2 sale con código "…_2" (codigo_turno_libre); iniciar_turno
-- deja abrirlo y abrir_turno cierra el T2 del día entregando las corridas
-- (su acta queda pendiente en el Hub); paradas_efectivas_turno recorta por
-- la hora real; la continuidad T2 → T3 de las 22:30 sigue con el de la noche.
--
--   * turnos_de_fecha_tipo(): TODOS los turnos de una fecha y tipo (el Panel
--     y el OEE del Panel de Paradas buscaban uno solo y perdían el del día).
--   * relevo_de_respaldo_en(): desde las 19:30, en áreas 12x12, si nadie
--     abrió el T2 de la noche se abre sin responsable (como a las 7:30).
--
-- Nota: el comentario de 20261085 ("el esquema solo afecta el aviso de
-- relevo de las 19:00") ya no vale: ahora decide si el T2 se parte.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Todos los turnos de una fecha y tipo, por hora de inicio.
-- ------------------------------------------------------------
create or replace function turnos_de_fecha_tipo(p_fecha date, p_turno_tipo text, p_area_codigo text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(turno_json(t.id) order by t.hora_inicio, t.created_at), '[]'::jsonb)
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join areas a on a.id = t.area_id
  where t.fecha = p_fecha and tt.codigo = p_turno_tipo
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    );
$$;

grant execute on function turnos_de_fecha_tipo(date, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Respaldo: T2 de la noche en 12x12.
-- ------------------------------------------------------------
-- Última versión: 20261087090000_turnos_rotacion_calendario_12x12.sql
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
    select id, codigo, esquema_turnos from areas
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

    -- 12x12 (20261106): desde las 19:30, si no hay un T2 de la noche (abierto
    -- desde las 17:00), se abre sin responsable. abrir_turno cierra el T2 del
    -- día si sigue abierto, entregando las corridas; su acta queda pendiente.
    if v_area.esquema_turnos = '12x12'
       and v_franja.tipo_codigo = 'TURNO_2'
       and v_ahora::time >= time '19:30'
       and franja_laborable(v_franja.fecha, 'TURNO_2')
       and not exists (
         select 1 from turnos t join turno_tipos tt on tt.id = t.turno_tipo_id
         where t.area_id = v_area.id and t.fecha = v_franja.fecha and tt.codigo = 'TURNO_2'
           and t.hora_inicio >= time '17:00'
       )
    then
      v_grupo := grupo_de_rotacion(v_area.codigo, v_franja.fecha, 'TURNO_2');
      if v_grupo is null then
        select g.codigo into v_grupo from turnos t join grupos g on g.id = t.grupo_id
        where t.area_id = v_area.id order by t.created_at desc limit 1;
        perform abrir_turno(usuario_sistema_id(), v_area.codigo, 'TURNO_2', coalesce(v_grupo, 'GRUPO_1'), true);
      else
        v_nuevo := abrir_turno(usuario_sistema_id(), v_area.codigo, 'TURNO_2', v_grupo, true);
        perform fijar_grupo_turno(v_nuevo, v_grupo);
      end if;
      continue;
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

-- ===================== CHEQUEOS =====================
do $$
declare
  v_pr uuid := (select id from areas where codigo = 'PRUEBAS');
  v_sis uuid := usuario_sistema_id();
  v_a uuid;
  v_b uuid;
  v_dia uuid;
  v_noche uuid;
  v_ab turnos;
  v_tipo_ab text;
  v_lista jsonb;
begin
  -- Preparación en Pruebas (todo se deshace al final): 12x12 y dos supervisores.
  -- Fechas de 2030 y crecientes por caso: abrir_turno toma como "anterior" al de fecha más nueva.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  update areas set esquema_turnos = '12x12' where id = v_pr;
  insert into usuarios (usuario, password_hash, nombre) values ('ens_a', 'x', 'Sup A'), ('ens_b', 'x', 'Sup B');
  insert into usuario_roles (usuario_id, rol_id, area_id)
  select u.id, r.id, v_pr from usuarios u join roles r on r.codigo = 'SUPERVISOR' where u.usuario in ('ens_a', 'ens_b');
  select id into v_a from usuarios where usuario = 'ens_a';
  select id into v_b from usuarios where usuario = 'ens_b';

  -- 1. Martes 01/10: A tiene el T2 del día (15:00); B comienza el T2 de la noche (19:00).
  v_dia := abrir_turno(v_a, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2030-10-01', hora_inicio = time '15:00', esquema = '12x12',
    created_at = timestamp '2030-10-01 15:00' at time zone 'America/Caracas' where id = v_dia;
  v_noche := abrir_turno(v_b, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2030-10-01', hora_inicio = time '19:00', esquema = '12x12',
    created_at = timestamp '2030-10-01 19:00' at time zone 'America/Caracas' where id = v_noche;
  if (select estado from turnos where id = v_dia) <> 'CERRADO' then
    raise exception 'FALLA 1a: al comenzar el T2 de la noche, el del día no se cerró';
  end if;
  if (select codigo from turnos where id = v_dia) = (select codigo from turnos where id = v_noche) then
    raise exception 'FALLA 1b: los dos T2 quedaron con el mismo código';
  end if;

  -- 2. turnos_de_fecha_tipo devuelve los dos, el del día primero
  v_lista := turnos_de_fecha_tipo(date '2030-10-01', 'TURNO_2', 'PRUEBAS');
  if jsonb_array_length(v_lista) <> 2 or (v_lista -> 0 ->> 'id')::uuid <> v_dia or (v_lista -> 1 ->> 'id')::uuid <> v_noche then
    raise exception 'FALLA 2: turnos_de_fecha_tipo debería traer [día, noche], trajo %', jsonb_array_length(v_lista);
  end if;
  if jsonb_array_length(turnos_de_fecha_tipo(date '2030-10-01', 'TURNO_1', 'PRUEBAS')) <> 0 then
    raise exception 'FALLA 2b: sin turnos debería traer []';
  end if;

  -- 3. 19:40 con el T2 de la noche abierto: el respaldo no toca nada
  perform relevo_de_respaldo_en(timestamp '2030-10-01 19:40', 'PRUEBAS');
  if (select estado from turnos where id = v_noche) <> 'ABIERTO'
     or exists (select 1 from turnos where area_id = v_pr and estado = 'ABIERTO' and id <> v_noche) then
    raise exception 'FALLA 3: con el T2 de la noche abierto, a las 19:40 no debería abrir otro';
  end if;

  -- 4. 22:40: el T2 de la noche pasa al T3 con B
  perform relevo_de_respaldo_en(timestamp '2030-10-01 22:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  select codigo into v_tipo_ab from turno_tipos where id = v_ab.turno_tipo_id;
  if v_tipo_ab <> 'TURNO_3' or v_ab.supervisor_id <> v_b then
    raise exception 'FALLA 4: a las 22:40 el T2 de la noche debería pasar al T3 con B';
  end if;

  -- 5. Miércoles 02/10: A no finalizó ni nadie comenzó la noche.
  --    19:10 espera; 19:40 cierra el T2 del día y abre el de la noche sin responsable.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  v_dia := abrir_turno(v_a, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2030-10-02', hora_inicio = time '15:00', esquema = '12x12',
    created_at = timestamp '2030-10-02 15:00' at time zone 'America/Caracas' where id = v_dia;
  perform relevo_de_respaldo_en(timestamp '2030-10-02 19:10', 'PRUEBAS');
  if (select estado from turnos where id = v_dia) <> 'ABIERTO' then
    raise exception 'FALLA 5a: a las 19:10 no debería tocar el T2 del día';
  end if;
  perform relevo_de_respaldo_en(timestamp '2030-10-02 19:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  select codigo into v_tipo_ab from turno_tipos where id = v_ab.turno_tipo_id;
  if (select estado from turnos where id = v_dia) <> 'CERRADO' or v_tipo_ab <> 'TURNO_2' or v_ab.supervisor_id <> v_sis then
    raise exception 'FALLA 5b: a las 19:40 debería cerrar el T2 del día y abrir el de la noche sin responsable';
  end if;

  -- 6. Jueves 03/10: A finalizó a las 19:00 y nadie comenzó. 19:40 abre el T2 de la noche sin responsable.
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  v_dia := abrir_turno(v_a, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2030-10-03', hora_inicio = time '15:00', esquema = '12x12', estado = 'CERRADO',
    created_at = timestamp '2030-10-03 15:00' at time zone 'America/Caracas' where id = v_dia;
  perform relevo_de_respaldo_en(timestamp '2030-10-03 19:40', 'PRUEBAS');
  select * into v_ab from turnos where area_id = v_pr and estado = 'ABIERTO' order by created_at desc limit 1;
  select codigo into v_tipo_ab from turno_tipos where id = v_ab.turno_tipo_id;
  if v_ab.id is null or v_tipo_ab <> 'TURNO_2' or v_ab.supervisor_id <> v_sis then
    raise exception 'FALLA 6: A finalizó y nadie comenzó: a las 19:40 debería abrir el T2 de la noche sin responsable';
  end if;

  -- 7. En 3x8 el T2 no se parte: 19:40 no toca el T2 abierto
  update turnos set estado = 'CERRADO' where area_id = v_pr and estado = 'ABIERTO';
  update areas set esquema_turnos = '3x8' where id = v_pr;
  v_dia := abrir_turno(v_a, 'PRUEBAS', 'TURNO_2', 'GRUPO_2', false);
  update turnos set fecha = date '2030-10-07', hora_inicio = time '15:00', esquema = '3x8',
    created_at = timestamp '2030-10-07 15:00' at time zone 'America/Caracas' where id = v_dia;
  perform relevo_de_respaldo_en(timestamp '2030-10-07 19:40', 'PRUEBAS');
  if (select estado from turnos where id = v_dia) <> 'ABIERTO'
     or exists (select 1 from turnos where area_id = v_pr and estado = 'ABIERTO' and id <> v_dia) then
    raise exception 'FALLA 7: en 3x8 no debería partir el T2';
  end if;

  -- 8. El cron real corre sin error
  perform relevo_de_respaldo();
end;
$$;

do $$
begin
  raise exception 'ENSAYO OK: la migración 20261106 funciona (8 chequeos). No quedó nada aplicado.';
end;
$$;

rollback;
