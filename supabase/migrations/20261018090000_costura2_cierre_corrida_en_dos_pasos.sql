-- ============================================================
-- COSTURA 2: la corrida se cierra en dos pasos, Produccion no toca el tanque
-- ============================================================
-- plan-rework-3-modulos-y-merma.md, Fase 1 costura 2 / Fase 2 §2.2
-- (reescrito con el dueno el 2026-09-08).
--
-- Hoy el tanque se cierra desde TRES lugares de Produccion, cada uno
-- parchado por separado (~32 migraciones sobre cerrar_corrida_si_esperando):
--   1. cerrar_corrida_si_esperando()  -> setea finalizada_en Y cierra el tanque
--   2. registrar_producto_terminado() -> tiene su PROPIA copia del bloque de cierre
--   3. cada "terminar" tiene que acordarse de setear mantiene_tanque bien
--
-- Rediseno:
--   * Regla: las funciones de Produccion SOLO escriben en turno_lineas.
--     Nunca en preparaciones ni recepcion_tanques.
--   * revisar_cierre_de_lote(lote_id): UN solo lugar (de Preparacion) que
--     cierra el lote+tanque, y solo cuando el lote quedo en ~0 y ninguna
--     corrida activa lo usa.
--   * cerrar_corrida_si_esperando(): solo setea finalizada_en, despues
--     llama a revisar_cierre_de_lote.
--   * registrar_producto_terminado(): baja volumen_l y llama a
--     cerrar_corrida_si_esperando. Se le saca su bloque de tanque.
--   * terminar_linea / detener_linea_por_falla / terminar_sabor_linea:
--     dejan la corrida en ESPERANDO_PT (activa=false, finalizada_en NULL).
--     NO llaman a cerrar_corrida_si_esperando. El PT la cierra.
--   * finalizar_turno(): rechaza si hay una corrida en ESPERANDO_PT.
--   * activar_linea / continuar_siguiente_lote: no auto-cierran la corrida
--     vieja sin PT. activar_linea rechaza si la linea ya tiene una corrida
--     activa, o si el lote tiene una corrida en ESPERANDO_PT.
--
-- "ESPERANDO_PT" no es una columna nueva: es el estado derivado
-- activa = false AND finalizada_en IS NULL (ya existia como "esperando
-- cierre"). mantiene_tanque queda como columna muerta, inofensiva.
--
-- Un solo archivo (una transaccion): las piezas son interdependientes,
-- mejor todo-o-nada que una aplicacion parcial.
-- ============================================================

-- ------------------------------------------------------------
-- A. revisar_cierre_de_lote(lote_id) -- NUEVA, de Preparacion.
--    Cierra el lote + limpia el tanque solo si: el lote no esta cerrado,
--    ninguna corrida activa lo usa, y ya no le queda volumen.
--    (misma logica que estaba enterrada en cerrar_corrida_si_esperando,
--    ahora en un solo lugar y con las dos guardas juntas)
-- ------------------------------------------------------------
create or replace function revisar_cierre_de_lote(p_lote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
  v_numero_tanque smallint;
  v_volumen numeric;
  v_cerrado_en timestamptz;
  v_sabor_id uuid;
  v_lote_texto text;
begin
  if p_lote_id is null then
    return;
  end if;

  select turno_id, numero_tanque, volumen_l, cerrado_en, sabor_id, lote
  into v_turno_id, v_numero_tanque, v_volumen, v_cerrado_en, v_sabor_id, v_lote_texto
  from preparaciones where id = p_lote_id;

  if v_cerrado_en is not null then
    return;                                  -- ya cerrado
  end if;

  if exists (select 1 from turno_lineas where lote_id = p_lote_id and activa) then
    return;                                  -- todavia hay una corrida usandolo
  end if;

  if coalesce(v_volumen, 0) > 0 then
    return;                                  -- la linea paro antes de vaciarlo;
                                             -- Preparacion lo maneja (transferir/desvasar/reusar)
  end if;

  -- Lote agotado y sin corrida activa: se cierra.
  update preparaciones set cerrado_en = now() where id = p_lote_id and cerrado_en is null;

  if v_numero_tanque is not null then
    update recepcion_tanques
    set condicion = 'SUCIO',
        sabor_id = null,
        volumen_l = null,
        lote = null,
        lote_id = null,
        activada_en = now(),
        ultimo_sabor_id = v_sabor_id,
        ultimo_lote = 'Restos del lote ' || coalesce(v_lote_texto, '?')
    where turno_id = v_turno_id and numero_tanque = v_numero_tanque and lote_id = p_lote_id;
  end if;

  -- Otras corridas que apuntaban a este lote: marcarlo terminado.
  update turno_lineas set lote_terminado_en = now()
  where lote_id = p_lote_id and lote_terminado_en is null;
end;
$$;

grant execute on function revisar_cierre_de_lote(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- B. cerrar_corrida_si_esperando(): se queda solo con el cierre de la
--    corrida. El tanque lo decide revisar_cierre_de_lote. Sin
--    mantiene_tanque (ya no aplica).
-- ------------------------------------------------------------
create or replace function cerrar_corrida_si_esperando(p_turno_id uuid, p_turno_linea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corrida_activa boolean;
  v_finalizada_en timestamptz;
  v_lote_id uuid;
begin
  select tl.activa, tl.finalizada_en, tl.lote_id
  into v_corrida_activa, v_finalizada_en, v_lote_id
  from turno_lineas tl where tl.id = p_turno_linea_id;

  -- Solo corridas en ESPERANDO_PT (ya no activas, todavia sin finalizar).
  if v_corrida_activa is not false or v_finalizada_en is not null then
    return;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  perform revisar_cierre_de_lote(v_lote_id);
end;
$$;

grant execute on function cerrar_corrida_si_esperando(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- C. registrar_producto_terminado(): idéntica a 20261004090000 salvo
--    que se le saca el bloque de cierre de tanque (lineas 124-154 de esa
--    migración). Solo baja volumen_l y deja que
--    cerrar_corrida_si_esperando -> revisar_cierre_de_lote hagan el resto.
-- ------------------------------------------------------------
drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean, text, boolean);

create function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_producto_retenido boolean default false,
  p_cajas_retenidas integer default null,
  p_parcial boolean default false,
  p_forzar_total boolean default false,
  p_pagina text default null,
  p_auditar boolean default true
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
  v_parcial boolean := coalesce(p_parcial, false);
  v_tiene_parciales boolean;
  v_aditivo boolean;
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
  v_pt_creado timestamptz;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, tiene_parciales, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_tiene_parciales, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  v_aditivo := v_parcial or (coalesce(v_tiene_parciales, false) and not coalesce(p_forzar_total, false));

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt and not v_aditivo
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.';
  end if;

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id,
    producto_retenido, cajas_retenidas, tiene_parciales
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id,
    p_producto_retenido, p_cajas_retenidas, v_parcial
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = case when v_aditivo then producto_terminado.paletas + excluded.paletas else excluded.paletas end,
        cajas_sueltas = case when v_aditivo then producto_terminado.cajas_sueltas + excluded.cajas_sueltas else excluded.cajas_sueltas end,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        producto_retenido = excluded.producto_retenido,
        cajas_retenidas = excluded.cajas_retenidas,
        tiene_parciales = producto_terminado.tiene_parciales or excluded.tiene_parciales,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  if v_parcial then
    insert into producto_terminado_parciales (
      turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
    )
    values (
      p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
    );
  end if;

  -- Solo baja el volumen del lote. El cierre del lote/tanque lo hace
  -- revisar_cierre_de_lote (vía cerrar_corrida_si_esperando). Producción
  -- no escribe en recepcion_tanques.
  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_litros_delta <> 0 then
    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
    where id = v_lote_id and cerrado_en is null;
  end if;

  if not v_parcial then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas%s',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas,
             case when v_parcial then ' (entrega parcial)' else '' end),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- D. Las funciones que PARAN una linea dejan la corrida en ESPERANDO_PT.
--    NO llaman a cerrar_corrida_si_esperando: la corrida no se cierra
--    hasta que se cargue su PT. Ninguna toca el tanque.
-- ------------------------------------------------------------
create or replace function terminar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- activa=false, finalizada_en sigue NULL => ESPERANDO_PT.
  update turno_lineas
  set activa = false, pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_linea(text, uuid, uuid) to anon, authenticated;

-- terminar_sabor_linea se retira como accion de linea; se deja como
-- alias de terminar_linea por si algo viejo todavia la llama.
create or replace function terminar_sabor_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set activa = false, pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_sabor_linea(text, uuid, uuid) to anon, authenticated;

-- detener_linea_por_falla: idéntica a 20260993 salvo que ya NO llama a
-- cerrar_corrida_si_esperando (la corrida queda ESPERANDO_PT). Sigue
-- dejando la linea en DETENIDA con el motivo en la misma transaccion.
create or replace function detener_linea_por_falla(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select linea_id into v_linea_id
  from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_linea_id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  -- Para la corrida (queda ESPERANDO_PT). El tanque no se toca.
  update turno_lineas
  set activa = false, pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id;

  -- Y en la MISMA transacción, deja la línea en Detenida con el motivo.
  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, 'DETENIDA', now(), nullif(btrim(p_motivo), ''), v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'DETENIDA',
        activada_en = excluded.activada_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function detener_linea_por_falla(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- E. finalizar_turno(): no se puede cerrar el turno con una corrida en
--    ESPERANDO_PT (detenida y sin PT cargado).
-- ------------------------------------------------------------
create or replace function finalizar_turno(p_turno_id uuid, p_fecha_fin date, p_hora_fin time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
  end if;

  update turnos
  set estado = 'CERRADO', fecha_fin = p_fecha_fin, hora_fin = p_hora_fin
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function finalizar_turno(uuid, date, time) to anon, authenticated;

-- ------------------------------------------------------------
-- F. activar_linea(): idéntica a 20261006 salvo el bloque de guardas.
--    - Ya NO auto-cierra la corrida vieja de la línea sin PT.
--    - Rechaza si la línea ya tiene una corrida activa (hay que
--      detenerla y cargar su PT).
--    - Rechaza si el lote de ese tanque tiene una corrida en
--      ESPERANDO_PT (de cualquier línea).
--    - Se retira la guarda antiduplicados vieja: repetir línea+lote con
--      su PT cargado es legítimo; los repetidos reales los marca VALIDAR.
-- ------------------------------------------------------------
create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_numero_tanque smallint,
  p_confirmar_inicio boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_presentacion_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  -- Guarda: la línea ya tiene una corrida en curso (activa o en Parada
  -- Operacional). Hay que detenerla y cargar su PT antes de arrancar otra.
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and linea_id = v_linea_id and activa
  ) then
    raise exception '% ya tiene una corrida en curso. Detén la línea y carga su Producto Terminado antes de activar otra.',
      coalesce(v_linea_nombre, p_linea_codigo);
  end if;

  -- Guarda: el lote de ese tanque tiene una corrida detenida sin PT
  -- (ESPERANDO_PT). Cerrar ese ciclo primero.
  if v_tanque.lote_id is not null and exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and lote_id = v_tanque.lote_id
      and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sobre el Lote % sin su Producto Terminado. Cárgalo antes de volver a activar.',
      v_tanque.lote;
  end if;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id,
    case when p_confirmar_inicio then now() else null end,
    case when p_confirmar_inicio then v_usuario_id else null end
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- F.2 continuar_siguiente_lote(): la corrida vieja pasa a ESPERANDO_PT
--     (no se auto-finaliza sin PT). El resto igual que 20261006.
-- ------------------------------------------------------------
create or replace function continuar_siguiente_lote(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual turno_lineas%rowtype;
  v_ancho integer;
  v_lote_siguiente text;
  v_tanque recepcion_tanques%rowtype;
  v_candidatos integer;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
    raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente.', v_actual.lote;
  end if;

  v_ancho := length(v_actual.lote);
  v_lote_siguiente := lpad((v_actual.lote::bigint + 1)::text, greatest(v_ancho, 4), '0');

  select count(*) into v_candidatos
  from recepcion_tanques
  where turno_id = p_turno_id
    and condicion = 'LISTO'
    and lote = v_lote_siguiente
    and sabor_id is not distinct from v_actual.sabor_id;

  if v_candidatos = 0 then
    raise exception 'No hay ningún tanque Listo con el Lote % del mismo sabor. Activa la línea manualmente si corresponde.', v_lote_siguiente;
  end if;
  if v_candidatos > 1 then
    raise exception 'Hay más de un tanque Listo con el Lote % de ese sabor — activa la línea manualmente eligiendo el tanque.', v_lote_siguiente;
  end if;

  select * into v_tanque
  from recepcion_tanques
  where turno_id = p_turno_id
    and condicion = 'LISTO'
    and lote = v_lote_siguiente
    and sabor_id is not distinct from v_actual.sabor_id
  limit 1;

  -- La corrida actual pasa a ESPERANDO_PT (no se finaliza sin su PT).
  -- El tramo que cierra sigue debiendo su Producto Terminado.
  update turno_lineas
  set activa = false
  where id = v_actual.id;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_siguiente_lote(text, uuid, uuid) to anon, authenticated;
