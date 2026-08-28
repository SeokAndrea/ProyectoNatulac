-- ============================================================
-- LA MERMA DE SEMIELABORADO DEL "TURNO PASADO" NO DEBE MOVERSE
-- ============================================================
-- mermaSemielaboradoTurno() (src/lib/panelProduccion.ts) calcula, por
-- cada lote que alimentó una corrida del turno, volumen_inicial_l -
-- volumen_l. volumen_inicial_l queda fijo desde que se arma el lote,
-- pero volumen_l es EN VIVO: cada Producto Terminado que se registra
-- contra ese lote lo baja.
--
-- Para el turno EN CURSO eso está bien (es un número que todavía se
-- está formando). El problema es el "turno pasado": obtenerResumenTurno-
-- Anterior() corre turno_anterior_json() -> turno_json() de un turno
-- YA CERRADO por las mismas funciones. Si ese turno dejó un lote de
-- preparación continua ABIERTO (cerrado_en is null), el turno SIGUIENTE
-- le sigue bajando volumen_l, así que la merma del turno cerrado
-- "cambia a cada rato" cada vez que se refresca el Panel.
--
-- Arreglo: al pasar un turno de ABIERTO a CERRADO, se congela en
-- turnos.volumenes_lote_cierre un snapshot { lote_id: volumen_l } de
-- todos los lotes que alimentaron sus corridas, tal como estaban en
-- ese instante. turno_json() usa ese valor congelado (en vez del
-- volumen_l vivo) SOLO para turnos CERRADO que tengan snapshot — el
-- turno en vivo y los turnos viejos sin snapshot se comportan igual
-- que antes. Se congela el INSUMO (volumen_l), no la merma calculada:
-- así mermaSemielaboradoTurno() sigue siendo la única fórmula (ver
-- 20260966090000) y es imposible que diverja.
--
-- No se hace backfill de turnos ya cerrados: su volumen_l de cierre no
-- quedó registrado en ningún lado y el valor de hoy sería incorrecto.
-- El turno cerrado más reciente puede seguir moviéndose hasta que
-- cierre el siguiente turno (que ya sí queda congelado por el trigger).
-- ============================================================

alter table turnos add column volumenes_lote_cierre jsonb;

-- ------------------------------------------------------------
-- Trigger: congela el snapshot en la transición ABIERTO -> CERRADO.
-- Cubre las dos vías de cierre (finalizar_turno manual y
-- cerrar_turnos_vencidos() por pg_cron) y cualquier otra futura.
-- Ediciones posteriores a un turno ya CERRADO no vuelven a disparar
-- (old.estado ya no es 'ABIERTO'), así que el snapshot es inmutable.
-- ------------------------------------------------------------
create or replace function turnos_congelar_volumenes_lote_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'CERRADO' and old.estado = 'ABIERTO' and new.volumenes_lote_cierre is null then
    select jsonb_object_agg(prep.id::text, to_jsonb(prep.volumen_l))
    into new.volumenes_lote_cierre
    from preparaciones prep
    where prep.id in (
      select distinct tl.lote_id
      from turno_lineas tl
      where tl.turno_id = new.id and tl.lote_id is not null
    );
  end if;
  return new;
end;
$$;

create trigger trg_turnos_congelar_volumenes_lote_cierre
before update on turnos
for each row
execute function turnos_congelar_volumenes_lote_cierre();

-- ------------------------------------------------------------
-- turno_json(): idéntica a 20260961090000, con un solo cambio — en el
-- bloque "preparaciones", volumen_l sale del snapshot congelado cuando
-- el turno está CERRADO y tiene ese lote en volumenes_lote_cierre.
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
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', s3.nombre || ' (' || fs3.nombre || ')',
        'lote', prep.lote,
        'volumen_l', case
          when t.estado = 'CERRADO' and jsonb_exists(t.volumenes_lote_cierre, prep.id::text)
          then (t.volumenes_lote_cierre ->> prep.id::text)::numeric
          else prep.volumen_l
        end,
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
      where prep.turno_id = t.id
         or (
           prep.cerrado_en is null
           and exists (
             select 1 from turnos t_prep
             where t_prep.id = prep.turno_id and t_prep.area_id = t.area_id
           )
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
