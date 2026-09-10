-- ============================================================
-- PREPARAR ENCIMA / TRANSFERIR: no encoger volumen_inicial_l del lote que cierra
-- ============================================================
-- Reporte de planta (turno de Deivis, 2026-09-10, lote 0003): una línea
-- terminó un lote dejando 380 L de resto; se preparó el lote siguiente
-- ENCIMA (iniciar_preparacion en el mismo tanque). El Panel pasó a
-- mostrar "Rendimiento 101 %" (merma de semielaborado negativa).
--
-- CAUSA. Cuando el resto R de un lote se muda a otro (preparar encima,
-- o transferir), iniciar_preparacion y transferir_tanque:
--   1. bajaban volumen_inicial_l del lote que cierra:  -= R
--   2. dejaban volumen_l (el "fin" del tramo) en R
-- El modelo de merma repartido por turno hace
--   consumo_lote = inicio - fin
-- Para un lote NACIDO en el turno, inicio = volumen_inicial_l. Con las
-- dos cosas juntas, consumo = (Vi - R) - R = Vi - 2R: se resta R dos
-- veces. Si ese lote ya había entregado ~ (Vi - R) de Producto
-- Terminado, la merma sale negativa (rendimiento > 100 %).
--
-- ARREGLO. El resto que se muda NO es merma: cambia de lote, no
-- desaparece. Basta con dejar de encoger volumen_inicial_l del lote que
-- cierra. volumen_l queda en R (ya lo estaba) y es el "fin" correcto:
--   consumo_lote = inicio - R
-- Sale bien para un lote nacido en el turno (inicio = volumen_inicial_l)
-- Y para un lote heredado (inicio = volumen congelado al cierre del
-- turno anterior, que esta funcion no puede ni debe tocar). Además
-- volumen_inicial_l vuelve a ser inmutable = "lo que se preparó" — que
-- es lo que 20260989 buscaba, y deja honesto el chequeo físico
-- ptExcedeVi de mermaSemielaboradoTurno.
--
-- El lote que SOBREVIVE (destino que absorbe, o lote nuevo que se
-- prepara encima) sí suma R a su volumen_inicial_l: esos litros quedan
-- disponibles para consumirse ahí. Eso no cambia.
--
-- desvasar_tanque ya era correcta (nunca tocó volumen_inicial_l del lote
-- que cierra) — no se toca.
--
-- Todo `create or replace`. Cuerpos idénticos a 20261031 salvo:
--   * iniciar_preparacion: se quita la línea `volumen_inicial_l = greatest(... - v_resto, 0)`
--     del UPDATE que cierra el lote anterior (rama "preparar encima").
--   * transferir_tanque: se quita el UPDATE `volumen_inicial_l = greatest(... - <movido>, 0)`
--     del lote que cierra en las 3 ramas (LIMPIO, LIQUIDO, LOTE).
-- Reversible re-aplicando 20261031.
-- ============================================================

-- ------------------------------------------------------------
-- 1. transferir_tanque() — el lote que cierra conserva su volumen_inicial_l.
-- ------------------------------------------------------------
create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint,
  p_modo text default 'LIQUIDO',
  p_motivo text default 'CONSOLIDAR_RESTOS'
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
  v_litros_movidos numeric;
  v_destino_era_limpio boolean;
  v_origen_litros numeric;
  v_destino_litros numeric;
begin
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;
  if p_modo not in ('LIQUIDO', 'LOTE') then
    raise exception 'Modo de transferencia inválido: % (debe ser LIQUIDO o LOTE)', p_modo;
  end if;
  if p_motivo not in ('CONSOLIDAR_RESTOS', 'ENRUTAR_MANIFOLD') then
    raise exception 'Motivo de transferencia inválido: % (debe ser CONSOLIDAR_RESTOS o ENRUTAR_MANIFOLD)', p_motivo;
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

  -- Litros REALES en cada tanque = volumen VIVO del lote (una sola
  -- definición). NO recepcion_tanques.volumen_l, que quedó congelado
  -- desde costura 2.
  v_origen_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_origen), v_origen.volumen_l, 0);
  v_destino_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_destino), v_destino.volumen_l, 0);

  v_litros_movidos := v_origen_litros;
  v_destino_era_limpio := v_destino.condicion = 'LIMPIO';

  if v_destino.condicion = 'LIMPIO' then
    -- Nada que absorber en el destino: los dos modos dan lo mismo — el
    -- origen se muda tal cual, con su propia identidad.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen_litros, v_origen_litros, 0, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen_litros, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se mudó al lote nuevo del destino).
    -- Su volumen_inicial_l NO se toca: sigue siendo lo que se preparó, y
    -- volumen_l (= v_origen_litros) es el "fin" correcto del tramo.
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_origen_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_origen_litros
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id
    where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se absorbió en el lote destino).
    -- volumen_inicial_l intacto; volumen_l (= v_origen_litros) es el "fin".
    update preparaciones set cerrado_en = now() where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_destino_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_destino_litros,
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

    -- Se cierra el lote VIEJO del destino: el que sobrevive es el del
    -- origen, que se muda al tanque destino y queda abierto. El lote
    -- viejo conserva su volumen_inicial_l; volumen_l (= v_destino_litros)
    -- es el "fin" correcto de su tramo.
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

  insert into transferencias (turno_id, tanque_origen, tanque_destino, litros, modo, motivo, usuario_id)
  values (
    p_turno_id,
    p_numero_tanque_origen,
    p_numero_tanque_destino,
    v_litros_movidos,
    case when v_destino_era_limpio then null else p_modo end,
    p_motivo::motivo_transferencia,
    v_usuario_id
  );

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function transferir_tanque(text, uuid, smallint, smallint, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. iniciar_preparacion() — el lote anterior que cierra conserva su
--    volumen_inicial_l; el resto se suma solo al lote nuevo.
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
  p_desvase_id uuid default null
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
  v_desvase desvases%rowtype;
  v_nuevo_lote_id uuid;
  v_area_id uuid;
  v_lote_norm text;
  v_resto numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_lote_norm := normalizar_lote(p_lote);

  -- Serializa por (área, sabor, nº de lote): dos preparaciones
  -- concurrentes del mismo lote esperan una a la otra y la segunda ve la
  -- fila de la primera en el `exists` de abajo. El lock se libera solo al
  -- terminar la transacción.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || coalesce(p_sabor_id::text, '') || '|' || v_lote_norm, 0)
  );

  -- Guarda: número de lote repetido para el mismo sabor, abierto en
  -- otro tanque de la misma área.
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
    -- Resto que ya había en el tanque = volumen VIVO del lote (no el
    -- congelado de recepcion_tanques).
    v_resto := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque_actual.volumen_l, 0);
    v_volumen_l := v_volumen_l + v_resto;

    -- El lote anterior se cierra. Su volumen_inicial_l NO se toca: el
    -- resto se MUDA al lote nuevo (no es merma), y volumen_l — que ya
    -- vale v_resto — es el "fin" correcto de su tramo de consumo. Bajar
    -- volumen_inicial_l acá restaba el resto dos veces y sacaba
    -- rendimiento > 100 % (turno de Deivis, lote 0003).
    update preparaciones
    set cerrado_en = now()
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_desvase_id is not null then
    select * into v_desvase from desvases where id = p_desvase_id and consumido_en is null;
    if v_desvase.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_desvase.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_desvase.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = v_lote_norm, lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;
