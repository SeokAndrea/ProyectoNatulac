-- ============================================================
-- actualizada_por EN preparaciones Y turno_lineas
-- ============================================================
-- Caso real (Auditoría, turno de Javier 2026-09-15, tanque 3 / lote
-- 0002): el trigger genérico auditar_cambio() (20260985) saca el
-- "quién" de la primera columna de autor que encuentra en la fila.
-- Para preparaciones esa columna es usuario_id, y para turno_lineas es
-- activada_por — las dos se llenan SOLO al crear la fila. Ninguna
-- función que edita esas tablas después (medir_tanque,
-- registrar_producto_terminado, transferir_tanque, pausar/reanudar
-- corrida, etc.) las refresca. Resultado: toda edición posterior a la
-- creación queda atribuida a quien creó el lote/corrida, nunca a quien
-- la hizo de verdad — así fue como una medición de Deivis y una baja
-- de volumen de producción normal de Javier aparecieron en Auditoría
-- como si las hubiera hecho Danny (que solo había creado el lote).
--
-- Arreglo: mismo patrón que ya usa recepcion_tanques.actualizada_por
-- (esa sí se refresca en cada función que la toca). auditar_cambio()
-- YA prioriza actualizada_por como primera opción en su coalesce() —
-- no hace falta tocar el trigger, alcanza con agregar la columna a
-- las dos tablas y empezar a llenarla en cada función que las edita
-- después de creadas.
--
-- Todo `create or replace` — mismas firmas, mismo comportamiento
-- salvo el stamp nuevo. Cuerpos idénticos a la versión vigente de
-- cada función (citada arriba de cada una) salvo `actualizada_por`.
-- No se toca ninguna función system-only sin actor real
-- (revisar_cierre_de_lote, cerrar_corrida_si_esperando,
-- cerrar_turno_forzado): dejar actualizada_por como estaba ahí es lo
-- correcto — nadie "editó" esas filas, las cerró el sistema.
-- ============================================================

alter table preparaciones add column actualizada_por uuid references usuarios (id);
update preparaciones set actualizada_por = usuario_id where actualizada_por is null;

alter table turno_lineas add column actualizada_por uuid references usuarios (id);
update turno_lineas set actualizada_por = activada_por where actualizada_por is null;

-- ------------------------------------------------------------
-- 1. iniciar_preparacion(): idéntica a 20261034 + stamp en el INSERT
--    nuevo y en el UPDATE que cierra el lote anterior / su corrida.
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
    -- vale v_resto — es el "fin" correcto de su tramo de consumo.
    update preparaciones
    set cerrado_en = now(),
        actualizada_por = v_usuario_id
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now(),
        actualizada_por = v_usuario_id
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

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id, actualizada_por)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id, v_usuario_id)
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

-- ------------------------------------------------------------
-- 2. medir_tanque(): idéntica a 20261026 + stamp. (El fix de la
--    corrección retroactiva del cierre forzado va en la migración
--    siguiente, que vuelve a reemplazar esta misma función.)
-- ------------------------------------------------------------
create or replace function medir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen_viejo numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).';
  end if;
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen medido no es válido.';
  end if;

  select volumen_l into v_volumen_viejo
  from preparaciones where id = v_tanque.lote_id and cerrado_en is null;

  -- Relectura física: solo `volumen_l`. NO se toca `volumen_inicial_l`.
  update preparaciones set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set volumen_l = p_volumen_real, activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_volumen_viejo is not null and p_volumen_real is distinct from v_volumen_viejo then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      v_tanque.lote_id,
      p_turno_id,
      v_volumen_viejo,
      p_volumen_real,
      coalesce(p_volumen_real, 0) - coalesce(v_volumen_viejo, 0),
      v_usuario_id
    );
  end if;

  -- Si lo medido dejó el lote en ~0 y ninguna corrida activa lo usa,
  -- se cierra el lote y el tanque pasa a SUCIO (mismo cierre que usa
  -- Producción). Idempotente y con guardas propias.
  perform revisar_cierre_de_lote(v_tanque.lote_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function medir_tanque(text, uuid, smallint, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. registrar_producto_terminado(): idéntica a 20261037 + stamp en
--    la baja de volumen_l del lote.
-- ------------------------------------------------------------
create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
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
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
  v_pt_creado timestamptz;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.';
  end if;

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  -- Solo baja el volumen del lote. El cierre del lote/tanque lo hace
  -- revisar_cierre_de_lote. Producción no escribe en recepcion_tanques.
  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_litros_delta <> 0 then
    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta),
        actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;
  end if;

  -- Cierra la corrida si quedó en ESPERANDO_PT.
  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  -- Y aunque la corrida ya se hubiera cerrado antes (p. ej. el contador la
  -- cerró en la misma pantalla), revisar acá si ESTE PT dejó el lote en
  -- ~0 — cerrar_corrida_si_esperando ya no correría revisar_cierre_de_lote.
  if v_lote_id is not null then
    perform revisar_cierre_de_lote(v_lote_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. transferir_tanque(): idéntica a 20261034 + stamp en las 3 ramas
--    (LIMPIO / LIQUIDO / LOTE) — origen que cierra y destino que
--    absorbe, y el turno_lineas que cambia de lote_id.
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
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen_litros, v_origen_litros, 0, v_usuario_id, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen_litros, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id, actualizada_por = v_usuario_id where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se mudó al lote nuevo del destino).
    -- Su volumen_inicial_l NO se toca: sigue siendo lo que se preparó, y
    -- volumen_l (= v_origen_litros) es el "fin" correcto del tramo.
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_origen_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_origen_litros,
        actualizada_por = v_usuario_id
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se absorbió en el lote destino).
    -- volumen_inicial_l intacto; volumen_l (= v_origen_litros) es el "fin".
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_destino_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_destino_litros,
        numero_tanque = p_numero_tanque_destino,
        actualizada_por = v_usuario_id
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
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_destino.lote_id and activa;

    -- Se cierra el lote VIEJO del destino: el que sobrevive es el del
    -- origen, que se muda al tanque destino y queda abierto.
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_destino.lote_id and cerrado_en is null;

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
-- 5. desvasar_tanque(): idéntica a 20261031 + stamp.
-- ------------------------------------------------------------
create or replace function desvasar_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_litros numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para desvasar.';
  end if;

  -- Volumen VIVO del lote (no el congelado de recepcion_tanques).
  v_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque.volumen_l, 0);
  if v_litros <= 0 then
    raise exception 'No queda nada en este tanque para desvasar.';
  end if;

  insert into desvases (area_id, sabor_id, litros, lote_origen, turno_id_origen, usuario_id)
  values (v_area_id, v_tanque.sabor_id, v_litros, v_tanque.lote, p_turno_id, v_usuario_id);

  update turno_lineas
  set lote_terminado_en = now(), actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Desvasado (guardado)' || coalesce(' · Lote ' || v_tanque.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function desvasar_tanque(text, uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. liberar_lote(): idéntica a 20260914 + stamp.
-- ------------------------------------------------------------
create or replace function liberar_lote(p_usuario text, p_turno_id uuid, p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  update preparaciones set liberado_en = now(), actualizada_por = v_usuario_id where id = p_lote_id and liberado_en is null;

  update recepcion_tanques
  set condicion = 'LISTO',
      sabor_id = v_lote.sabor_id,
      volumen_l = v_lote.volumen_l,
      lote = v_lote.lote,
      lote_id = p_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function liberar_lote(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. ajustar_preparacion(): idéntica a 20260997 + stamp.
-- ------------------------------------------------------------
create or replace function ajustar_preparacion(
  p_usuario text,
  p_lote_id uuid,
  p_litros numeric,
  p_detalle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  if p_litros is null or p_litros <= 0 then
    raise exception 'El ajuste tiene que ser un número de litros mayor a 0.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.liberado_en is not null then
    raise exception 'El lote ya está liberado — no se le pueden sumar ajustes.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;

  update preparaciones
  set volumen_l = coalesce(volumen_l, 0) + p_litros,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros,
      actualizada_por = v_usuario_id
  where id = p_lote_id;

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, v_lote.turno_id, p_litros, nullif(trim(coalesce(p_detalle, '')), ''), v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Ajuste de volumen · Tanque %s%s · +%s L%s',
           v_lote.numero_tanque,
           coalesce(' · Lote ' || v_lote.lote, ''),
           p_litros,
           coalesce(' (' || nullif(trim(coalesce(p_detalle, '')), '') || ')', '')),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', coalesce(v_lote.volumen_l, 0) + p_litros, 'volumen_inicial_l', coalesce(v_lote.volumen_inicial_l, 0) + p_litros)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

grant execute on function ajustar_preparacion(text, uuid, numeric, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. reactivar_lote(): idéntica a 20260965 + stamp.
-- ------------------------------------------------------------
create or replace function reactivar_lote(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion <> 'STANDBY' or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote cerrado para reactivar.';
  end if;

  update preparaciones set cerrado_en = null, actualizada_por = v_usuario_id where id = v_tanque.lote_id;

  update turno_lineas
  set lote_terminado_en = null, actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'LISTO', activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function reactivar_lote(text, uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. descartar_resto_tanque(): idéntica a 20260996 + stamp.
-- ------------------------------------------------------------
create or replace function descartar_resto_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_motivo text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para descartar.';
  end if;

  v_motivo := nullif(btrim(p_motivo), '');

  update preparaciones
  set observacion = v_motivo, cerrado_en = now(), actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update turno_lineas
  set lote_terminado_en = now(), actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Descartado' || coalesce(' · Lote ' || v_tanque.lote, '') || coalesce(' · ' || v_motivo, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function descartar_resto_tanque(text, uuid, smallint, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 10. fijar_volumen_lote(): idéntica a 20261033 + stamp.
-- ------------------------------------------------------------
create or replace function fijar_volumen_lote(
  p_usuario text,
  p_lote_id uuid,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
  v_inicial_viejo numeric;
begin
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen tiene que ser un número mayor o igual a 0.';
  end if;
  if p_volumen_real > 30000 then
    raise exception 'El volumen no puede pasar de 30.000 L (capacidad del tanque).';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;
  if exists (select 1 from turno_lineas where lote_id = p_lote_id) then
    raise exception 'Este lote ya tuvo una corrida — el 100%% no se puede fijar a mano. Usá "Medir tanque" para la relectura física.';
  end if;

  v_inicial_viejo := coalesce(v_lote.volumen_inicial_l, 0);

  update preparaciones
  set volumen_l = p_volumen_real,
      volumen_inicial_l = p_volumen_real,
      actualizada_por = v_usuario_id
  where id = p_lote_id;

  -- Espejo del tanque, si está Liberado con este lote.
  update recepcion_tanques
  set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where turno_id = v_lote.turno_id and lote_id = p_lote_id and condicion in ('LISTO', 'STANDBY');

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, v_lote.turno_id, p_volumen_real - v_inicial_viejo,
          'Fijar volumen real del lote (100%)', v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Fijar volumen del lote · Tanque %s%s · %s L (era %s L)',
           v_lote.numero_tanque, coalesce(' · Lote ' || v_lote.lote, ''),
           p_volumen_real, round(v_inicial_viejo)),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', p_volumen_real, 'volumen_inicial_l', p_volumen_real)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

grant execute on function fijar_volumen_lote(text, uuid, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 11. capturar_resto_origen_transferencia(): idéntica a 20261024 +
--     stamp en el lote origen (reabierto) y el destino (ajustado).
-- ------------------------------------------------------------
create or replace function capturar_resto_origen_transferencia(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_litros_resto numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_transf transferencias%rowtype;
  v_origen_lote preparaciones%rowtype;
  v_destino_tanque recepcion_tanques%rowtype;
  v_destino_lote_id uuid;
  v_destino_vol_antes numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_litros_resto is null or p_litros_resto < 0 then
    raise exception 'Los litros que quedaron en el tanque no son un número válido.';
  end if;

  -- La transferencia recién hecha desde ese tanque.
  select * into v_transf
  from transferencias
  where turno_id = p_turno_id and tanque_origen = p_numero_tanque_origen
  order by creado_en desc
  limit 1;

  if v_transf.id is null then
    raise exception 'No hay una transferencia reciente desde el Tanque %.', p_numero_tanque_origen;
  end if;
  if v_transf.creado_en < now() - interval '2 hours' then
    raise exception 'La última transferencia desde el Tanque % ya no es reciente — el resto se corrige desde Medir tanque.', p_numero_tanque_origen;
  end if;
  if v_transf.modo = 'LOTE' then
    raise exception 'Esa transferencia movió el lote entero al tanque destino — no aplica capturar un resto en el origen.';
  end if;
  if p_litros_resto >= v_transf.litros then
    raise exception 'El resto (% L) no puede ser mayor o igual a lo que se transfirió (% L).', p_litros_resto, v_transf.litros;
  end if;

  -- Lote que transferir_tanque cerró en el tanque origen (mismo instante).
  select * into v_origen_lote
  from preparaciones
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen and cerrado_en is not null
  order by cerrado_en desc
  limit 1;

  if v_origen_lote.id is null
     or abs(extract(epoch from (v_origen_lote.cerrado_en - v_transf.creado_en))) > 5 then
    raise exception 'No se encontró el lote que cerró esa transferencia en el Tanque %.', p_numero_tanque_origen;
  end if;

  -- Idempotencia: si ya se reabrió, no repetir.
  if v_origen_lote.cerrado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- Nada que capturar.
  if p_litros_resto = 0 then
    return turno_json(p_turno_id);
  end if;

  -- Lote que absorbió la transferencia en el destino.
  select * into v_destino_tanque
  from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;
  v_destino_lote_id := v_destino_tanque.lote_id;

  if v_destino_lote_id is null then
    raise exception 'El Tanque destino % ya no tiene un lote — no se puede ajustar.', v_transf.tanque_destino;
  end if;

  -- ---- Origen: reabrir con el resto, devolver el crédito ----
  update preparaciones
  set cerrado_en = null,
      volumen_l = p_litros_resto,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros_resto,
      actualizada_por = v_usuario_id
  where id = v_origen_lote.id;

  update recepcion_tanques
  set condicion = 'STANDBY',
      sabor_id = v_origen_lote.sabor_id,
      volumen_l = p_litros_resto,
      lote = v_origen_lote.lote,
      lote_id = v_origen_lote.id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (v_origen_lote.id, p_turno_id, 0, p_litros_resto, p_litros_resto, v_usuario_id);

  -- ---- Destino: llegó de menos ----
  select volumen_l into v_destino_vol_antes from preparaciones where id = v_destino_lote_id;

  update preparaciones
  set volumen_l = greatest(coalesce(volumen_l, 0) - p_litros_resto, 0),
      volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - p_litros_resto, 0),
      actualizada_por = v_usuario_id
  where id = v_destino_lote_id;

  update recepcion_tanques
  set volumen_l = (select volumen_l from preparaciones where id = v_destino_lote_id),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (
    v_destino_lote_id,
    p_turno_id,
    coalesce(v_destino_vol_antes, 0),
    greatest(coalesce(v_destino_vol_antes, 0) - p_litros_resto, 0),
    -p_litros_resto,
    v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function capturar_resto_origen_transferencia(text, uuid, smallint, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- 12. activar_linea(): idéntica a 20261025 + stamp en la corrida
--     heredada que se cierra al reemplazarla, y en la fila nueva.
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

  -- Guarda antiduplicados: esta linea ya tiene una corrida de ESTE
  -- lote + sabor este turno que YA produjo. Volver a activarla
  -- duplica el Producto Terminado.
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
    case when p_confirmar_inicio then now() else null end,
    case when p_confirmar_inicio then v_usuario_id else null end
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 13. pausar_linea(): idéntica a 20261017, gana v_usuario_id (no lo
--     resolvía) + stamp.
-- ------------------------------------------------------------
create or replace function pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set pausada_en = now(),
      pausa_motivo = nullif(btrim(p_motivo), ''),
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function pausar_linea(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 14. continuar_linea(): idéntica a 20261017, gana v_usuario_id + stamp.
-- ------------------------------------------------------------
create or replace function continuar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_linea(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 15. terminar_linea(): idéntica a 20261018, gana v_usuario_id + stamp.
-- ------------------------------------------------------------
create or replace function terminar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- activa=false, finalizada_en sigue NULL => ESPERANDO_PT.
  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_linea(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 16. terminar_sabor_linea(): alias muerto de terminar_linea (ver
--     20261018) — idéntica, gana v_usuario_id + stamp por si algo
--     viejo todavía la llama.
-- ------------------------------------------------------------
create or replace function terminar_sabor_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function terminar_sabor_linea(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 17. detener_linea_por_falla(): idéntica a 20261018 + stamp (ya
--     resolvía v_usuario_id, para lineas_estado).
-- ------------------------------------------------------------
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
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
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
-- 18. seguir_mismo_lote(): idéntica a 20261022, gana v_usuario_id + stamp.
-- ------------------------------------------------------------
create or replace function seguir_mismo_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote_id uuid;
  v_activa boolean;
  v_lote_terminado_en timestamptz;
  v_cerrado_en timestamptz;
  v_volumen numeric;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select tl.lote_id, tl.activa, tl.lote_terminado_en
  into v_lote_id, v_activa, v_lote_terminado_en
  from turno_lineas tl
  where tl.id = p_turno_linea_id and tl.turno_id = p_turno_id;

  if not found then
    raise exception 'Esa corrida no existe en este turno.';
  end if;

  if v_activa is not true then
    raise exception 'Esa corrida ya no está activa — no se puede seguir con el mismo lote. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  -- Ya está corriendo normal (sin marca de "terminó"): nada que deshacer.
  if v_lote_terminado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- El lote tiene que seguir abierto y con volumen: si ya se cerró (un
  -- PT viejo lo vació y limpió el tanque) no hay nada que "seguir".
  select cerrado_en, volumen_l
  into v_cerrado_en, v_volumen
  from preparaciones
  where id = v_lote_id;

  if v_cerrado_en is not null then
    raise exception 'El Lote de esa corrida ya está cerrado — no se puede seguir. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  if coalesce(v_volumen, 0) <= 0 then
    raise exception 'El Lote de esa corrida no tiene volumen registrado. Revísalo en Preparación (Medir tanque) antes de seguir.';
  end if;

  -- Único efecto: deshace la marca de "terminó el lote".
  update turno_lineas
  set lote_terminado_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id
    and activa and lote_terminado_en is not null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function seguir_mismo_lote(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 19. continuar_siguiente_lote(): idéntica a 20261025 + stamp en la
--     corrida vieja que pasa a ESPERANDO_PT y en la fila nueva.
-- ------------------------------------------------------------
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
  -- lote + sabor este turno que YA produjo.
  if exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_actual.linea_id
      and tl2.id <> v_actual.id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and (
        tl2.lote_terminado_en is not null
        or tl2.entregada_en is not null
        or exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl2.id)
      )
  ) then
    raise exception 'Esta línea ya corrió el Lote % este turno. Corrige el Producto Terminado de esa corrida en lugar de volver a activarla.', v_tanque.lote;
  end if;

  -- La corrida actual pasa a ESPERANDO_PT (no se finaliza sin su PT).
  update turno_lineas
  set activa = false, actualizada_por = v_usuario_id
  where id = v_actual.id;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_siguiente_lote(text, uuid, uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- 20. iniciar_turno(): idéntica a 20261035 + el INSERT que hereda las
--     corridas del turno anterior también arrastra actualizada_por
--     (misma idea que ya hace con recepcion_tanques.actualizada_por).
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
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
      pausada_en, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por, actualizada_por,
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
