-- ============================================================
-- FASE 2 §2.9 — Teardown: sin entregas parciales, sin producto retenido
-- ============================================================
-- El frontend ya no puede CREAR una entrega parcial (`ced6b2e`) ni marcar
-- producto retenido (oculto desde plan-validar-produccion.md §2). Esto
-- termina el trabajo del lado de la base:
--
--   - dropea la tabla `producto_terminado_parciales` (el total ya vive en
--     `producto_terminado.paletas/cajas_sueltas`, se sumó ahí en cada
--     carga — no se pierde ningún total real, solo el detalle de auditoría
--     de cómo se construyó).
--   - dropea `producto_terminado.{tiene_parciales, producto_retenido,
--     cajas_retenidas, editado_por, editado_en}`.
--   - dropea `contadores.parcial`, previo borrado de las filas
--     `parcial = true` que queden: son checkpoints de referencia de una
--     entrega parcial — el contador físico es acumulativo, así que la
--     lectura FINAL de esa misma corrida ya trae el total completo.
--   - dropea `corregir_producto_terminado_auditoria` (código muerto, ver
--     plan §2.1 — ningún botón la llama, y quedaría rota al perder
--     `editado_por`/`editado_en`).
--
-- Decisión del dueño (2026-09-13): la base se reinicia el 01/10, así que
-- no hace falta preservar el detalle histórico de parciales/retenido —
-- solo importa que los cálculos de ACÁ EN ADELANTE queden bien.
--
-- `registrar_contador` y `registrar_producto_terminado` cambian de firma
-- (se sacan los parámetros muertos) — van `drop function` + `create`,
-- no `create or replace`. El resto (`turno_json`, `estadisticas_produccion`,
-- `listar_validacion_produccion`) mantienen su firma. `historial_dia_area`
-- NO se toca acá: ya se dropeó en `20261032` (la página "Historial del
-- Día" se eliminó del frontend, era su única consumidora) — no es una de
-- las 6 funciones a reescribir, el plan quedó desactualizado en ese punto.
--
-- OJO: la versión previa de `registrar_producto_terminado` (base real:
-- `20261018`, no `20260975` como decía el plan) ya tenía el candado de 1h
-- (`p_auditar`, `20261004`) y usaba `revisar_cierre_de_lote()` en vez del
-- bloque de cierre de tanque en línea — se preserva todo eso acá, solo se
-- saca lo de parciales/retenido.
--
-- Frontend en el mismo commit: `src/lib/productoTerminado.ts` y
-- `src/lib/produccion/nucleo.ts` dejan de mandar los parámetros que se
-- sacan acá (si no, PostgREST rechaza la llamada por parámetro
-- desconocido). Sin Docker para probar la cadena local — mismo riesgo
-- consciente que ya se tomó con `20261018`/`20261019`.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Limpieza previa: filas que van a quedar huérfanas al dropear.
-- ------------------------------------------------------------
delete from contadores where parcial;

-- ------------------------------------------------------------
-- 1. Código muerto que referencia lo que se dropea abajo.
-- ------------------------------------------------------------
drop function if exists corregir_producto_terminado_auditoria(text, uuid, integer, integer);

-- ------------------------------------------------------------
-- 2. Tabla y columnas.
-- ------------------------------------------------------------
drop table if exists producto_terminado_parciales;

alter table producto_terminado
  drop column if exists tiene_parciales,
  drop column if exists producto_retenido,
  drop column if exists cajas_retenidas,
  drop column if exists editado_por,
  drop column if exists editado_en;

alter table contadores
  drop column if exists parcial;

-- ------------------------------------------------------------
-- 3. registrar_contador() — sin p_parcial. Firma nueva: se dropea la
--    anterior (20261036) antes de crear.
-- ------------------------------------------------------------
drop function if exists registrar_contador(uuid, uuid, text, integer, text, text, boolean, text, integer);

create function registrar_contador(
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
-- 4. registrar_producto_terminado() — sin producto_retenido/
--    cajas_retenidas/parcial/forzar_total. Un solo total al cierre,
--    siempre reemplaza (nunca suma). Base real: 20261018 (con el candado
--    de 1h de 20261004 y `revisar_cierre_de_lote()` de la costura 2) —
--    NO 20260975, que es la versión vieja de antes de esa costura.
-- ------------------------------------------------------------
drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean, text, boolean);

create function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_pagina text default null,
  p_auditar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_registro producto_terminado%rowtype;
  v_litros_previos numeric;
  v_litros_delta numeric;
  v_lote_id uuid;
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
  v_pt_creado timestamptz;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.';
  end if;

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  -- Solo baja el volumen del lote. El cierre del lote/tanque lo hace
  -- revisar_cierre_de_lote. Producción no escribe en recepcion_tanques.
  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_litros_delta <> 0 then
    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
    where id = v_lote_id and cerrado_en is null;
  end if;

  -- Cierra la corrida si quedó en ESPERANDO_PT.
  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  -- Y aunque la corrida ya se hubiera cerrado antes (p. ej. el contador la
  -- cerró en la misma pantalla), revisar acá si ESTE PT dejó el lote en
  -- ~0 — cerrar_corrida_si_esperando ya no correría revisar_cierre_de_lote.
  if v_lote_id is not null then
    perform revisar_cierre_de_lote(v_lote_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. estadisticas_produccion() — sin el filtro `not c.parcial` (ya no
--    puede haber lecturas de referencia). Firma sin cambios.
-- ------------------------------------------------------------
create or replace function estadisticas_produccion(p_fecha_desde date default null, p_fecha_hasta date default null, p_area_codigo text default null)
returns table (
  turno_id uuid,
  turno_codigo text,
  fecha date,
  hora_inicio time,
  hora_fin time,
  estado text,
  turno_tipo_codigo text,
  grupo_codigo text,
  area_codigo text,
  supervisor_usuario text,
  supervisor_nombre text,
  linea_codigo text,
  turno_linea_id uuid,
  envases_llenadora bigint,
  paletas integer,
  cajas_sueltas integer,
  cajas_x_paleta integer,
  envases_x_caja integer,
  volumen_ml integer,
  litros_producidos numeric,
  sabor_nombre text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    t.id,
    t.codigo,
    t.fecha,
    t.hora_inicio,
    t.hora_fin,
    t.estado,
    tt.codigo,
    g.codigo,
    a.codigo,
    u.usuario,
    u.nombre,
    l.codigo,
    tl.id,
    coalesce(ct.envases_llenadora, 0),
    coalesce(pt.paletas, 0),
    coalesce(pt.cajas_sueltas, 0),
    coalesce(pr.cajas_x_paleta, 0),
    coalesce(pr.envases_x_caja, 0),
    pr.volumen_ml,
    coalesce(pt.litros_producidos, 0),
    s.nombre || ' (' || fs.nombre || ')'
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join turno_lineas tl on tl.turno_id = t.id
  join lineas l on l.id = tl.linea_id
  left join lateral (
    select sum(c.envases_llenadora) as envases_llenadora
    from contadores c
    where c.turno_linea_id = tl.id
  ) ct on true
  left join producto_terminado pt on pt.turno_linea_id = tl.id
  left join presentaciones pr on pr.id = pt.presentacion_id
  left join sabores s on s.id = pt.sabor_id
  left join familias_producto fs on fs.id = s.familia_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
    and (
      (p_area_codigo is not null and a.codigo = p_area_codigo)
      or (p_area_codigo is null and a.codigo <> 'PRUEBAS')
    )
  order by t.fecha desc, t.hora_inicio desc, l.codigo, tl.activada_en;
end;
$$;

grant execute on function estadisticas_produccion(date, date, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. turno_json() — idéntica a 20261031 salvo: `contadores` sin
--    'parcial', `producto_terminado` sin 'producto_retenido' /
--    'cajas_retenidas' / 'tiene_parciales' / 'parciales' /
--    'editado_por_nombre' / 'editado_en' (y su join a `eu`). Firma sin
--    cambios.
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

-- ------------------------------------------------------------
-- 7. listar_validacion_produccion() — sin el filtro
--    `coalesce(c.parcial, false) = false`. Firma sin cambios.
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
      where c.turno_linea_id = tl.id
    ) cont on true
    left join validacion_produccion v on v.turno_linea_id = tl.id
    left join usuarios vu on vu.id = v.validado_por
    where t.fecha >= date '2026-09-02'
      and (p_fecha_desde is null or t.fecha >= p_fecha_desde)
      and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
      and (pt.turno_linea_id is not null or cont.llenadora is not null or coalesce(t.cierre_automatico, false))
  ) x;

  return v_result;
end;
$$;

grant execute on function listar_validacion_produccion(text, date, date) to anon, authenticated;
