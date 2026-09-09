-- ============================================================
-- cambiar_condicion_linea(): también bloquea si hay corrida ESPERANDO_PT
-- ============================================================
-- Hoy solo rechaza el cambio de estado de una línea si tiene una
-- corrida ACTIVA. Con costura 2 (20261018) apareció un tercer estado:
-- la corrida detenida SIN su Producto Terminado (activa = false,
-- finalizada_en NULL). Marcar la línea "Sin programación" / "CIP" /
-- "Cambio de Presentación" mientras hay una corrida en ese estado la
-- deja huérfana — nunca se le carga el PT y su lote no cierra bien.
--
-- activar_linea (20261018) ya trae esta misma guarda ("Hay una corrida
-- detenida sobre el Lote X sin su Producto Terminado"). Se la agrega
-- acá para cerrar la otra puerta.
--
-- Idéntica a 20260969 salvo el bloque nuevo. `create or replace`, sin
-- cambio de firma.
-- ============================================================

create or replace function cambiar_condicion_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_condicion text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_actual lineas_estado%rowtype;
  v_tiene_corrida_activa boolean;
  v_lote_esperando_pt text;
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
  v_observacion text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;

  select exists(
    select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_linea_id and activa
  ) into v_tiene_corrida_activa;

  if v_tiene_corrida_activa then
    raise exception 'La línea tiene una corrida activa — detén o termina el sabor antes de cambiar su estado.';
  end if;

  -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
  select tl.lote into v_lote_esperando_pt
  from turno_lineas tl
  where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id
    and tl.activa = false and tl.finalizada_en is null
  order by tl.activada_en desc
  limit 1;

  if v_lote_esperando_pt is not null then
    raise exception 'Hay una corrida detenida sobre esta línea (Lote %) sin su Producto Terminado. Cárgalo antes de cambiar el estado de la línea.',
      v_lote_esperando_pt;
  end if;

  select * into v_actual from lineas_estado where turno_id = p_turno_id and linea_id = v_linea_id;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LISTA' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_observacion := case when p_condicion = 'DETENIDA' then nullif(btrim(p_observacion), '') else null end;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, p_condicion, now(), v_cip_iniciado_en, v_cip_finalizado_en, v_observacion, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = excluded.condicion,
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = excluded.cip_finalizado_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function cambiar_condicion_linea(text, uuid, text, text, text) to anon, authenticated;
