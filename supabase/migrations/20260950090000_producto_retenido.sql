-- ============================================================
-- PRODUCTO TERMINADO: "¿HAY PRODUCTO RETENIDO?" — dato extra, sin uso todavía
-- ============================================================
-- Se agrega para dejar constancia de si hay producto retenido y
-- cuántas cajas, junto con Paletas/Cajas sueltas. Por ahora es solo
-- dato — no afecta litros, merma, ni el acta en PDF.
-- ============================================================

alter table producto_terminado add column producto_retenido boolean not null default false;
alter table producto_terminado add column cajas_retenidas integer check (cajas_retenidas is null or cajas_retenidas >= 0);

-- El parámetro nuevo (aunque tenga default) no reemplaza la función de
-- 8 argumentos, crea una sobrecarga aparte — hay que borrar la vieja
-- explícitamente (mismo criterio ya usado en otras migraciones al
-- cambiar firmas).
drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text);

create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_producto_retenido boolean default false,
  p_cajas_retenidas integer default null
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
  v_numero_tanque smallint;
  v_nuevo_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
  v_tanque_condicion text;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos into v_litros_previos from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_litros_previos := coalesce(v_litros_previos, 0);

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id,
    producto_retenido, cajas_retenidas
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id,
    p_producto_retenido, p_cajas_retenidas
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        producto_retenido = excluded.producto_retenido,
        cajas_retenidas = excluded.cajas_retenidas,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null then
    if v_litros_delta <> 0 then
      update preparaciones
      set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
      where id = v_lote_id and cerrado_en is null;
    end if;

    select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_nuevo_volumen, v_lote_sabor_id, v_lote_lote
    from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      select condicion into v_tanque_condicion
      from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

      if v_tanque_condicion = 'LISTO' and coalesce(v_nuevo_volumen, 0) <= 0 then
        update recepcion_tanques
        set condicion = 'SUCIO',
            sabor_id = null,
            volumen_l = null,
            lote = null,
            lote_id = null,
            activada_en = now(),
            ultimo_sabor_id = v_lote_sabor_id,
            ultimo_lote = 'Restos del lote ' || coalesce(v_lote_lote, '?')
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

        update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

        update turno_lineas
        set lote_terminado_en = now()
        where lote_id = v_lote_id and activa;
      else
        update recepcion_tanques
        set volumen_l = v_nuevo_volumen
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      end if;
    end if;
  end if;

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- turno_json(): expone producto_retenido/cajas_retenidas.
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
        'sabor_nombre', sl.nombre || ' (' || fsl.nombre || ')',
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
        'cip_finalizado_en', le.cip_finalizado_en
      ) order by l4.codigo)
      from lineas_estado le
      join lineas l4 on l4.id = le.linea_id
      where le.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre || ' (' || fs.nombre || ')',
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'volumen_inicial_l', prep_t.volumen_inicial_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', us.nombre || ' (' || fus.nombre || ')',
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
        'justificacion', c.justificacion,
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
        'sabor_nombre', s2.nombre || ' (' || fs2.nombre || ')',
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'producto_retenido', pt.producto_retenido,
        'cajas_retenidas', pt.cajas_retenidas,
        'creado_en', pt.updated_at
      ) order by pt.updated_at desc)
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      left join familias_producto fs2 on fs2.id = s2.familia_id
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', s3.nombre || ' (' || fs3.nombre || ')',
        'lote', prep.lote,
        'volumen_l', prep.volumen_l,
        'volumen_inicial_l', prep.volumen_inicial_l,
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
      where prep.turno_id = t.id or prep.cerrado_en is null
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
