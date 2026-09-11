-- ============================================================
-- TIEMPO DE PLANTA: un solo marco horario (America/Caracas)
-- ============================================================
-- Bug reportado: en Auditoría "se combinan horarios y fechas entre
-- supervisores". Causa: el sistema guarda la hora en DOS marcos
-- incompatibles y las vistas los mezclan.
--
--   * `turnos.fecha` / `hora_inicio` / `hora_fin` → los mandaba el
--     navegador (`fechaLocal(now())` / `horaLocal(now())`), o sea el
--     reloj de ESA PC, sin zona. (20260826 los había movido al navegador
--     justamente porque `now()` de Postgres corría en UTC y daba un
--     desfase — pero la solución quedó a mitad de camino: sacó el UTC,
--     no puso la zona de planta.)
--   * `activada_en`, `creado_en`, `updated_at`, … → `now()` en UTC.
--
-- Al mostrarlos / agruparlos, cada uno cae en la zona de quien mira
-- (navegador) o en UTC crudo (`::date`), y un T3 que cruza medianoche o
-- el corte de las 7:00 termina en el día equivocado.
--
-- ARREGLO (lado servidor). Venezuela es UTC−4 fijo (sin DST desde 2016).
--   1. `iniciar_turno` / `finalizar_turno` calculan fecha/hora en el
--      servidor: `now() at time zone 'America/Caracas'`. Se les sacan
--      los parámetros `p_fecha` / `p_hora` (el frontend deja de
--      mandarlos — ver src/lib/turno.tsx). La lógica de turno nocturno
--      (§2.10 / 20261019) se mantiene, ahora sobre la hora de planta.
--   2. `historial_dia_area()` se retira: la página "Historial del Día"
--      (única consumidora) se eliminó del frontend. Tenía además el
--      mismo bug (`<col>::date` en UTC crudo).
--
-- `cerrar_turnos_vencidos` (cron, 20260944) ya usaba `at time zone
-- 'America/Caracas'` — no se toca.
--
-- Reversible re-aplicando 20261019 / 20261028 (firmas viejas de
-- iniciar/finalizar_turno) + 20260986 (historial_dia_area) y el
-- frontend anterior. Cambia la firma de iniciar_turno/finalizar_turno →
-- sube junto con su frontend.
-- ============================================================

-- ------------------------------------------------------------
-- 1. iniciar_turno() — fecha/hora operativa las calcula el servidor.
--    Cuerpo idéntico a 20261019 salvo el origen de v_fecha / v_hora_inicio.
-- ------------------------------------------------------------
drop function if exists iniciar_turno(text, text, text, text, date, time);

create function iniciar_turno(
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

-- ------------------------------------------------------------
-- 2. finalizar_turno() — fecha_fin / hora_fin las calcula el servidor.
--    Guardas idénticas a 20261028.
-- ------------------------------------------------------------
drop function if exists finalizar_turno(uuid, date, time);

create function finalizar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
begin
  -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
  end if;

  -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
  -- del tramo de este turno y elegir Terminar o Entregar línea.
  select string_agg(l.nombre, ', ' order by l.codigo)
  into v_lineas_activas
  from turno_lineas tl
  join lineas l on l.id = tl.linea_id
  where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

  if v_lineas_activas is not null then
    raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
      v_lineas_activas;
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function finalizar_turno(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. historial_dia_area() — se retira (la página "Historial del Día"
--    se eliminó del frontend; era su única consumidora).
-- ------------------------------------------------------------
drop function if exists historial_dia_area(text, date);
