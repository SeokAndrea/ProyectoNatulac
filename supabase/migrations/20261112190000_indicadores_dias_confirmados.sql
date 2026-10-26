-- ============================================================
-- Indicadores: el día cuenta cuando sus cajas están confirmadas
-- ============================================================
-- Dueña, 2026-10-26: los Indicadores (modo AUTOMÁTICO) contaban solo los días
-- marcados VALIDADA en Validar jornada, pero esa pantalla sigue en prueba y
-- solo la ve el Área de Pruebas: en Aséptico ningún día llegaba nunca. Donde
-- la Analista confirma y corrige de verdad es en el Resumen Diario, en el
-- mensaje de WhatsApp (validacion_turno, por turno + sabor + presentación).
--
-- Ahora un día cuenta si todos sus turnos están cerrados y:
--   * cada sabor + presentación del PT de cada turno está confirmado o
--     corregido en el Resumen Diario (un día sin PT no tiene nada que
--     confirmar y cuenta igual: lo producido es 0), o
--   * el día está VALIDADA en Validar jornada (como antes).
-- Las correcciones de Validar jornada (contadores, lotes, paradas) se siguen
-- usando donde las haya. Solo cambia qué días entran; el resto es igual a
-- 20261109990000_indicadores.sql.
-- ============================================================

create or replace function indicadores_turnos(p_usuario text, p_area_codigo text, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_area_id uuid;
  v_dias date[];
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver los indicadores.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  -- Días con las cajas confirmadas en el Resumen Diario (o validados en Validar jornada).
  select coalesce(array_agg(d.fecha), '{}') into v_dias
  from (
    select distinct t.fecha
    from turnos t
    where t.area_id = v_area_id and t.fecha between p_desde and p_hasta and t.estado = 'CERRADO'
  ) d
  where not exists (
      select 1 from turnos t
      where t.area_id = v_area_id and t.fecha = d.fecha and t.estado <> 'CERRADO'
    )
    and (
      exists (
        select 1 from validacion_jornada vj
        where vj.area_id = v_area_id and vj.fecha = d.fecha and vj.estado = 'VALIDADA'
      )
      or not exists (
        select 1
        from producto_terminado pt
        join turnos t on t.id = pt.turno_id
        join presentaciones pr on pr.id = pt.presentacion_id
        where t.area_id = v_area_id and t.fecha = d.fecha
          and not exists (
            select 1 from validacion_turno vt
            where vt.turno_id = t.id
              and vt.sabor_nombre = nombre_sabor_resumen(pt.sabor_id)
              and vt.volumen_ml = pr.volumen_ml
          )
      )
    );

  return jsonb_build_object(
    'turnos', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'turno', turno_json(t.id),
          'paradas', (
            select coalesce(jsonb_agg(to_jsonb(lp)), '[]'::jsonb)
            from listar_paradas(t.fecha, t.fecha, null, null, t.id, null) lp
          )
        )
        order by t.fecha, t.hora_inicio
      ), '[]'::jsonb)
      from turnos t
      where t.area_id = v_area_id and t.fecha = any (v_dias) and t.estado = 'CERRADO'
    ),
    'validaciones', (
      select coalesce(jsonb_agg(validacion_jornada_de(p_usuario, p_area_codigo, d) || jsonb_build_object('fecha', d)), '[]'::jsonb)
      from unnest(v_dias) d
    ),
    'cajas', (
      select coalesce(jsonb_agg(jsonb_build_object('turno_id', vt.turno_id, 'sabor_id', s.id, 'volumen_ml', vt.volumen_ml, 'cajas', vt.cajas)), '[]'::jsonb)
      from validacion_turno vt
      join turnos t on t.id = vt.turno_id
      join sabores s on nombre_sabor_resumen(s.id) = vt.sabor_nombre
      where t.area_id = v_area_id and t.fecha = any (v_dias) and vt.cajas is not null
    ),
    'plan', (
      select coalesce(jsonb_agg(jsonb_build_object('volumen_ml', x.volumen_ml, 'cajas', x.cajas)), '[]'::jsonb)
      from (
        select p.volumen_ml, sum(pd.cajas_plan) as cajas
        from programacion_dia pd
        join presentaciones p on p.id = pd.presentacion_id
        where pd.area_id = v_area_id and pd.fecha between p_desde and p_hasta
        group by p.volumen_ml
      ) x
    )
  );
end;
$$;
grant execute on function indicadores_turnos(text, text, date, date) to anon, authenticated;
