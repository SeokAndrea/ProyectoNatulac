-- ============================================================
-- FIX URGENTE: turno_json() y registrar_contador() rotos desde el push de hoy
-- ============================================================
-- Bug propio, no algo que ya estuviera roto: al escribir 20261040
-- (y antes, 20261038) usé como "versión vigente" de turno_json() y
-- registrar_contador() una base ANTERIOR a 20261037090000_dropear_
-- parciales_y_producto_retenido.sql, sin darme cuenta de que esa
-- migración las había vuelto a redefinir para sacar las columnas que
-- dropeó (contadores.parcial; producto_terminado.tiene_parciales/
-- producto_retenido/cajas_retenidas/editado_por/editado_en). Al pushear
-- hoy, mis migraciones "revirtieron" turno_json()/registrar_contador()
-- a la versión vieja, que sigue referenciando columnas que ya no
-- existen — turno_json() se usa en casi todas las páginas
-- (estado_planta_actual, turno_detalle, el valor de retorno de
-- prácticamente toda mutación), así que rompió la app entera, no solo
-- el Panel.
--
-- Arreglo: turno_json() y registrar_contador() vuelven a partir de la
-- base REAL vigente (20261037), con SOLO los agregados de hoy
-- (confirmar inicio/fin, guard de corrida heredada) encima — nada de
-- lo que 20261037 sacó vuelve a aparecer.
--
-- registrar_contador() cambió de firma en 20261037 (se sacó
-- p_parcial): mis migraciones de hoy usaron la firma VIEJA (con
-- p_parcial), así que quedó como una función SEPARADA (sobrecarga) en
-- vez de reemplazar la de 20261037 — hay que dropearla explícita.
-- ============================================================

drop function if exists registrar_contador(uuid, uuid, text, integer, text, text, boolean, text, integer);

-- ------------------------------------------------------------
-- 1. registrar_contador(): idéntica a 20261037 (firma de 8 parámetros,
--    sin p_parcial) + el guard de corrida heredada de 20261040.
-- ------------------------------------------------------------
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
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

  -- Guard (20261040): una corrida HEREDADA sin confirmar no puede
  -- recibir un contador.
  if exists (select 1 from turno_lineas where id = p_turno_linea_id and confirmado_inicio_en is null) then
    raise exception 'Confirmá el estado de esta línea antes de cargar el contador (Status → Confirmar).';
  end if;

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(p_justificacion, ''), v_usuario_id);

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s', p_linea_codigo, p_envases_llenadora,
           case when p_envases_buenos is not null then format(' (%s buenos)', p_envases_buenos) else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. turno_json(): idéntica a 20261037 (sin 'parcial' en contadores,
--    sin producto_retenido/cajas_retenidas/tiene_parciales/parciales/
--    editado_por/editado_en en producto_terminado) + el único agregado
--    real de 20261040: volumen_l_inicio prioriza la confirmación
--    propia de este turno (volumenes_lote_inicio) antes de ir a
--    buscar la foto del turno anterior.
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
        'creado_en', pt.updated_at,
        'registrado_por_nombre', ru.nombre
      ) order by pt.updated_at desc)
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      left join familias_producto fs2 on fs2.id = s2.familia_id
      left join usuarios ru on ru.id = pt.usuario_id
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
