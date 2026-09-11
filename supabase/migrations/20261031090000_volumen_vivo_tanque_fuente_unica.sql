-- ============================================================
-- VOLUMEN DEL TANQUE: una sola fuente de verdad (volumen_vivo_tanque)
-- ============================================================
-- Reporte de planta (Turno 3, Javier Bello): al terminar una corrida
-- quedaban 4300 L en el tanque origen; al transferir (líquido) a un lote
-- de pera que tenía 16260 L, el destino quedó en 24660 L en vez de
-- 20560 L. Los ~4100 L que la línea ya se había llevado del origen se
-- sumaron igual al destino — "duplicó".
--
-- CAUSA. Desde costura 2 (20261018) Producción ya no escribe en
-- `recepcion_tanques`: `registrar_producto_terminado` solo baja
-- `preparaciones.volumen_l`. Entonces `recepcion_tanques.volumen_l` queda
-- CONGELADO en el valor que le puso `liberar_lote` / la última medición.
-- `20261029` corrigió la TARJETA (turno_json leía el volumen vivo del
-- lote) pero dejó esa lógica PEGADA adentro de turno_json, y las
-- funciones que hacen cuentas siguieron leyendo la columna congelada:
--   * transferir_tanque  (20261016)
--   * desvasar_tanque     (20261015)
--   * iniciar_preparacion (20261020, rama "preparar encima")
--   * tanques_de_turnos   (20261005, "dejados" de la pantalla Validar)
--
-- No depende del sabor: pasa en cualquier operación cuyo tanque haya
-- alimentado una corrida de este turno después de su última medición.
--
-- ARREGLO DE FONDO (no parches). UNA función define "cuánto hay en el
-- tanque":
--
--   volumen_vivo_tanque(turno_id, numero_tanque)
--     -> tanque Liberado (LISTO/STANDBY) con lote abierto: preparaciones.volumen_l
--     -> en cualquier otro caso: recepcion_tanques.volumen_l (último conocido)
--
-- Es exactamente el `case` que 20261029 metió adentro de turno_json,
-- extraído a un solo lugar. Todos los lectores pasan a llamarla:
-- turno_json, transferir_tanque, desvasar_tanque, iniciar_preparacion,
-- tanques_de_turnos. Después de esto NADIE recalcula el volumen por su
-- lado, así que no puede volver a desincronizarse.
--
-- La columna recepcion_tanques.volumen_l se queda, pero deja de leerse
-- directo — pasa a ser el "último valor conocido" que usa la función
-- como fallback para un tanque sin lote abierto. Borrarla del todo es
-- limpieza aparte (necesita Docker, push propio).
--
-- Todo `create or replace`, sin cambios de firma ni de datos. Reversible
-- re-aplicando 20261005 / 20261015 / 20261016 / 20261020 / 20261029 y
-- `drop function volumen_vivo_tanque`.
--
-- turno_json: cuerpo idéntico a 20261029 salvo el `volumen_l` del bloque
-- `tanques[]` (verificado con diff). Chequeo sin Docker:
-- scripts/verificar-tanque-volumen-vivo.sql sigue dando lo mismo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. volumen_vivo_tanque() — la única definición.
-- ------------------------------------------------------------
create function volumen_vivo_tanque(p_turno_id uuid, p_numero_tanque smallint)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when rt.condicion in ('LISTO', 'STANDBY')
         and prep.id is not null
         and prep.cerrado_en is null
    then coalesce(prep.volumen_l, rt.volumen_l)
    else rt.volumen_l
  end
  from recepcion_tanques rt
  left join preparaciones prep on prep.id = rt.lote_id
  where rt.turno_id = p_turno_id and rt.numero_tanque = p_numero_tanque;
$fn$;

grant execute on function volumen_vivo_tanque(uuid, smallint) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. turno_json() — usa la función en vez de la lógica pegada.
-- ------------------------------------------------------------
create or replace function turno_json(p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'estado', t.estado,
    'fecha_fin', t.fecha_fin,
    'hora_fin', t.hora_fin,
    'cierre_automatico', t.cierre_automatico,
    'volumenes_lote_cierre', t.volumenes_lote_cierre,
    'tanques_encontrados', t.tanques_encontrados,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tl.id,
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sabor_display(sl.nombre, fsl.nombre),
        'lote', tl.lote,
        'lote_id', tl.lote_id,
        'activa', tl.activa,
        'activada_en', tl.activada_en,
        'pausada_en', tl.pausada_en,
        'lote_terminado_en', tl.lote_terminado_en,
        'entregada_en', tl.entregada_en,
        'finalizada_en', tl.finalizada_en,
        'confirmado_inicio_en', tl.confirmado_inicio_en
      ) order by tl.activada_en)
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      left join familias_producto fsl on fsl.id = sl.familia_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'lineas_estado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l4.codigo,
        'condicion', le.condicion,
        'activada_en', le.activada_en,
        'cip_iniciado_en', le.cip_iniciado_en,
        'cip_finalizado_en', le.cip_finalizado_en,
        'observacion', le.observacion
      ) order by l4.codigo)
      from lineas_estado le
      join lineas l4 on l4.id = le.linea_id
      where le.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, fs.nombre),
        'condicion', rt.condicion,
        -- volumen VIVO del lote: única definición en volumen_vivo_tanque().
        'volumen_l', volumen_vivo_tanque(t.id, rt.numero_tanque),
        'volumen_inicial_l', prep_t.volumen_inicial_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', sabor_display(us.nombre, fus.nombre),
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en,
        'cip_iniciado_en', rt.cip_iniciado_en,
        'cip_finalizado_en', rt.cip_finalizado_en
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto fs on fs.id = s.familia_id
      left join sabores us on us.id = rt.ultimo_sabor_id
      left join familias_producto fus on fus.id = us.familia_id
      left join preparaciones prep_t on prep_t.id = rt.lote_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'turno_linea_id', c.turno_linea_id,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'justificacion', c.justificacion,
        'parcial', c.parcial,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id,
        'linea_codigo', l3.codigo,
        'turno_linea_id', pt.turno_linea_id,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', sabor_display(s2.nombre, fs2.nombre),
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'producto_retenido', pt.producto_retenido,
        'cajas_retenidas', pt.cajas_retenidas,
        'tiene_parciales', pt.tiene_parciales,
        'parciales', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ptp.id,
            'paletas', ptp.paletas,
            'cajas_sueltas', ptp.cajas_sueltas,
            'litros', ptp.litros,
            'usuario_nombre', pu.nombre,
            'creado_en', ptp.created_at
          ) order by ptp.created_at)
          from producto_terminado_parciales ptp
          left join usuarios pu on pu.id = ptp.usuario_id
          where ptp.turno_linea_id = pt.turno_linea_id
        ), '[]'::jsonb),
        'creado_en', pt.updated_at,
        'registrado_por_nombre', ru.nombre,
        'editado_por_nombre', eu.nombre,
        'editado_en', pt.editado_en
      ) order by pt.updated_at desc)
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      left join familias_producto fs2 on fs2.id = s2.familia_id
      left join usuarios ru on ru.id = pt.usuario_id
      left join usuarios eu on eu.id = pt.editado_por
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'turno_id', prep.turno_id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', sabor_display(s3.nombre, fs3.nombre),
        'lote', prep.lote,
        'volumen_l', case
          when t.estado = 'CERRADO' and jsonb_exists(t.volumenes_lote_cierre, prep.id::text)
          then (t.volumenes_lote_cierre ->> prep.id::text)::numeric
          else prep.volumen_l
        end,
        'volumen_inicial_l', prep.volumen_inicial_l,
        'volumen_l_inicio', case
          when prep.turno_id = t.id then prep.volumen_inicial_l
          else coalesce((
            select (tc.volumenes_lote_cierre ->> prep.id::text)::numeric
            from turnos tc
            where tc.area_id = t.area_id
              and tc.id <> t.id
              and tc.estado = 'CERRADO'
              and tc.volumenes_lote_cierre is not null
              and jsonb_exists(tc.volumenes_lote_cierre, prep.id::text)
              and (tc.fecha < t.fecha
                   or (tc.fecha = t.fecha and coalesce(tc.hora_fin, tc.hora_inicio) <= t.hora_inicio))
            order by tc.fecha desc, coalesce(tc.hora_fin, tc.hora_inicio) desc, tc.created_at desc
            limit 1
          ), prep.volumen_inicial_l)
        end,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at,
        'liberado_en', prep.liberado_en,
        'cerrado_en', prep.cerrado_en
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      left join familias_producto fs3 on fs3.id = s3.familia_id
      where prep.turno_id = t.id
         or (
           prep.cerrado_en is null
           and exists (
             select 1 from turnos t_prep
             where t_prep.id = prep.turno_id and t_prep.area_id = t.area_id
           )
         )
         -- Todo lote que alimentó una corrida de ESTE turno, aunque sea
         -- de otro turno y ya esté cerrado — el modelo repartido por
         -- turno necesita medirle el consumo del tramo (antes quedaban
         -- fuera y el turno que los produjo mostraba "—", ver §35, §41).
         or prep.id in (
           select tl.lote_id from turno_lineas tl
           where tl.turno_id = t.id and tl.lote_id is not null
         )
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join usuarios u on u.id = t.supervisor_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

grant execute on function turno_json(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. transferir_tanque() — mueve el volumen VIVO del lote.
--    Cuerpo idéntico a 20261016 salvo v_origen_litros / v_destino_litros.
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

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - v_origen_litros, 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se mudo al lote nuevo del destino).
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

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - v_origen_litros, 0)
    where id = v_origen.lote_id;

    -- El lote origen quedo vacio (todo se absorbio en el lote destino).
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

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - v_destino_litros, 0)
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
-- 4. desvasar_tanque() — los litros a la pipa = volumen VIVO del lote.
--    Cuerpo idéntico a 20261015 salvo v_litros.
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
  set lote_terminado_en = now()
  where lote_id = v_tanque.lote_id and activa;

  update preparaciones set cerrado_en = now() where id = v_tanque.lote_id and cerrado_en is null;

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
-- 5. iniciar_preparacion() — el resto del tanque que se suma al lote
--    nuevo = volumen VIVO. Cuerpo idéntico a 20261020 salvo v_resto.
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

    update preparaciones
    set volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - v_resto, 0),
        cerrado_en = now()
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

-- ------------------------------------------------------------
-- 6. tanques_de_turnos() — "dejados" usa el volumen VIVO. Cuerpo
--    idéntico a 20261005 salvo ese campo.
-- ------------------------------------------------------------
create or replace function tanques_de_turnos(p_usuario text, p_codigos text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  select coalesce(jsonb_object_agg(t.codigo, jsonb_build_object(
    'turnoCodigo', t.codigo,
    'recibidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', (e ->> 'numero_tanque')::int,
        'condicion', e ->> 'condicion',
        'sabor', e ->> 'sabor_nombre',
        'lote', e ->> 'lote',
        'volumenL', (e ->> 'volumen_l')::numeric
      ) order by (e ->> 'numero_tanque')::int)
      from jsonb_array_elements(coalesce(t.tanques_encontrados, '[]'::jsonb)) e
    ), '[]'::jsonb),
    'dejados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numeroTanque', rt.numero_tanque,
        'condicion', rt.condicion,
        'sabor', sabor_display(s.nombre, f.nombre),
        'lote', rt.lote,
        'volumenL', volumen_vivo_tanque(t.id, rt.numero_tanque)
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto f on f.id = s.familia_id
      where rt.turno_id = t.id
    ), '[]'::jsonb)
  )), '{}'::jsonb)
  into v_result
  from turnos t
  where t.codigo = any(p_codigos);

  return v_result;
end;
$$;

grant execute on function tanques_de_turnos(text, text[]) to anon, authenticated;
