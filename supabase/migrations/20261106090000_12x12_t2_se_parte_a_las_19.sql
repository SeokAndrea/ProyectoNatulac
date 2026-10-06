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
