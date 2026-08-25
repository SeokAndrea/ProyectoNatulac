-- ============================================================
-- LÍNEA: Parada (reversible) vs. Terminó Sabor (cierre real)
-- ============================================================
-- "Detener" una línea hoy es una sola acción indiferenciada
-- (finalizar_linea, archiva la corrida sin vuelta atrás). El
-- supervisor necesita distinguir:
--   - PARADA: la línea se detuvo un rato (falta de cajas, corte,
--     lo que sea) pero es EL MISMO lote/corrida — se puede
--     continuar más tarde sin perder nada. No archiva la corrida:
--     activa sigue en true, solo se marca pausada_en.
--   - TERMINÓ SABOR: el lote se terminó de verdad. Libera la línea
--     para una corrida nueva (activa=false), pero la corrida queda
--     "esperando cierre" (finalizada_en sigue null) hasta que se
--     registre su contador — recién ahí se sabe cuánto se consumió
--     de verdad (ver 20260914090000_litros_consumidos_lote.sql, que
--     hace ese cierre) y se puede dar la corrida por completamente
--     cerrada.
-- Mantener activa=true durante una Parada preserva el índice único
-- "una corrida activa por línea" tal cual está — una línea pausada
-- sigue "reservada" por su corrida, no se puede activar una nueva
-- encima sin antes Continuar o Terminar Sabor explícitamente (el
-- frontend debe evitar ese choque; el índice ya lo impediría a nivel
-- de datos si se intentara).
-- ============================================================

alter table turno_lineas add column pausada_en timestamptz;

-- ------------------------------------------------------------
-- turno_json(): agrega pausada_en a cada línea.
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
        'ultimo_lote', rt.ultimo_lote
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
  where t.id = p_turno_id;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- pausar_linea() / continuar_linea(): solo tocan pausada_en, la
-- corrida sigue activa=true en los dos casos.
-- ------------------------------------------------------------
create or replace function pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set pausada_en = now()
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null;

  return turno_json(p_turno_id);
end;
$$;

create or replace function continuar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- terminar_sabor_linea(): libera la línea (activa=false) pero NO
-- cierra la corrida (finalizada_en sigue null) — queda "esperando
-- cierre" hasta que se registre su contador (ver
-- 20260914090000_litros_consumidos_lote.sql).
-- ------------------------------------------------------------
create or replace function terminar_sabor_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set activa = false, pausada_en = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- finalizar_linea() queda reemplazada por terminar_sabor_linea() en
-- el flujo principal (el frontend deja de llamarla).
drop function if exists finalizar_linea(text, uuid, text);

grant execute on function turno_json(uuid) to anon, authenticated;
grant execute on function pausar_linea(text, uuid, uuid) to anon, authenticated;
grant execute on function continuar_linea(text, uuid, uuid) to anon, authenticated;
grant execute on function terminar_sabor_linea(text, uuid, uuid) to anon, authenticated;
