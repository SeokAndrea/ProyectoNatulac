-- ============================================================
-- CONFIRMACIÓN DE ESTADO DE LÍNEAS (INICIO) — mismo patrón que
-- 20260924090000_confirmacion_estado_tanques.sql, para líneas.
-- ============================================================
-- Las líneas también son estado continuo (una corrida activa se
-- hereda de turno a turno, ver 20260907090000_preparacion_continua.sql)
-- pero nunca tuvieron el mismo paso de revisión que los tanques: en
-- Status, LineaCard no mostraba NINGÚN botón — ni para confirmar que
-- la corrida heredada sigue así, ni para corregirla si no coincide con
-- la realidad. Esta migración le agrega a turno_lineas lo mismo que
-- recepcion_tanques ya tiene para el momento INICIO.
--
-- No se agrega el momento FIN acá: a diferencia de los tanques (que
-- SIEMPRE tienen una fila, revisarla al cerrar turno tiene sentido
-- para los 3), una línea sin corrida activa no tiene ninguna fila
-- de turno_lineas "actual" sobre la cual dejar constancia — y las que
-- sí están activas ya se controlan en Finalizar Turno por otro lado
-- (el checklist ya exige Contadores/Producto Terminado por corrida).
--
-- Una línea DETENIDA (sin corrida activa) tampoco tiene nada que
-- confirmar: no hereda ningún dato — "Detenida" es la foto correcta
-- en sí misma. El gate de confirmación solo aplica a una corrida
-- activa heredada, igual que los tanques solo tienen sabor/volumen
-- relevante cuando están LISTO/STANDBY.
-- ============================================================

alter table turno_lineas
  add column confirmado_inicio_en timestamptz,
  add column confirmado_inicio_por uuid references usuarios (id);

-- ------------------------------------------------------------
-- confirmar_estado_linea(): "Confirmar" sin cambios, sobre la corrida
-- ACTIVA puntual (turno_linea_id) — no sobre la línea en general.
-- ------------------------------------------------------------
create or replace function confirmar_estado_linea(
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
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set confirmado_inicio_en = now(),
      confirmado_inicio_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function confirmar_estado_linea(text, uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- activar_linea(): gana p_confirmar_inicio opcional — cuando viene en
-- true (desde el "Editar" del paso de revisión en Status), la corrida
-- recién creada nace ya confirmada, en vez de quedar pendiente de
-- revisión de nuevo apenas se corrige. Mismo criterio que p_momento en
-- cambiar_condicion_tanque: editar durante la revisión también cuenta
-- como revisión.
-- ------------------------------------------------------------
drop function if exists activar_linea(text, uuid, text, integer, integer, numeric, smallint);

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
  v_presentacion_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_lote_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  select id into v_lote_id from preparaciones
  where numero_tanque = p_numero_tanque and liberado_en is not null and cerrado_en is null
  order by liberado_en desc
  limit 1;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_lote_id, true, now(), v_usuario_id,
    case when p_confirmar_inicio then now() else null end,
    case when p_confirmar_inicio then v_usuario_id else null end
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function activar_linea(text, uuid, text, integer, integer, numeric, smallint, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- iniciar_turno(): la corrida heredada nace SIN confirmar en el turno
-- nuevo (arranca en null, como el resto de los campos de revisión) —
-- agregar confirmado_inicio_en/confirmado_inicio_por al insert...select
-- sería copiar la confirmación del turno ANTERIOR, que no vale para
-- este.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- turno_json(): agrega confirmado_inicio_en al bloque de líneas.
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
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre || ' (' || fs.nombre || ')',
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', us.nombre || ' (' || fus.nombre || ')',
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto fs on fs.id = s.familia_id
      left join sabores us on us.id = rt.ultimo_sabor_id
      left join familias_producto fus on fus.id = us.familia_id
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
