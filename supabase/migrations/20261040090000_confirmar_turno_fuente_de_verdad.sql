-- ============================================================
-- CONFIRMAR INICIO/FIN PASA A SER LA FUENTE REAL DE LA MERMA
-- ============================================================
-- Hasta ahora, "Confirmar" (Status al iniciar, Finalizar Turno al
-- cerrar — confirmar_estado_tanque/cambiar_condicion_tanque) era
-- decorativo: solo dejaba una marca de tiempo. El número que
-- realmente alimenta la merma salía de otro lado: una foto automática
-- (volumenes_lote_cierre) que se dispara con el cierre del turno pase
-- lo que pase, y para el "inicio", ir a buscar esa misma foto del
-- turno ANTERIOR. Esos dos mecanismos automáticos son los que
-- produjeron los bugs de hoy (auditoría mal atribuida por ediciones
-- sin actor claro, y un cierre forzado que congeló una medición a
-- medio corregir).
--
-- Esta migración invierte la prioridad: cada turno confirma sus DOS
-- puntas (inicio y fin) por su cuenta, y esa confirmación — no la foto
-- automática — es la fuente del cálculo. La foto automática se queda,
-- pero pasa a ser una red de seguridad que solo completa lo que nadie
-- confirmó a mano, nunca pisa una confirmación ya hecha. Y confirmar
-- deja de ser opcional: finalizar_turno rechaza si falta confirmar el
-- fin de un tanque que este turno usó; activar_linea rechaza si falta
-- confirmar el inicio del tanque que se quiere tomar.
--
-- Todo `create or replace`. Cuerpos idénticos a la versión vigente de
-- cada función (citada en cada bloque) salvo el agregado descrito ahí.
-- ============================================================

alter table turnos add column volumenes_lote_inicio jsonb;

-- ------------------------------------------------------------
-- 1. confirmar_estado_tanque(): idéntica a 20260947 + si el tanque
--    tiene un lote abierto, esta confirmación estampa el volumen vivo
--    de ESE lote como el valor de inicio/fin de ESTE turno.
-- ------------------------------------------------------------
create or replace function confirmar_estado_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_momento text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen numeric;
begin
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if p_momento = 'INICIO' then
    update recepcion_tanques
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    update recepcion_tanques
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  end if;

  -- Fuente real del inicio/fin de este turno para ese lote — ya no
  -- una foto automática ni lo que congeló otro turno.
  if v_tanque.condicion in ('LISTO', 'STANDBY') and v_tanque.lote_id is not null then
    v_volumen := volumen_vivo_tanque(p_turno_id, p_numero_tanque);
    if v_volumen is not null then
      if p_momento = 'INICIO' then
        update turnos
        set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      else
        update turnos
        set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      end if;
    end if;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function confirmar_estado_tanque(text, uuid, smallint, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. cambiar_condicion_tanque(): idéntica a 20260989, + el mismo
--    estampado cuando p_momento viene (acá el valor confirmado es
--    directamente p_volumen_l, lo que el supervisor acaba de
--    declarar — no hace falta releer volumen_vivo_tanque) + de paso
--    cierra un hueco de auditoría que quedó afuera de la pasada de
--    hoy (20261038): sus UPDATE a preparaciones/turno_lineas no
--    dejaban actualizada_por.
-- ------------------------------------------------------------
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null,
  p_tambores integer default null
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
  v_lote_id uuid;
  v_mismo_lote boolean;
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
  v_area_id uuid;
  v_prep_con_datos boolean;
  v_volumen_prep numeric;
  v_volumen_l_viejo numeric;
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion in ('SUCIO', 'CIP', 'LIMPIO') and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LIMPIO' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_prep_con_datos := p_condicion = 'EN_PREPARACION'
    and p_sabor_id is not null
    and coalesce(trim(p_lote), '') <> '';

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  if v_mismo_lote then
    v_lote_id := v_actual.lote_id;

  elsif p_condicion in ('LISTO', 'STANDBY') then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), p_volumen_l, p_volumen_l, 0, v_usuario_id, v_usuario_id, now())
    returning id into v_lote_id;

  elsif v_prep_con_datos then
    -- Cierra cualquier preparación abierta de este tanque en el área
    -- (incluye lotes "colgados" arrastrados de turnos viejos).
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id in (select id from turnos where area_id = v_area_id);

    select coalesce(p_tambores, 0) * volumen into v_volumen_prep from sabores where id = p_sabor_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_prep, v_volumen_prep, coalesce(p_tambores, 0), v_usuario_id, v_usuario_id)
    returning id into v_lote_id;

  else
    -- EN_PREPARACION sin datos, o SUCIO/CIP/LIMPIO: cierra los lotes
    -- abiertos de este tanque que vienen de OTROS turnos.
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id <> p_turno_id
      and pr.turno_id in (select id from turnos where area_id = v_area_id);
    v_lote_id := null;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case
               when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote)
               when v_prep_con_datos then normalizar_lote(p_lote)
               else null
             end,
      lote_id = v_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      cip_iniciado_en = v_cip_iniciado_en,
      cip_finalizado_en = v_cip_finalizado_en,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  -- Fuente real del inicio/fin de este turno para ese lote (ver
  -- confirmar_estado_tanque más arriba, mismo criterio). Acá el valor
  -- ya es p_volumen_l — lo que el supervisor acaba de declarar.
  if p_momento is not null and p_condicion in ('LISTO', 'STANDBY') and v_lote_id is not null then
    if p_momento = 'INICIO' then
      update turnos
      set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    else
      update turnos
      set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    end if;
  end if;

  if v_mismo_lote and v_lote_id is not null then
    -- RELECTURA FÍSICA DEL TANQUE — NO mueve volumen_inicial_l.
    select volumen_l into v_volumen_l_viejo
    from preparaciones where id = v_lote_id and cerrado_en is null;

    update preparaciones
    set volumen_l = p_volumen_l, actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;

    if v_volumen_l_viejo is not null and p_volumen_l is distinct from v_volumen_l_viejo then
      insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
      values (
        v_lote_id,
        p_turno_id,
        v_volumen_l_viejo,
        p_volumen_l,
        coalesce(p_volumen_l, 0) - coalesce(v_volumen_l_viejo, 0),
        v_usuario_id
      );
    end if;

  elsif v_actual.lote_id is not null then
    update turno_lineas
    set lote_terminado_en = now(), actualizada_por = v_usuario_id
    where lote_id = v_actual.lote_id and activa;

    update preparaciones
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where id = v_actual.lote_id and cerrado_en is null;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. turno_json(): idéntica a 20261031, salvo el bloque
--    volumen_l_inicio de "preparaciones" — ahora prioriza la
--    confirmación propia de ESTE turno (volumenes_lote_inicio) antes
--    de ir a buscar la foto del turno anterior.
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
          when t.volumenes_lote_inicio is not null and jsonb_exists(t.volumenes_lote_inicio, prep.id::text)
            then (t.volumenes_lote_inicio ->> prep.id::text)::numeric
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
-- 4. turnos_congelar_volumenes_lote_cierre(): idéntica a 20261009,
--    pasa de "solo si la columna está en null" a "completar solo lo
--    que falte" — nunca pisa una confirmación explícita ya escrita.
-- ------------------------------------------------------------
create or replace function turnos_congelar_volumenes_lote_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_faltantes jsonb;
begin
  if new.estado = 'CERRADO' and old.estado = 'ABIERTO' then
    select jsonb_object_agg(prep.id::text, to_jsonb(prep.volumen_l))
    into v_faltantes
    from preparaciones prep
    where prep.id in (
      select distinct tl.lote_id
      from turno_lineas tl
      where tl.turno_id = new.id and tl.lote_id is not null
    )
    and not (coalesce(new.volumenes_lote_cierre, '{}'::jsonb) ? prep.id::text);

    if v_faltantes is not null then
      new.volumenes_lote_cierre := coalesce(new.volumenes_lote_cierre, '{}'::jsonb) || v_faltantes;
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. finalizar_turno(): idéntica a 20261032 + guard nuevo (mismo
--    estilo que el de corridas sin resolver, ya vigente): no se puede
--    cerrar con un tanque que este turno usó y cuyo fin no se
--    confirmó.
-- ------------------------------------------------------------
create or replace function finalizar_turno(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
begin
  -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
  end if;

  -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
  -- del tramo de este turno y elegir Terminar o Entregar línea.
  select string_agg(l.nombre, ', ' order by l.codigo)
  into v_lineas_activas
  from turno_lineas tl
  join lineas l on l.id = tl.linea_id
  where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

  if v_lineas_activas is not null then
    raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
      v_lineas_activas;
  end if;

  -- Tanque con producción de este turno sin confirmar su estado
  -- final: sin esto, el cierre queda a merced de la foto automática
  -- (el bug de hoy).
  if exists (
    select 1
    from recepcion_tanques rt
    where rt.turno_id = p_turno_id
      and rt.confirmado_fin_en is null
      and rt.lote_id is not null
      and exists (select 1 from turno_lineas tl where tl.turno_id = p_turno_id and tl.lote_id = rt.lote_id)
  ) then
    raise exception 'Hay tanques con producción de este turno sin confirmar su estado final. Confirmalos desde Preparación antes de finalizar.';
  end if;

  -- Línea que se ENTREGA activa al turno siguiente sin confirmar su
  -- fin: es el único caso de línea con riesgo real de arrastre (mismo
  -- criterio que tanques) — una corrida que ya terminó (finalizada_en,
  -- por PT o por reemplazo) no hereda nada, no lo necesita. Red de
  -- seguridad: en el flujo normal ya queda confirmada sola al Entregar
  -- línea (ver entregar_corrida más arriba).
  if exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id
      and activa and entregada_en is not null
      and confirmado_fin_en is null
  ) then
    raise exception 'Hay líneas entregadas de este turno sin confirmar su estado final.';
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

grant execute on function finalizar_turno(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. activar_linea(): idéntica a 20261038 + guard nuevo: no se puede
--    tomar un tanque con lote abierto sin haber confirmado su inicio
--    en ESTE turno.
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

  -- Guard nuevo: si el lote es HEREDADO (nació en otro turno) y todavía
  -- no se confirmó su inicio en ESTE turno, no se puede tomar — si no,
  -- la merma queda dependiendo de lo que congeló otro turno (el bug de
  -- hoy). Un lote que nació en ESTE MISMO turno no necesita esto: su
  -- "inicio" es lo que el supervisor acaba de declarar al prepararlo,
  -- sin ambigüedad que confirmar (mismo criterio que turno_json usa
  -- para volumen_l_inicio: prep.turno_id = t.id).
  if v_tanque.lote_id is not null
     and v_tanque.confirmado_inicio_en is null
     and exists (select 1 from preparaciones p where p.id = v_tanque.lote_id and p.turno_id <> p_turno_id)
  then
    raise exception 'Confirmá el estado del Tanque % antes de activarlo (Preparación → Status → Confirmar).', p_numero_tanque;
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

  -- confirmado_inicio_en queda SIEMPRE estampado acá (antes: solo si
  -- p_confirmar_inicio) — activar una corrida, sea desde Líneas o desde
  -- Recepción, siempre es declarar estos valores de cero; nunca deja
  -- una fila "heredada sin revisar" (eso SOLO pasa vía el copy-forward
  -- de iniciar_turno, que no pasa por acá). p_confirmar_inicio se
  -- queda por compatibilidad de firma, ya no cambia nada acá.
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

grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. turno_lineas gana confirmado_fin_en/por (mismo patrón que
--    recepcion_tanques, que ya lo tenía) — no existía hasta hoy.
-- ------------------------------------------------------------
alter table turno_lineas
  add column confirmado_fin_en timestamptz,
  add column confirmado_fin_por uuid references usuarios (id);

-- ------------------------------------------------------------
-- 8. registrar_contador(): idéntica a 20261036 + guard de inicio
--    confirmado (ver más abajo). cerrar_corrida_si_esperando NO se
--    toca — cierra corridas que YA no van a ningún lado (reemplazadas
--    o resueltas con PT), no hay valor que se herede al turno
--    siguiente ahí, así que no necesita confirmado_fin_en. El único
--    caso con riesgo real de arrastre es la corrida que se ENTREGA
--    activa (ver entregar_corrida más abajo) — mismo criterio que
--    tanques: solo lo que sigue vivo para el próximo turno necesita
--    confirmación de cierre.
-- ------------------------------------------------------------
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_parcial boolean default false,
  p_pagina text default null,
  p_envases_buenos integer default null
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
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Guard nuevo: una corrida HEREDADA (nunca activada en este turno,
  -- copiada por el relevo de iniciar_turno) tiene que confirmarse antes
  -- de cargarle un contador — si no, se está registrando producción
  -- sobre una config que nadie de este turno revisó todavía.
  if exists (select 1 from turno_lineas where id = p_turno_linea_id and confirmado_inicio_en is null) then
    raise exception 'Confirmá el estado de esta línea antes de cargar el contador (Status → Confirmar).';
  end if;

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id, parcial)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(p_justificacion, ''), v_usuario_id, coalesce(p_parcial, false));

  if not coalesce(p_parcial, false) then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s%s', p_linea_codigo, p_envases_llenadora,
           case when p_envases_buenos is not null then format(' (%s buenos)', p_envases_buenos) else '' end,
           case when coalesce(p_parcial, false) then ' (parcial)' else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos, 'parcial', coalesce(p_parcial, false),
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text, boolean, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. registrar_producto_terminado(): idéntica a 20261038 + guard de
--    inicio confirmado (mismo criterio que registrar_contador, arriba).
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

  -- Guard nuevo: mismo criterio que registrar_contador — una corrida
  -- heredada sin confirmar no puede recibir Producto Terminado.
  if exists (select 1 from turno_lineas where id = p_turno_linea_id and confirmado_inicio_en is null) then
    raise exception 'Confirmá el estado de esta línea antes de cargar el Producto Terminado (Status → Confirmar).';
  end if;

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
-- 10. entregar_corrida(): idéntica a 20260918 + confirma el fin — esta
--     SÍ es la que le entrega una corrida VIVA al siguiente turno
--     (única con riesgo real de arrastre, igual que un tanque
--     LISTO/STANDBY), así que confirmar acá es lo que de verdad
--     importa.
-- ------------------------------------------------------------
create or replace function entregar_corrida(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
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
  set entregada_en = now(), entregada_por = v_usuario_id,
      confirmado_fin_en = now(), confirmado_fin_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function entregar_corrida(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 11. confirmar_estado_linea(): idéntica a 20260933 + p_momento
--     opcional (default INICIO, no rompe al único llamador actual)
--     para permitir confirmar/corregir el fin a mano si hiciera falta
--     — en el flujo normal ya queda confirmado solo (Contador/PT,
--     Entregar línea, arriba).
-- ------------------------------------------------------------
create or replace function confirmar_estado_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_momento text default 'INICIO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_momento = 'INICIO' then
    update turno_lineas
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id and activa;
  else
    update turno_lineas
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id;
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function confirmar_estado_linea(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 12. continuar_siguiente_lote(): idéntica a 20261025 + estampa
--     confirmado_inicio_en/por en la fila nueva — mismo hueco que
--     activar_linea tenía: pasar al siguiente lote dentro del MISMO
--     turno es declarar valores de cero, no heredar nada sin revisar,
--     y sin este agregado el guard nuevo de registrar_contador /
--     registrar_producto_terminado la bloquearía por error.
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
