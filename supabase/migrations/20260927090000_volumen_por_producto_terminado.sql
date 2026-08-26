-- ============================================================
-- VOLUMEN DEL TANQUE POR PRODUCTO TERMINADO + STANDBY + CIERRE
-- AUTOMÁTICO DE LOTE
-- ============================================================
-- Hasta ahora el volumen del tanque se restaba con el Contador
-- (envases_llenadora × volumen de la presentación, ver
-- 20260914090000_litros_consumidos_lote.sql). El usuario pidió
-- cambiar la fuente: ahora es Producto Terminado (litros_producidos,
-- ya calculado como columna generada) el que resta del tanque —
-- Contador vuelve a ser solo un dato de calidad (envases en la
-- llenadora, para comparar después contra Producto Terminado y sacar
-- la merma), sin efecto sobre el volumen.
--
-- Como Producto Terminado es ADITIVO (se suma lo nuevo a lo ya
-- cargado, ver 20260923090000_producto_terminado_aditivo.sql), lo que
-- hay que restar del tanque en cada carga es el DELTA de
-- litros_producidos de esta carga puntual, no el total acumulado.
--
-- Además, el cierre de un lote deja de depender de que el supervisor
-- arranque una preparación nueva a mano (único disparador hasta
-- ahora, ver iniciar_preparacion() en
-- 20260925090000_lote_terminado_continuidad.sql) — ahora también se
-- dispara solo cuando la corrida que lo consumía ya no está activa
-- (Terminó Sabor o Continuar al Siguiente Lote) Y todavía no se había
-- cerrado (evita re-disparar en cargas tardías sobre una corrida ya
-- cerrada del todo). En ese momento se mira cuánto quedó en el
-- tanque:
--   - 0 (o menos, se recorta a 0) → el tanque pasa a SUCIO solo, con
--     "Restos del lote X" en vez del "Último: sabor · Lote X" de
--     siempre (ver textoUltimoLote() en EstadoPlantaTabs.tsx, que sabe
--     no duplicar "Lote").
--   - más que 0 → el tanque pasa a un estado NUEVO, STANDBY: ni Listo
--     (el lote ya se cerró, no se puede tomar más de él) ni Sucio (no
--     está vacío) — sabor/volumen/lote se mantienen para que el
--     supervisor decida a mano desde Corregir (Status) si lo guarda
--     (deja Standby o lo pasa a Listo con un lote nuevo encima) o lo
--     bota (lo marca Sucio). Por ahora es solo informativo, sin un
--     flujo de acción propio.
-- En los dos casos, el lote se cierra (preparaciones.cerrado_en) y se
-- avisa a TODAS las corridas activas que lo seguían tomando
-- (turno_lineas.lote_terminado_en) — no solo a la que gatilló el
-- cierre —, para que en Líneas aparezcan las opciones de Terminó
-- Sabor / Continuar al Siguiente Lote.
-- ============================================================

-- ------------------------------------------------------------
-- 1. STANDBY como condición válida de tanque.
-- ------------------------------------------------------------
alter table recepcion_tanques drop constraint recepcion_tanques_condicion_check;
alter table recepcion_tanques add constraint recepcion_tanques_condicion_check
  check (condicion in ('LISTO', 'SUCIO', 'VACIO', 'EN_PREPARACION', 'STANDBY'));

-- ------------------------------------------------------------
-- 2. registrar_contador(): vuelve a ser solo un dato de calidad — ya
--    no resta litros del lote/tanque ni cierra corridas. Eso ahora
--    vive en registrar_producto_terminado().
-- ------------------------------------------------------------
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
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
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id);

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 3. registrar_producto_terminado(): resta el DELTA de
--    litros_producidos del lote/tanque; si la corrida ya no está
--    activa y todavía no se había cerrado, decide Sucio/Standby y
--    cierra el lote en cascada. Devuelve turno_json() completo (antes
--    devolvía solo la fila de producto_terminado) porque ahora puede
--    tocar tanques y líneas además del propio registro.
-- ------------------------------------------------------------
create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_registro producto_terminado%rowtype;
  v_litros_previos numeric;
  v_litros_delta numeric;
  v_lote_id uuid;
  v_corrida_activa boolean;
  v_finalizada_en timestamptz;
  v_numero_tanque smallint;
  v_nuevo_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos into v_litros_previos from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_litros_previos := coalesce(v_litros_previos, 0);

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = producto_terminado.paletas + excluded.paletas,
        cajas_sueltas = producto_terminado.cajas_sueltas + excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  select tl.lote_id, tl.activa, tl.finalizada_en into v_lote_id, v_corrida_activa, v_finalizada_en
  from turno_lineas tl where tl.id = p_turno_linea_id;

  -- Restar el delta del lote (y reflejarlo en el tanque, si sigue
  -- siendo el mismo lote el que tiene cargado) — mismo criterio que
  -- litros_consumidos_lote() usaba con el Contador.
  if v_lote_id is not null then
    if v_litros_delta <> 0 then
      update preparaciones
      set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
      where id = v_lote_id and cerrado_en is null;
    end if;

    select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_nuevo_volumen, v_lote_sabor_id, v_lote_lote
    from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      update recepcion_tanques
      set volumen_l = v_nuevo_volumen
      where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
    end if;
  end if;

  -- Recién cuando la corrida YA NO está activa (Terminó Sabor o
  -- Continuar al Siguiente Lote) y todavía estaba "esperando cierre"
  -- se decide qué pasó con el tanque y se cierra el lote en cascada —
  -- mientras sigue activa, el tanque se queda LISTO bajando de a poco
  -- con cada carga parcial, sin forzar nada.
  if v_corrida_activa is false and v_finalizada_en is null then
    update turno_lineas
    set finalizada_en = now()
    where id = p_turno_linea_id and activa = false and finalizada_en is null;

    if v_lote_id is not null and v_numero_tanque is not null
       and exists (select 1 from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id) then
      if coalesce(v_nuevo_volumen, 0) <= 0 then
        update recepcion_tanques
        set condicion = 'SUCIO',
            sabor_id = null,
            volumen_l = null,
            lote = null,
            lote_id = null,
            activada_en = now(),
            ultimo_sabor_id = v_lote_sabor_id,
            ultimo_lote = 'Restos del lote ' || coalesce(v_lote_lote, '?')
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      else
        update recepcion_tanques
        set condicion = 'STANDBY',
            activada_en = now()
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      end if;

      update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

      update turno_lineas
      set lote_terminado_en = now()
      where lote_id = v_lote_id and activa;
    end if;
  end if;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. cambiar_condicion_tanque(): Standby también conserva
--    sabor/volumen/lote (igual que Listo) — y pasar de Listo O
--    Standby a Sucio a mano también copia el último sabor/lote.
-- ------------------------------------------------------------
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual recepcion_tanques%rowtype;
  v_ultimo_sabor_id uuid;
  v_ultimo_lote text;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion = 'SUCIO' and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote) else null end,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text) to anon, authenticated;
grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;

-- ============================================================
-- CONTINUAR TURNO: heredar Parada y Terminó el Lote, no solo "activa"
-- ============================================================
-- iniciar_turno() copia al turno nuevo las corridas activas del turno
-- anterior (mismo criterio de "estado continuo" documentado en todo
-- el proyecto), pero al armar el INSERT nunca copiaba pausada_en ni
-- (desde que existe) lote_terminado_en — una línea en Parada, o con un
-- lote recién cerrado esperando que el supervisor elija Terminó Sabor
-- / Continuar al Siguiente Lote, cruzaba de turno como si nada hubiera
-- pasado (activa=true, sin ningún aviso). El supervisor nuevo la veía
-- "Activa" normal, sin enterarse de que había algo pendiente. Ahora
-- esos dos datos se heredan igual que activada_en/activada_por.
-- entregada_en/entregada_por siguen sin copiarse a propósito: es la
-- constancia de que ESE supervisor cerró SU parte, no tiene sentido
-- que aparezca ya "entregada" en el turno del supervisor siguiente.
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
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;

  select id into v_area_id from areas where codigo = p_area_codigo;
  select id into v_turno_tipo_id from turno_tipos where codigo = p_turno_tipo_codigo;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;

  v_codigo := 'T-' || to_char(p_fecha, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

  insert into turnos (codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio)
  values (v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, p_fecha, p_hora_inicio)
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
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'VACIO');
    end loop;
  end if;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function iniciar_turno(text, text, text, text, date, time) to anon, authenticated;
