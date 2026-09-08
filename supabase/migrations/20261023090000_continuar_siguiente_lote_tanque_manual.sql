-- ============================================================
-- CONTINUAR AL SIGUIENTE LOTE: fallback manual eligiendo el tanque
-- ============================================================
-- plan-rework-3-modulos-y-merma.md — costura 2.
--
-- continuar_siguiente_lote() auto-detecta el tanque del lote+1 (mismo
-- sabor, un solo tanque LISTO). Cuando eso falla — el lote+1 todavía no
-- se liberó, se liberó con otro número, quedó en un tanque no-LISTO, o
-- hay más de uno — cortaba con "Activa la línea manualmente". Pero
-- costura 2 (20261018) cerró esa puerta: activar_linea desde Líneas
-- ahora rechaza "ya tiene una corrida en curso". Quedaba un deadlock.
--
-- Fix (dueño, 2026-09-08): p_numero_tanque opcional. Si viene, se salta
-- el auto-detect y usa ESE tanque (solo exige LISTO + lote asignado +
-- que no lo esté tomando ya otra corrida). Misma transición de dos
-- pasos que el camino automático: la corrida vieja pasa a ESPERANDO_PT
-- (activa=false, finalizada_en NULL) y sigue debiendo su Producto
-- Terminado; nace la corrida nueva con la config de línea heredada. No
-- toca activar_linea ni su guarda. Aditivo (nuevo parámetro con
-- default) — cambia la firma, así que drop + create.
-- ============================================================

drop function if exists continuar_siguiente_lote(text, uuid, uuid);

create function continuar_siguiente_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_numero_tanque smallint default null
)
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

  if p_numero_tanque is not null then
    -- ---- Camino manual: el supervisor eligió el tanque ----
    -- (el auto-detect del lote+1 no encontró uno, o encontró varios).
    -- No se exige que el número de lote sea consecutivo ni que el sabor
    -- coincida: puede ser un cambio de sabor legítimo en la misma línea.
    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

    if v_tanque.numero_tanque is null then
      raise exception 'No existe el tanque % en este turno.', p_numero_tanque;
    end if;
    if v_tanque.condicion is distinct from 'LISTO' then
      raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
    end if;
    if v_tanque.lote_id is null then
      raise exception 'El tanque % no tiene un lote asignado.', p_numero_tanque;
    end if;

    -- Ese lote no puede tener otra corrida activa (dos líneas sobre un
    -- tanque por esta vía) ni una detenida sin su PT (costura 2).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa and id <> v_actual.id
    ) then
      raise exception 'El Lote % del tanque % ya lo está tomando otra corrida.', v_tanque.lote, p_numero_tanque;
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sobre el Lote % sin su Producto Terminado. Cárgalo antes de continuar.', v_tanque.lote;
    end if;
  else
    -- ---- Camino automático: lote consecutivo, mismo sabor, un solo tanque ----
    if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
      raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente. Elige el tanque manualmente.', v_actual.lote;
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
      raise exception 'No hay ningún tanque Listo con el Lote % del mismo sabor. Elige el tanque manualmente.', v_lote_siguiente;
    end if;
    if v_candidatos > 1 then
      raise exception 'Hay más de un tanque Listo con el Lote % de ese sabor — elige el tanque manualmente.', v_lote_siguiente;
    end if;

    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id
      and condicion = 'LISTO'
      and lote = v_lote_siguiente
      and sabor_id is not distinct from v_actual.sabor_id
    limit 1;
  end if;

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

grant execute on function continuar_siguiente_lote(text, uuid, uuid, smallint) to anon, authenticated;
