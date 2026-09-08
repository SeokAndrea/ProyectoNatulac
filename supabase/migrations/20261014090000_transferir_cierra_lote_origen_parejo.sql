-- ============================================================
-- TRANSFERIR: cerrar el lote correcto en cada uno de los 3 modos
-- ============================================================
-- Fase 2 del rework (plan-rework-3-modulos-y-merma.md, seccion 2.1):
-- "transferir_tanque -- Mantener, con un bug corregido: Modo LIMPIO
--  deja la fila del origen abierta para siempre (cerrado_en nunca se
--  setea) -- se corrige parejo en las 3 ramas".
--
-- Origen del bug: hasta 20260990 el cierre del lote origen era una
-- linea INCONDICIONAL al final de la funcion. Al agregar el modo LOTE
-- (20260995) ese cierre paso a estar guardado con
-- `if v_destino.condicion <> 'LIMPIO'`, y quedo mal en dos ramas:
--
--   * Rama LIMPIO: el guard lo excluye -> el lote del tanque ORIGEN,
--     que se evacuo por completo hacia un lote nuevo del destino,
--     nunca recibe cerrado_en. Queda abierto para siempre y se lee
--     como un lote vivo mas (infla la merma, ensucia el panel).
--
--   * Rama LOTE: el guard lo deja pasar (destino no es LIMPIO) y cierra
--     v_origen.lote_id -- pero en modo LOTE ese es justamente el lote
--     que SOBREVIVE y se muda al tanque destino. El tanque destino y
--     turno_lineas quedan apuntando a un preparaciones ya cerrado.
--
-- Arreglo: se saca el cierre condicional del final y cada rama cierra
-- explicitamente el lote que corresponde:
--   LIMPIO   -> cierra el lote origen (evacuado al lote nuevo).
--   LIQUIDO  -> cierra el lote origen (absorbido por el lote destino).
--   LOTE     -> cierra el lote VIEJO del destino (ya lo hacia); el lote
--               origen sobrevive y queda abierto.
--
-- Sin cambios de datos ni de firma. El resto del cuerpo es identico a
-- 20260995090000_transferir_modo_liquido_o_lote.sql. Reversible
-- re-aplicando esa migracion.
-- ============================================================

create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint,
  p_modo text default 'LIQUIDO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
  v_ultimo_lote_texto text;
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;
  if p_modo not in ('LIQUIDO', 'LOTE') then
    raise exception 'Modo de transferencia inválido: % (debe ser LIQUIDO o LOTE)', p_modo;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no está Liberado con un lote activo.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o Liberado (Listo o Con Restos).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

  if v_destino.condicion = 'LIMPIO' then
    -- Nada que absorber en el destino: los dos modos dan lo mismo — el
    -- origen se muda tal cual, con su propia identidad.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen.volumen_l, v_origen.volumen_l, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen.volumen_l, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se mudo al lote nuevo del destino).
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_origen.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_origen.volumen_l, 0)
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_origen.volumen_l, 0), 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se absorbio en el lote destino).
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + coalesce(v_destino.volumen_l, 0),
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + coalesce(v_destino.volumen_l, 0),
        numero_tanque = p_numero_tanque_destino
    where id = v_origen.lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = (select volumen_l from preparaciones where id = v_origen.lote_id),
        lote = v_origen.lote,
        lote_id = v_origen.lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id
    where lote_id = v_destino.lote_id and activa;

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - coalesce(v_destino.volumen_l, 0), 0)
    where id = v_destino.lote_id;

    -- Se cierra el lote VIEJO del destino: el que sobrevive es el del
    -- origen, que se muda al tanque destino y queda abierto.
    update preparaciones set cerrado_en = now() where id = v_destino.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Lote ' || coalesce(v_origen.lote, '') || ' trasladado al Tanque ' || p_numero_tanque_destino;
  end if;

  -- El tanque origen siempre queda sin lote propio al final — o se
  -- cerró (LIQUIDO/LIMPIO) o se mudó físicamente al destino (LOTE).
  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = v_ultimo_lote_texto,
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint, text) to anon, authenticated;
