-- ============================================================
-- TURNO NOCTURNO: la fecha es la del día operativo, no la del reloj
-- ============================================================
-- Fase 2 del rework, §2.10. Bug real (Javier, noche 2026-09-07→08):
-- activó el Turno 3 pasada la medianoche y el sistema lo registró como
-- Turno 3 del día siguiente. `iniciar_turno` recibe `p_fecha` del
-- frontend como la fecha de calendario del instante (`fechaLocal(now())`),
-- sin ninguna lógica de turno nocturno; el `codigo` se deriva de esa
-- misma fecha, así que también sale mal, y el Panel / las estadísticas
-- filtran por `turnos.fecha`, así que el turno "desaparece" del día
-- correcto.
--
-- Regla (data-driven, sin umbral fijo — usa las horas nominales del
-- propio turno_tipo):
--   Si el turno_tipo cruza medianoche (hora_fin < hora_inicio, p. ej.
--   T3 = 22:30 → 07:00) y se activa en la cola de la madrugada
--   (p_hora_inicio < hora_fin nominal), la fecha operativa es la del
--   DÍA ANTERIOR. Si cambian el horario de T3, la regla lo sigue.
--
--   T3 22:30→07:00:  activar 00:30  -> 00:30 < 07:00 -> fecha - 1  ✔
--                    activar 22:45  -> 22:45 < 07:00 falso -> igual ✔
--                    activar 06:00  -> 06:00 < 07:00 -> fecha - 1 (cola) ✔
--   T1/T2 (no cruzan medianoche): la primera condición nunca se cumple.
--
-- `hora_inicio` se guarda tal cual (el reloj real, p. ej. 00:30 — un T3
-- legítimamente cruza medianoche). Solo `fecha` y `codigo` se corren.
--
-- Reversible re-aplicando 20260946090000. Idéntica salvo el cálculo de
-- v_fecha.
-- ============================================================

create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
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
  v_turno_anterior_id uuid;
  v_i integer;
  v_hora_inicio_nominal time;
  v_hora_fin_nominal time;
  v_fecha date := p_fecha;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id, hora_inicio, hora_fin
    into v_turno_tipo_id, v_hora_inicio_nominal, v_hora_fin_nominal
  from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  -- Turno que cruza medianoche + activado en la cola de la madrugada
  -- => la fecha operativa es la del día anterior.
  if v_hora_inicio_nominal is not null and v_hora_fin_nominal is not null
     and v_hora_fin_nominal < v_hora_inicio_nominal
     and p_hora_inicio < v_hora_fin_nominal then
    v_fecha := p_fecha - 1;
  end if;

  v_codigo := left(p_area_codigo, 1) || to_char(v_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '') || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, v_fecha, p_hora_inicio)
  returning id into v_turno_id;

  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by t2.fecha desc, t2.hora_inicio desc, t2.created_at desc
  limit 1;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por,
      pausada_en, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por,
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

  return turno_json(v_turno_id);
end;
$$;
