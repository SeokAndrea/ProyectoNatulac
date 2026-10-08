-- ============================================================
-- Relevo temprano: el que llegó antes sigue en el turno siguiente
-- ============================================================
-- Dueña, 2026-10-08: Javier llegó temprano (04:09) y la app solo le ofrecía
-- "Tomar el relevo" del T3 (Comenzar T1 aparece 1 h antes). Lo tomó, y a las
-- 7:30 el respaldo vio un T3 abierto, lo cerró y abrió el T1 "Sin
-- responsable"; tuvo que asumirlo de nuevo. Ayer pasó igual (relevo 06:54).
--
--   * relevo_de_respaldo_en(): si el responsable actual del turno saliente
--     lo tomó por RELEVO o ASUMIR en las 4 h previas al cambio de franja,
--     es el del turno siguiente: a la hora de inicio (sin esperar los 30
--     min) se abre el turno nuevo a su nombre, como la continuidad 12x12,
--     sin repetir la revisión de inicio.
--   * abrir_turno(): cierra TODOS los turnos abiertos del área, no solo "el
--     anterior". Lo buscaba por (fecha, hora_inicio) y un T3 iniciado
--     después de medianoche (hora_inicio 01:53) quedaba detrás del T3 de las
--     22:48 de la misma fecha: el 07/10 A20261006_T3G2 siguió ABIERTO ~30 h
--     en paralelo. El turno del que se heredan tanques y líneas es el
--     abierto (o, si no hay, el último creado).
-- ============================================================

-- ------------------------------------------------------------
-- 1. abrir_turno(): cierra todos los abiertos del área.
-- ------------------------------------------------------------
-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
create or replace function abrir_turno(
  p_supervisor_id uuid,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_automatico boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid := p_supervisor_id;
  v_area_id uuid;
  v_esquema text;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_abierto_id uuid;
  v_i integer;
  v_hora_inicio_nominal time;
  v_hora_fin_nominal time;
  v_ahora_planta timestamp := now() at time zone 'America/Caracas';
  v_fecha date := v_ahora_planta::date;
  v_hora_inicio time := v_ahora_planta::time;
begin
  select id, esquema_turnos into v_area_id, v_esquema from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  select id, hora_inicio, hora_fin
    into v_turno_tipo_id, v_hora_inicio_nominal, v_hora_fin_nominal
  from turno_tipos where codigo = p_turno_tipo_codigo;
  if v_turno_tipo_id is null or v_hora_inicio_nominal is null then
    raise exception 'Turno % no válido. El 12x12 se trabaja como turnos 1, 2 y 3 con relevo.', p_turno_tipo_codigo;
  end if;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;
  if v_grupo_id is null then
    raise exception 'Grupo % no existe', p_grupo_codigo;
  end if;

  -- Turno que cruza medianoche + activado en la cola de la madrugada
  -- => la fecha operativa es la del día anterior.
  if v_hora_fin_nominal < v_hora_inicio_nominal and v_hora_inicio < v_hora_fin_nominal then
    v_fecha := v_fecha - 1;
  end if;

  v_codigo := left(p_area_codigo, 1) || to_char(v_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '');
  if not p_automatico then
    v_codigo := v_codigo || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');
  end if;
  v_codigo := codigo_turno_libre(v_codigo);

  insert into turnos (
    codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, esquema, apertura_automatica, grupo_pendiente
  )
  values (
    v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, v_fecha, v_hora_inicio, v_esquema, p_automatico, p_automatico
  )
  returning id into v_turno_id;

  if v_supervisor_id is distinct from usuario_sistema_id() then
    insert into turno_responsables (turno_id, usuario_id, motivo) values (v_turno_id, v_supervisor_id, 'INICIO');
  end if;

  -- De dónde se heredan tanques y líneas: el abierto más reciente; si no
  -- hay, el último creado. No por (fecha, hora_inicio): un T3 iniciado
  -- después de medianoche queda detrás del de las 22:30 de su misma fecha.
  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by (t2.estado = 'ABIERTO') desc, t2.created_at desc
  limit 1;

  -- Relevo sin finalizar: todo turno del área que siga ABIERTO se cierra
  -- solo. Antes, sus corridas activas se ENTREGAN (no se sellan): la línea
  -- sigue corriendo en la planta y el turno nuevo la hereda.
  for v_abierto_id in
    select id from turnos
    where area_id = v_area_id and id <> v_turno_id and estado = 'ABIERTO'
  loop
    perform entregar_corridas_automatico(v_abierto_id);
    update turno_responsables set hasta = now() where turno_id = v_abierto_id and hasta is null;
    perform cerrar_turno_forzado(v_abierto_id, v_ahora_planta);
  end loop;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
      pausada_en, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por, actualizada_por,
      pausada_en, lote_terminado_en
    from turno_lineas
    where turno_id = v_turno_anterior_id and activa;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;

    insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por)
    select v_turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por
    from lineas_estado
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'LIMPIO');
    end loop;

    insert into lineas_estado (turno_id, linea_id)
    select v_turno_id, id from lineas where area_id = v_area_id and activo;
  end if;

  -- Área de Pruebas: sin ceremonia (ver 20261055).
  if p_area_codigo = 'PRUEBAS' then
    update recepcion_tanques
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and confirmado_inicio_en is null;

    update turno_lineas
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and activa and confirmado_inicio_en is null;
  end if;

  return v_turno_id;
end;
$$;

-- ------------------------------------------------------------
-- 2. Respaldo: el relevo temprano sigue en el turno siguiente.
-- ------------------------------------------------------------
-- Última versión: 20261106090000_12x12_t2_se_parte_a_las_19.sql
create or replace function relevo_de_respaldo_en(p_ahora timestamp, p_area_codigo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := p_ahora;
  v_franja record;
  v_previa record;
  v_vencio boolean;
  v_area record;
  v_abierto turnos;
  v_tipo_abierto text;
  v_grupo text;
  v_continua boolean;
  v_nuevo uuid;
begin
  select * into v_franja from turno_de_hora(v_ahora);
  select * into v_previa from turno_de_hora(v_franja.inicio - interval '1 minute');
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

    -- Relevo temprano (20261108): quien tomó el turno de la franja anterior
    -- por relevo o asumiéndolo en las 4 h previas al cambio llegó antes para
    -- el turno siguiente; sigue a su nombre.
    v_continua := v_continua or (
      v_abierto.id is not null
      and v_abierto.supervisor_id is distinct from usuario_sistema_id()
      and v_abierto.fecha = v_previa.fecha
      and v_tipo_abierto = v_previa.tipo_codigo
      and exists (
        select 1 from turno_responsables r
        where r.turno_id = v_abierto.id
          and r.usuario_id = v_abierto.supervisor_id
          and r.hasta is null
          and r.motivo in ('RELEVO', 'ASUMIR')
          and r.desde >= (v_franja.inicio - interval '4 hours') at time zone 'America/Caracas'
      )
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
