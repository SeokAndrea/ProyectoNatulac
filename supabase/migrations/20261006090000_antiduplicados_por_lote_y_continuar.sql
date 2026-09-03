-- ============================================================
-- ANTIDUPLICADOS (2/6): la guarda de re-corrida se cae con lote_id nulo
-- + "Continuar al siguiente lote" no tenía guarda
-- ============================================================
-- Dos fugas encontradas revisando el turno de Javier
-- (plan-rework-auditoria.md §7):
--
--  1. activar_linea(): la guarda de 20261003 comparaba por
--     recepcion_tanques.lote_id. Al corregir un tanque desde Status
--     (cambiar_condicion_tanque) SIEMPRE se pone lote_id = null y se
--     conserva solo el número de lote. Un tanque tocado desde Status
--     quedaba sin guarda: se podía re-activar la misma línea sobre el
--     mismo lote ya corrido -> segunda corrida -> segundo Producto
--     Terminado -> la Auditoría (que agrupa por número de lote) los
--     suma ("Lote 0004 · 810 cajas × 2").
--     Además solo miraba finalizada_en; los cierres por lote agotado
--     usan lote_terminado_en y no la ponían.
--
--     Ahora la guarda compara por normalizar_lote(lote) + sabor_id
--     (igual que la Auditoría y que la guarda de número de lote de
--     iniciar_preparacion) y dispara ante EVIDENCIA DE PRODUCCIÓN:
--     hay Producto Terminado, o lote_terminado_en, o entregada_en.
--     Una corrida "stub" (activada y nunca produjo) no dispara —
--     re-activar tras corregir el tanque sigue permitido.
--
--  2. continuar_siguiente_lote(): inserta la corrida directo, sin
--     pasar por la guarda de activar_linea. Si la línea ya corrió y
--     cerró el lote siguiente este turno y todavía hay un tanque
--     Listo con ese número, "Continuar" armaba un duplicado. Se le
--     pone la misma guarda.
--
-- Sin cambios de firma — las dos son create or replace.
-- ============================================================

-- ------------------------------------------------------------
-- 1. activar_linea(): idéntica a 20261003 salvo el bloque "Guarda
--    antiduplicados".
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

  -- Guarda antiduplicados: esta línea ya tiene una corrida de ESTE
  -- lote + sabor este turno que YA produjo (tiene Producto Terminado,
  -- o el lote se dio por terminado, o hubo entrega parcial). Volver a
  -- activarla duplicaría el Producto Terminado. Se compara por número
  -- de lote normalizado + sabor (no por lote_id): al corregir el
  -- tanque desde Status se pierde el lote_id pero el número queda, y
  -- así es como la Auditoría agrupa las corridas.
  if v_tanque.lote is not null and exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_linea_id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and (
        tl2.lote_terminado_en is not null
        or tl2.entregada_en is not null
        or exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl2.id)
      )
  ) then
    raise exception '% ya corrió el Lote % este turno. Para corregir cantidades, edita el Producto Terminado de esa corrida.',
      coalesce(v_linea_nombre, p_linea_codigo), v_tanque.lote;
  end if;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

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
-- 2. continuar_siguiente_lote(): idéntica a 20260998 + la guarda
--    antiduplicados antes de insertar la nueva corrida.
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

  -- Guarda antiduplicados: esta línea ya tiene una corrida del lote
  -- siguiente este turno que YA produjo. "Continuar" es otra puerta
  -- para insertar corridas — sin esto se saltaba la guarda de
  -- activar_linea. Mismo criterio: número de lote normalizado + sabor
  -- + evidencia de producción (Producto Terminado / lote_terminado_en
  -- / entregada_en).
  if exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_actual.linea_id
      and tl2.id <> v_actual.id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_lote_siguiente)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and (
        tl2.lote_terminado_en is not null
        or tl2.entregada_en is not null
        or exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl2.id)
      )
  ) then
    raise exception 'Esta línea ya corrió el Lote % este turno. Corrige el Producto Terminado de esa corrida en lugar de volver a activarla.', v_lote_siguiente;
  end if;

  update turno_lineas
  set activa = false, finalizada_en = now()
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
