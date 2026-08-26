-- ============================================================
-- CIERRE AUTOMÁTICO DE TURNO VENCIDO (excepto área PRUEBAS)
-- ============================================================
-- turno_tipos.hora_fin existe desde 20260819120000_core_schema.sql
-- pero el comentario original decía "no se usan para validar nada
-- todavía". Si un supervisor se olvida de cerrar su turno, hoy queda
-- ABIERTO para siempre. Se agrega un cierre automático, 30 minutos
-- después de la hora programada de fin del turno_tipo — el área
-- PRUEBAS queda excluida a propósito (no debe interferir con pruebas
-- manuales), y los turnos '12X12' (hora_fin null, sin horario fijo)
-- tampoco se tocan.
--
-- No hay ninguna infraestructura de polling/cron en este proyecto
-- (las lecturas en vivo como estado_planta_actual/turno_activo_de solo
-- se disparan al abrir una pantalla, no hay refetch periódico) — así
-- que esto se hace con pg_cron corriendo server-side cada 5 minutos,
-- independiente de que alguien tenga la app abierta o no.
--
-- El servidor Postgres corre en UTC; turno_tipos.hora_fin está en hora
-- LOCAL de planta (America/Caracas, UTC-4 sin horario de verano) —
-- igual que el resto del sistema, que ya corrige esto del lado del
-- navegador (fechaLocal()/horaLocal() en src/lib/turno.tsx). Acá se
-- hace la conversión explícita con "at time zone" antes de comparar.
-- ============================================================

alter table turnos add column cierre_automatico boolean not null default false;

create or replace function cerrar_turnos_vencidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := (now() at time zone 'America/Caracas');
begin
  update turnos t
  set estado = 'CERRADO',
      fecha_fin = v_ahora::date,
      hora_fin = v_ahora::time,
      cierre_automatico = true
  from turno_tipos tt, areas a
  where t.turno_tipo_id = tt.id
    and t.area_id = a.id
    and t.estado = 'ABIERTO'
    and a.codigo <> 'PRUEBAS'
    and tt.hora_inicio is not null
    and tt.hora_fin is not null
    and ((t.fecha + (case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end)) + tt.hora_fin + interval '30 minutes') < v_ahora;
end;
$$;

grant execute on function cerrar_turnos_vencidos() to anon, authenticated;

-- ------------------------------------------------------------
-- Programar el job cada 5 minutos. Si "create extension pg_cron"
-- falla por permisos al aplicar esta migración, hay que habilitarla
-- primero desde el Dashboard de Supabase (Database → Extensions) y
-- volver a correr `supabase db push`.
-- ------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('cerrar-turnos-vencidos', '*/5 * * * *', $$select cerrar_turnos_vencidos();$$);

-- ------------------------------------------------------------
-- turno_json(): expone cierre_automatico (sin UI propia todavía, solo
-- disponible como dato).
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
