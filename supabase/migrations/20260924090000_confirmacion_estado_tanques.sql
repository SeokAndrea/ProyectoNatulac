-- ============================================================
-- CONFIRMACIÓN DE ESTADO DE TANQUES (INICIO / FIN)
-- ============================================================
-- El estado de un tanque (recepcion_tanques) es continuo: una sola fila
-- por turno que iniciar_turno() copia del turno anterior, editable en
-- cualquier momento desde Preparación. El usuario pidió reintroducir un
-- paso de revisión explícita en dos momentos del turno:
--
-- - INICIO: el supervisor ve lo que dejó el turno anterior y tiene que
--   Confirmar (sin tocar nada) o Editar (cambiar y guardar) antes de
--   considerarlo revisado.
-- - FIN: lo mismo, pero al cerrar turno, para dejar constancia del
--   último estado real del tanque.
--
-- Como cada turno ya tiene su propia fila fresca de recepcion_tanques
-- (insertada por iniciar_turno()), estos dos timestamps arrancan en
-- null en cada turno nuevo — esa es la señal de "falta revisar", sin
-- necesitar una tabla de historial separada.
--
-- "Confirmar" y "Editar" van por caminos distintos a propósito:
-- confirmar_estado_tanque() NO toca condicion/sabor/volumen/lote ni
-- activada_en (si lo hiciera, resetearía el "desde cuándo" de un
-- tanque que en realidad no cambió); cambiar_condicion_tanque() sí
-- actualiza esos datos y de paso cuenta como revisión.
-- ============================================================

alter table recepcion_tanques
  add column confirmado_inicio_en timestamptz,
  add column confirmado_inicio_por uuid references usuarios (id),
  add column confirmado_fin_en timestamptz,
  add column confirmado_fin_por uuid references usuarios (id);

-- ------------------------------------------------------------
-- confirmar_estado_tanque(): "Confirmar" sin cambios — solo deja
-- constancia de que alguien revisó el tanque en ese momento del turno.
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
begin
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

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

  return turno_json(p_turno_id);
end;
$$;

grant execute on function confirmar_estado_tanque(text, uuid, smallint, text) to anon, authenticated;

-- ------------------------------------------------------------
-- cambiar_condicion_tanque(): gana p_momento opcional — cuando viene
-- ('INICIO' o 'FIN'), además de lo que ya hacía, marca ese tanque como
-- revisado para ese momento (editar cuenta como revisión).
--
-- drop explícito: agregar un parámetro nuevo (aunque tenga default) no
-- reemplaza la función de 7 argumentos, crea una sobrecarga aparte —
-- mismo patrón ya usado en otras migraciones al cambiar firmas.
-- ------------------------------------------------------------
drop function if exists cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text);

create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null
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
begin
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion = 'SUCIO' and v_actual.condicion = 'LISTO' and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion = 'LISTO' then p_sabor_id else null end,
      volumen_l = case when p_condicion = 'LISTO' then p_volumen_l else null end,
      lote = case when p_condicion = 'LISTO' then nullif(p_lote, '') else null end,
      lote_id = null,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_tanque(text, uuid, smallint, text, uuid, numeric, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- turno_json(): agrega confirmado_inicio_en/confirmado_fin_en al
-- bloque de tanques, para que el frontend sepa si falta revisión.
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
        'sabor_nombre', sl.nombre,
        'lote', tl.lote,
        'lote_id', tl.lote_id,
        'activa', tl.activa,
        'activada_en', tl.activada_en,
        'pausada_en', tl.pausada_en,
        'entregada_en', tl.entregada_en,
        'finalizada_en', tl.finalizada_en
      ) order by tl.activada_en)
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre,
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', us.nombre,
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join sabores us on us.id = rt.ultimo_sabor_id
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
        'sabor_nombre', s2.nombre,
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
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', s3.nombre,
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
