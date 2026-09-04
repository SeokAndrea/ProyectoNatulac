-- ============================================================
-- CONTADOR 2 (ENVASES BUENOS): corrobora un PT que "excede lo preparado"
-- en la merma de semielaborado — NO toca merma de envase
-- ============================================================
-- Decisión de la jefa (chat 2026-09-04, tras revisar el turno de
-- Javier Bello): NO se revive envases_buenos/envases_desechados para
-- que "merma de envase" los reste del Contador (eso ya se probó una
-- vez — ver 20260819120000_core_schema.sql + 20260823100000, se sacó
-- en 20260909090000_lotes_y_corridas.sql porque buenos+desechados no
-- sumaba llenadora de forma confiable). Merma de envase SIGUE siendo
-- sólo envases_llenadora vs Producto Terminado, sin cambios.
--
-- El uso real: mermaSemielaboradoTurno() (src/lib/panelProduccion.ts)
-- excluye un lote entero de la merma cuando su PT supera
-- volumen_inicial_l × MARGEN_REDONDEO ("ptExcedeVi") — pensado para
-- cazar PT duplicado o jugo agregado sin pasar por Ajustar. Pero desde
-- que se puede rellenar un tanque a mitad de corrida (transferir_tanque
-- hasta 30.000 L, ver 20261008090000), un relleno LEGÍTIMO se ve
-- idéntico a un duplicado: el PT real supera lo que ese lote tenía
-- preparado originalmente, y su producción entera se descarta del %
-- ("litrosSinContraste").
--
-- Envases buenos (Contador 2, opcional, mismo formulario que el
-- Contador de hoy) es una lectura INDEPENDIENTE del volumen del tanque
-- — viene de la llenadora, no de una medición de tanque. Si esa
-- lectura (convertida a litros por la presentación) coincide con el PT
-- registrado dentro de una tolerancia, es evidencia de que el PT es
-- real y no un duplicado — así que ese lote se cuenta en la merma en
-- vez de descartarse. Sin Contador 2 cargado, el comportamiento es
-- IDÉNTICO al de hoy (se sigue descartando).
--
-- La otra guarda (tramo <= 0, tanque que terminó con más volumen del
-- que arrancó) NO se toca: no hay lectura de Contador que la pueda
-- corroborar — ese caso necesita rastrear la transferencia en sí
-- (de dónde vino el volumen), no queda resuelto acá.
-- ============================================================

alter table contadores add column envases_buenos integer;
alter table contadores add constraint contadores_envases_buenos_check check (envases_buenos is null or envases_buenos >= 0);

-- ------------------------------------------------------------
-- registrar_contador(): idéntica a 20260984090000, + p_envases_buenos
-- al FINAL de la firma (default null, no rompe llamadas viejas) y en
-- el insert.
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
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

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
-- turno_json(): idéntica a 20260992090000, + 'envases_buenos' en el
-- bloque de contadores.
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
        'volumen_l', rt.volumen_l,
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
