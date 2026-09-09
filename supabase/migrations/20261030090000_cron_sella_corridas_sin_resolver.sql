-- ============================================================
-- Cierre automático: sellar corridas sin resolver + verlas en VALIDAR
-- ============================================================
-- `finalizar_turno` (Case 6, 20261028) obliga al supervisor a cargar el
-- PT y elegir Terminar / Entregar por cada línea activa. Pero
-- `cerrar_turnos_vencidos` (el cron, 30 min después del fin nominal)
-- cierra con un UPDATE pelado, sin ese chequeo. Si el supervisor
-- abandona el turno, su corrida queda varada: `activa=false`,
-- `finalizada_en=null`, sin PT, sin contador — y NO aparece en VALIDAR
-- (el filtro pide PT o contador). La producción de ese tramo se pierde
-- en silencio y no hay forma de corregirla desde la app.
--
-- Dos cambios:
--
--  1. `cerrar_turnos_vencidos`: al forzar el cierre de un turno, sella
--     toda corrida que quede sin resolver — corriendo/pausada sin
--     entregar, o en ESPERANDO_PT: `activa=false, finalizada_en=now()`.
--     NO inventa un PT. Corre `revisar_cierre_de_lote` por cada lote
--     (idempotente, con guardas). Las corridas ya entregadas
--     (`entregada_en` puesto) NO se tocan: siguen `activa` para que el
--     turno siguiente las herede.
--
--  2. `listar_validacion_produccion`: incluye las corridas de turnos con
--     `cierre_automatico = true` aunque no tengan PT ni contador, con un
--     flag `sin_pt` para que el analista las vea y cargue el número real
--     desde VALIDAR (EDITAR).
--
-- Las dos son `create or replace`, sin cambio de firma.
-- ============================================================

-- ------------------------------------------------------------
-- 1. cerrar_turnos_vencidos()
-- ------------------------------------------------------------
create or replace function cerrar_turnos_vencidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := (now() at time zone 'America/Caracas');
  v_turno_id uuid;
  v_lote_id uuid;
begin
  for v_turno_id in
    select t.id
    from turnos t
    join turno_tipos tt on tt.id = t.turno_tipo_id
    join areas a on a.id = t.area_id
    where t.estado = 'ABIERTO'
      and a.codigo <> 'PRUEBAS'
      and tt.hora_inicio is not null
      and tt.hora_fin is not null
      and ((t.fecha + (case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end)) + tt.hora_fin + interval '30 minutes') < v_ahora
  loop
    -- Sellar corridas sin resolver (mismas que bloquea finalizar_turno):
    -- corriendo/pausada sin entregar, o en ESPERANDO_PT. Sin inventar PT.
    update turno_lineas
    set activa = false,
        finalizada_en = coalesce(finalizada_en, now())
    where turno_id = v_turno_id
      and (
        (activa and entregada_en is null)
        or (activa = false and finalizada_en is null)
      );

    -- Ordenar lote/tanque de cada lote del turno (idempotente).
    for v_lote_id in
      select distinct lote_id from turno_lineas
      where turno_id = v_turno_id and lote_id is not null
    loop
      perform revisar_cierre_de_lote(v_lote_id);
    end loop;

    -- Cerrar el turno (dispara el trigger de freeze de volúmenes).
    update turnos
    set estado = 'CERRADO',
        fecha_fin = v_ahora::date,
        hora_fin = v_ahora::time,
        cierre_automatico = true
    where id = v_turno_id and estado = 'ABIERTO';
  end loop;
end;
$$;

grant execute on function cerrar_turnos_vencidos() to anon, authenticated;

-- ------------------------------------------------------------
-- 2. listar_validacion_produccion(): idéntica a 20261005 salvo el
--    filtro (suma `t.cierre_automatico`) y el flag `sin_pt`.
-- ------------------------------------------------------------
create or replace function listar_validacion_produccion(
  p_usuario text,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
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

  select coalesce(jsonb_agg(fila order by fila ->> 'fecha' desc, fila ->> 'supervisor_nombre', fila ->> 'turno_codigo', fila ->> 'linea'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'turno_linea_id', tl.id,
      'turno_codigo', t.codigo,
      'fecha', t.fecha,
      'supervisor_nombre', su.nombre,
      'area_nombre', ar.nombre,
      'linea', ln.nombre,
      'presentacion', coalesce(p.volumen_ml::text || ' ml', '—'),
      'sabor', sabor_display(s.nombre, f.nombre),
      'lote', tl.lote,
      -- true = el turno se cerró solo (cron) y esta corrida quedó sin su
      -- Producto Terminado: el analista tiene que cargar el número real.
      'sin_pt', (pt.turno_linea_id is null),
      'cierre_automatico', coalesce(t.cierre_automatico, false),
      'supervisor', jsonb_build_object(
        'paletas', coalesce(pt.paletas, 0),
        'cajas_sueltas', coalesce(pt.cajas_sueltas, 0),
        'cajas', coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0),
        'envases_llenadora', coalesce(cont.llenadora, 0),
        'litros_producidos', round(coalesce(pt.litros_producidos, 0)),
        'litros_consumidos', round(coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) / 1000.0),
        'merma_envases_pct', case
          when coalesce(cont.llenadora, 0) > 0 then round(
            (1 - ((coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0))
                  * coalesce(p.envases_x_caja, 0))::numeric / cont.llenadora) * 100, 1)
          end,
        'merma_semielaborado_pct', case
          when coalesce(cont.llenadora, 0) * coalesce(p.volumen_ml, 0) > 0 then round(
            (1 - coalesce(pt.litros_producidos, 0) / (cont.llenadora * p.volumen_ml / 1000.0)) * 100, 1)
          end
      ),
      'estado', coalesce(v.estado, 'PENDIENTE'),
      'overrides', case when v.estado = 'EDITADO' then jsonb_strip_nulls(jsonb_build_object(
          'paletas', v.paletas,
          'cajasSueltas', v.cajas_sueltas,
          'envasesLlenadora', v.envases_llenadora,
          'litrosConsumidos', v.litros_consumidos,
          'lote', v.lote,
          'mermaEnvasesPct', v.merma_envases_pct,
          'mermaSemielaboradoPct', v.merma_semielaborado_pct,
          'nota', v.nota
        )) else null end,
      'validado_por_nombre', vu.nombre,
      'validado_en', v.validado_en
    ) as fila
    from turno_lineas tl
    join turnos t on t.id = tl.turno_id and t.estado = 'CERRADO'
    join areas ar on ar.id = t.area_id and ar.codigo <> 'PRUEBAS'
    join usuarios su on su.id = t.supervisor_id
    join lineas ln on ln.id = tl.linea_id
    left join presentaciones p on p.id = tl.presentacion_id
    left join sabores s on s.id = tl.sabor_id
    left join familias_producto f on f.id = s.familia_id
    left join producto_terminado pt on pt.turno_linea_id = tl.id
    left join lateral (
      select sum(c.envases_llenadora) as llenadora
      from contadores c
      where c.turno_linea_id = tl.id and coalesce(c.parcial, false) = false
    ) cont on true
    left join validacion_produccion v on v.turno_linea_id = tl.id
    left join usuarios vu on vu.id = v.validado_por
    where t.fecha >= date '2026-09-02'  -- la validación arranca desde el 02/09/2026; lo anterior no se revisa
      and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
      and (pt.turno_linea_id is not null or cont.llenadora is not null or coalesce(t.cierre_automatico, false))
  ) x;

  return v_result;
end;
$$;

grant execute on function listar_validacion_produccion(text, date, date) to anon, authenticated;
