-- ============================================================
-- Relevo sin finalizar: al iniciar un turno, cerrar el anterior si quedó ABIERTO
-- ============================================================
-- Reporte de planta (2026-09-10): Deivis no le dio Finalizar Turno y
-- Danny inició el suyo. `iniciar_turno` no revisa si el turno anterior
-- del área sigue ABIERTO — quedaron DOS turnos abiertos a la vez. El
-- turno de Deivis se volvió un zombi: nunca se selló, nunca se congeló
-- su `volumenes_lote_cierre`, no sale como "turno pasado" (ese filtro
-- pide estado = 'CERRADO') y su producción no pasa a VALIDAR.
--
-- Arreglo: `iniciar_turno`, después de ubicar el turno anterior del área
-- y ANTES de heredar su estado, lo cierra si sigue ABIERTO — con el
-- MISMO sellado que ya hace el cron `cerrar_turnos_vencidos`:
--   * corridas sin resolver (corriendo/pausada sin entregar, o en
--     ESPERANDO_PT)  ->  activa = false, finalizada_en = now(). No
--     inventa PT: quedan en VALIDAR por `cierre_automatico = true`.
--   * corridas ya entregadas (`entregada_en` puesto)  ->  intactas,
--     siguen `activa` para que el turno nuevo las herede.
--   * `revisar_cierre_de_lote` por cada lote (idempotente).
--   * turno  ->  estado = 'CERRADO', fecha_fin/hora_fin = ahora (planta),
--     `cierre_automatico = true`. El trigger congela `volumenes_lote_cierre`.
--
-- Ese bloque se extrae de `cerrar_turnos_vencidos` a una función
-- `cerrar_turno_forzado(turno_id, ahora_planta)` para que las dos vías
-- (cron por reloj, relevo por `iniciar_turno`) sellen exactamente igual.
--
-- Todo `create or replace` + una función nueva. `cerrar_turnos_vencidos`
-- queda con el mismo comportamiento (llama al helper). `iniciar_turno`
-- idéntica a 20261032 salvo el `perform cerrar_turno_forzado(...)`.
-- Reversible re-aplicando 20261030 y 20261032 + drop del helper.
-- ============================================================

-- ------------------------------------------------------------
-- 1. cerrar_turno_forzado() — sella un turno como si lo hubiera cerrado
--    el cron. No-op si el turno ya no está ABIERTO (seguro de llamar
--    siempre). No llama a finalizar_turno (esa exige resolver a mano).
-- ------------------------------------------------------------
create or replace function cerrar_turno_forzado(p_turno_id uuid, p_ahora_planta timestamp)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid;
begin
  if not exists (select 1 from turnos where id = p_turno_id and estado = 'ABIERTO') then
    return;
  end if;

  -- Sellar corridas sin resolver (mismas que bloquea finalizar_turno):
  -- corriendo/pausada sin entregar, o en ESPERANDO_PT. Sin inventar PT.
  -- Las ya entregadas (entregada_en puesto) NO se tocan: siguen activa
  -- para que el turno siguiente las herede.
  update turno_lineas
  set activa = false,
      finalizada_en = coalesce(finalizada_en, now())
  where turno_id = p_turno_id
    and (
      (activa and entregada_en is null)
      or (activa = false and finalizada_en is null)
    );

  -- Ordenar lote/tanque de cada lote del turno (idempotente).
  for v_lote_id in
    select distinct lote_id from turno_lineas
    where turno_id = p_turno_id and lote_id is not null
  loop
    perform revisar_cierre_de_lote(v_lote_id);
  end loop;

  -- Cerrar el turno (dispara el trigger de freeze de volúmenes).
  update turnos
  set estado = 'CERRADO',
      fecha_fin = p_ahora_planta::date,
      hora_fin = p_ahora_planta::time,
      cierre_automatico = true
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function cerrar_turno_forzado(uuid, timestamp) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. cerrar_turnos_vencidos() — mismo comportamiento que 20261030,
--    ahora delega el sellado por turno en cerrar_turno_forzado().
-- ------------------------------------------------------------
create or replace function cerrar_turnos_vencidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := (now() at time zone 'America/Caracas');
  v_turno_id uuid;
begin
  for v_turno_id in
    select t.id
    from turnos t
    join turno_tipos tt on tt.id = t.turno_tipo_id
    join areas a on a.id = t.area_id
    where t.estado = 'ABIERTO'
      and a.codigo <> 'PRUEBAS'
      and tt.hora_inicio is not null
      and tt.hora_fin is not null
      and ((t.fecha + (case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end)) + tt.hora_fin + interval '30 minutes') < v_ahora
  loop
    perform cerrar_turno_forzado(v_turno_id, v_ahora);
  end loop;
end;
$$;

grant execute on function cerrar_turnos_vencidos() to anon, authenticated;

-- ------------------------------------------------------------
-- 3. iniciar_turno() — idéntica a 20261032 salvo el cierre del turno
--    anterior si quedó ABIERTO (después de ubicarlo, antes de heredar).
-- ------------------------------------------------------------
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
  v_area_id uuid;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_i integer;
  v_hora_inicio_nominal time;
  v_hora_fin_nominal time;
  v_ahora_planta timestamp := now() at time zone 'America/Caracas';
  v_fecha date := v_ahora_planta::date;
  v_hora_inicio time := v_ahora_planta::time;
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
     and v_hora_inicio < v_hora_fin_nominal then
    v_fecha := v_fecha - 1;
  end if;

  v_codigo := left(p_area_codigo, 1) || to_char(v_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '') || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, v_fecha, v_hora_inicio)
  returning id into v_turno_id;

  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by t2.fecha desc, t2.hora_inicio desc, t2.created_at desc
  limit 1;

  -- Relevo sin finalizar: si el turno anterior del área sigue ABIERTO,
  -- se cierra solo (mismo sellado que el cron). Va ANTES de heredar para
  -- que el turno nuevo tome el estado ya resuelto — solo las líneas
  -- entregadas siguen activa y se heredan.
  if v_turno_anterior_id is not null then
    perform cerrar_turno_forzado(v_turno_anterior_id, v_ahora_planta);
  end if;

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

grant execute on function iniciar_turno(text, text, text, text) to anon, authenticated;
