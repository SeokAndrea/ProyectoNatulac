-- ============================================================
-- EVITAR DUPLICADOS: número de lote repetido + re-correr un lote
-- ============================================================
-- Del turno de Javier (plan-rework-auditoria.md §7): apareció el mismo
-- envasado cargado dos veces (Línea 1 · Lote 0004 · 810 cajas × 2) y
-- números de lote repetidos entre tanques. Dos guardas:
--
--  A. iniciar_preparacion(): no se puede preparar un número de lote
--     que YA está abierto para ese sabor en OTRO tanque de la misma
--     área. (Re-preparar el MISMO tanque con el mismo número sigue
--     bien: ese lote se cierra en la misma llamada.)
--
--  B. activar_linea(): no se puede volver a activar una línea sobre un
--     lote que esa misma línea YA corrió y cerró este turno — es lo
--     que generaba el PT duplicado. Distintas líneas tomando del mismo
--     lote (ej. 250 ml y 1 L) siguen permitidas.
-- ============================================================

-- ------------------------------------------------------------
-- A. iniciar_preparacion(): idéntica a 20260999 + la guarda de lote.
-- ------------------------------------------------------------
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_reserva_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
  v_reserva reservas_tobos%rowtype;
  v_nuevo_lote_id uuid;
  v_area_id uuid;
  v_lote_norm text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  -- Guarda: número de lote repetido para el mismo sabor, abierto en
  -- otro tanque de la misma área.
  v_lote_norm := normalizar_lote(p_lote);
  if exists (
    select 1
    from preparaciones prep
    join turnos t on t.id = prep.turno_id
    where prep.cerrado_en is null
      and prep.id is distinct from v_tanque_actual.lote_id
      and prep.sabor_id = p_sabor_id
      and normalizar_lote(prep.lote) = v_lote_norm
      and t.area_id = v_area_id
  ) then
    raise exception 'Ya hay un lote % de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.', v_lote_norm;
  end if;

  if v_tanque_actual.condicion in ('LISTO', 'STANDBY') and v_tanque_actual.lote_id is not null then
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_tanque_actual.volumen_l, 0), 0),
        cerrado_en = now()
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_reserva_id is not null then
    select * into v_reserva from reservas_tobos where id = p_reserva_id and consumido_en is null;
    if v_reserva.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_reserva.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_reserva.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_reserva_id is not null then
    update reservas_tobos
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_reserva_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = v_lote_norm, lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- B. activar_linea(): idéntica a 20260940 + la guarda de re-corrida.
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

  -- Guarda: esta línea ya corrió y cerró este lote este turno. Volver
  -- a activarla sobre el mismo lote duplicaría el Producto Terminado.
  if v_tanque.lote_id is not null and exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id
      and linea_id = v_linea_id
      and lote_id = v_tanque.lote_id
      and finalizada_en is not null
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
