-- ============================================================
-- LÍNEAS: una corrida con PT en 0 no bloquea volver a correr el lote
-- ============================================================
-- Caso: se activó Línea 2 en 250 ml con el Lote 3 (era 200 ml). Para
-- anularla se cargó su Producto Terminado en 0. Después la guarda
-- antiduplicados ("ya corrió el Lote 3 este turno") no dejaba activar
-- Línea 2 en 200 ml con el Lote 3.
--
-- Ahora una corrida cuyo PT está cargado en 0 (sin paletas, cajas ni
-- retenidas) cuenta como anulada: no produjo nada, así que volver a
-- correr ese lote no duplica PT. Sin PT cargado sigue contando si ya se
-- terminó o se entregó, como antes.
-- ============================================================

create or replace function corrida_produjo(p_turno_linea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl.id) then
      exists (
        select 1 from producto_terminado pt
        where pt.turno_linea_id = tl.id
          and (pt.paletas > 0 or pt.cajas_sueltas > 0 or coalesce(pt.cajas_retenidas, 0) > 0)
      )
    else tl.lote_terminado_en is not null or tl.entregada_en is not null
  end
  from turno_lineas tl
  where tl.id = p_turno_linea_id;
$$;

revoke execute on function corrida_produjo(uuid) from public, anon, authenticated;

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
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  -- Guard: si el lote es HEREDADO (nació en otro turno) y todavía no
  -- se confirmó su inicio en ESTE turno, no se puede tomar. Un lote
  -- que nació en ESTE MISMO turno no necesita esto.
  if v_tanque.lote_id is not null
     and v_tanque.confirmado_inicio_en is null
     and exists (select 1 from preparaciones p where p.id = v_tanque.lote_id and p.turno_id <> p_turno_id)
  then
    raise exception 'Confirma el estado del Tanque % antes de activarlo (Preparación → Status → Confirmar).', p_numero_tanque;
  end if;

  -- Guarda antiduplicados: esta linea ya tiene una corrida de ESTE
  -- lote + sabor este turno que YA produjo. Volver a activarla
  -- duplica el Producto Terminado. Una corrida con PT en 0 no cuenta.
  if v_tanque.lote is not null and exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_linea_id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and corrida_produjo(tl2.id)
  ) then
    raise exception '% ya corrió el Lote % este turno. Para corregir cantidades, edita el Producto Terminado de esa corrida.',
      coalesce(v_linea_nombre, p_linea_codigo), v_tanque.lote;
  end if;

  -- Guarda: desde la página de Líneas (p_confirmar_inicio = false) no se
  -- puede activar sobre una corrida en curso — hay que Detener línea y
  -- cargar su PT primero. Desde Recepción (p_confirmar_inicio = true) sí
  -- se reemplaza.
  if not coalesce(p_confirmar_inicio, false) and exists (
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

  -- Recepción reemplaza la corrida heredada; desde Líneas nunca se llega
  -- acá con una corrida activa (la guarda de arriba ya cortó).
  update turno_lineas
  set activa = false, finalizada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id,
    now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

create or replace function continuar_siguiente_lote(
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
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if p_numero_tanque is not null then
    -- ---- Camino manual: el supervisor eligió el tanque ----
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

  -- Guarda antiduplicados: esta linea ya tiene OTRA corrida de este
  -- lote + sabor este turno que YA produjo (PT en 0 no cuenta).
  if exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_actual.linea_id
      and tl2.id <> v_actual.id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and corrida_produjo(tl2.id)
  ) then
    raise exception 'Esta línea ya corrió el Lote % este turno. Corrige el Producto Terminado de esa corrida en lugar de volver a activarla.', v_tanque.lote;
  end if;

  if v_tanque.lote_id is not distinct from v_actual.lote_id then
    raise exception 'El tanque % es el mismo Lote % que ya corre la línea. Elige el tanque del lote siguiente.', v_tanque.numero_tanque, v_tanque.lote;
  end if;

  -- La corrida actual pasa a ESPERANDO_PT (no se finaliza sin su PT).
  update turno_lineas
  set activa = false, actualizada_por = v_usuario_id
  where id = v_actual.id;

  -- El tanque del lote viejo, si ninguna otra corrida sigue con él, pasa
  -- de Listo a Con Restos con el lote abierto: ninguna línea lo toma y
  -- Preparación decide qué hacer con el resto (ver encabezado). Las
  -- filas de turnos abiertos, igual que revisar_cierre_de_lote.
  if v_actual.lote_id is not null
     and not exists (select 1 from turno_lineas where lote_id = v_actual.lote_id and activa)
     and exists (select 1 from preparaciones where id = v_actual.lote_id and cerrado_en is null) then
    update recepcion_tanques rt
    set condicion = 'STANDBY',
        activada_en = now(),
        actualizada_por = v_usuario_id
    where rt.lote_id = v_actual.lote_id
      and rt.condicion = 'LISTO'
      and rt.turno_id in (select t.id from turnos t where t.estado = 'ABIERTO');
  end if;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id,
    now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_siguiente_lote(text, uuid, uuid, smallint) to anon, authenticated;
