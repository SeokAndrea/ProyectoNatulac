-- ============================================================
-- PRODUCTO TERMINADO: ENTREGA PARCIAL DE LOTE ("continuar lote")
-- ============================================================
-- Hasta ahora una corrida tenía UNA fila en producto_terminado con el
-- TOTAL de paletas/cajas, que se REEMPLAZA al editar (20260929). No se
-- podía entregar un lote por tandas: cargar unas paletas, seguir
-- produciendo, y más tarde cargar SOLO las paletas nuevas sin
-- recalcular el total a mano.
--
-- Se agrega la "entrega parcial":
--   - p_parcial = true en registrar_producto_terminado(): las paletas
--     del parámetro son un INCREMENTO — se SUMAN al total acumulado, se
--     deja constancia en producto_terminado_parciales, se descuenta el
--     volumen del lote/tanque como siempre (por delta) y NO se cierra la
--     corrida (no se llama cerrar_corrida_si_esperando). El auto-cierre
--     por tanque vacío (20260934) se conserva: si el tanque llegó a 0 el
--     lote terminó igual, no hay nada que "continuar".
--   - Una corrida que ya tuvo parciales (producto_terminado.tiene_parciales)
--     queda en modo ADITIVO también para el cierre definitivo
--     (p_parcial = false): la última carga es el incremento final y ahí
--     sí se cierra. p_forzar_total = true vuelve al reemplazo del total
--     — lo usa la corrección de admin desde Editar Turno.
--
-- Contador: la lectura que se anota en una entrega parcial va a
-- contadores con parcial = true — queda como REFERENCIA y se EXCLUYE de
-- todo cálculo de merma/estadística. El contador que vale es el del
-- cierre definitivo (parcial = false).
-- ============================================================

alter table contadores add column parcial boolean not null default false;
alter table producto_terminado add column tiene_parciales boolean not null default false;

create table producto_terminado_parciales (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  turno_linea_id uuid not null references turno_lineas (id) on delete cascade,
  linea_id uuid not null references lineas (id),
  sabor_id uuid references sabores (id),
  presentacion_id uuid not null references presentaciones (id),
  paletas integer not null check (paletas >= 0),
  cajas_sueltas integer not null check (cajas_sueltas >= 0),
  cajas_x_paleta integer not null,
  litros_x_caja numeric(6, 2) not null,
  litros numeric(12, 2) generated always as (
    (paletas * cajas_x_paleta + cajas_sueltas) * litros_x_caja
  ) stored,
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now()
);

alter table producto_terminado_parciales enable row level security;

-- ------------------------------------------------------------
-- registrar_contador(): gana p_parcial. Una lectura parcial se guarda
-- marcada y nunca cierra la corrida "esperando cierre".
-- ------------------------------------------------------------
drop function if exists registrar_contador(uuid, uuid, text, integer, text, text);

create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_parcial boolean default false
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

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, justificacion, usuario_id, parcial)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, nullif(p_justificacion, ''), v_usuario_id, coalesce(p_parcial, false));

  if not coalesce(p_parcial, false) then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_contador(uuid, uuid, text, integer, text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_producto_terminado(): gana p_parcial + p_forzar_total.
--   - v_aditivo = entrega parcial, o corrida que ya tuvo parciales
--     (salvo que un admin fuerce el reemplazo del total).
--   - Con p_parcial: suma el incremento, deja constancia en
--     producto_terminado_parciales, descuenta volumen por delta como
--     siempre, y NO cierra la corrida.
--   - El auto-cierre por tanque vacío (20260934) se mantiene también en
--     parciales: es una señal física.
-- ------------------------------------------------------------
drop function if exists registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer);

create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_producto_retenido boolean default false,
  p_cajas_retenidas integer default null,
  p_parcial boolean default false,
  p_forzar_total boolean default false
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
  v_numero_tanque smallint;
  v_nuevo_volumen numeric;
  v_lote_sabor_id uuid;
  v_lote_lote text;
  v_tanque_condicion text;
  v_parcial boolean := coalesce(p_parcial, false);
  v_tiene_parciales boolean;
  v_aditivo boolean;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select litros_producidos, tiene_parciales into v_litros_previos, v_tiene_parciales
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_litros_previos := coalesce(v_litros_previos, 0);

  v_aditivo := v_parcial or (coalesce(v_tiene_parciales, false) and not coalesce(p_forzar_total, false));

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id,
    producto_retenido, cajas_retenidas, tiene_parciales
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id,
    p_producto_retenido, p_cajas_retenidas, v_parcial
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = case when v_aditivo then producto_terminado.paletas + excluded.paletas else excluded.paletas end,
        cajas_sueltas = case when v_aditivo then producto_terminado.cajas_sueltas + excluded.cajas_sueltas else excluded.cajas_sueltas end,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        producto_retenido = excluded.producto_retenido,
        cajas_retenidas = excluded.cajas_retenidas,
        tiene_parciales = producto_terminado.tiene_parciales or excluded.tiene_parciales,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  if v_parcial then
    insert into producto_terminado_parciales (
      turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
    )
    values (
      p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
    );
  end if;

  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null then
    if v_litros_delta <> 0 then
      update preparaciones
      set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta)
      where id = v_lote_id and cerrado_en is null;
    end if;

    select numero_tanque, volumen_l, sabor_id, lote into v_numero_tanque, v_nuevo_volumen, v_lote_sabor_id, v_lote_lote
    from preparaciones where id = v_lote_id;

    if v_numero_tanque is not null then
      select condicion into v_tanque_condicion
      from recepcion_tanques where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

      if v_tanque_condicion = 'LISTO' and coalesce(v_nuevo_volumen, 0) <= 0 then
        update recepcion_tanques
        set condicion = 'SUCIO',
            sabor_id = null,
            volumen_l = null,
            lote = null,
            lote_id = null,
            activada_en = now(),
            ultimo_sabor_id = v_lote_sabor_id,
            ultimo_lote = 'Restos del lote ' || coalesce(v_lote_lote, '?')
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;

        update preparaciones set cerrado_en = now() where id = v_lote_id and cerrado_en is null;

        update turno_lineas
        set lote_terminado_en = now()
        where lote_id = v_lote_id and activa;
      else
        update recepcion_tanques
        set volumen_l = v_nuevo_volumen
        where turno_id = p_turno_id and numero_tanque = v_numero_tanque and lote_id = v_lote_id;
      end if;
    end if;
  end if;

  if not v_parcial then
    perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  end if;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function registrar_producto_terminado(uuid, uuid, text, uuid, integer, integer, integer, text, boolean, integer, boolean, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- corregir_producto_terminado_auditoria(): la corrección de admin fija
-- el TOTAL (p_forzar_total => true) aun si la corrida tuvo parciales.
-- Limitación conocida: no edita un parcial puntual, setea el gran total.
-- ------------------------------------------------------------
create or replace function corregir_producto_terminado_auditoria(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer,
  p_cajas_sueltas integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno_id uuid;
  v_turno_area_codigo text;
  v_linea_codigo text;
  v_sabor_id uuid;
  v_volumen_ml integer;
  v_producto_retenido boolean;
  v_cajas_retenidas integer;
  v_resultado jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is null or v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select pt.turno_id, l.codigo, pt.sabor_id, p.volumen_ml, pt.producto_retenido, pt.cajas_retenidas
  into v_turno_id, v_linea_codigo, v_sabor_id, v_volumen_ml, v_producto_retenido, v_cajas_retenidas
  from producto_terminado pt
  join lineas l on l.id = pt.linea_id
  join presentaciones p on p.id = pt.presentacion_id
  where pt.turno_linea_id = p_turno_linea_id;

  if v_turno_id is null then
    raise exception 'No se encontró Producto Terminado para esa corrida.';
  end if;

  select a.codigo into v_turno_area_codigo from turnos t join areas a on a.id = t.area_id where t.id = v_turno_id;
  if v_rol = 'ADMINISTRADOR_AREA' and v_turno_area_codigo is distinct from v_area then
    raise exception 'No tienes permiso para editar esto.';
  end if;

  v_resultado := registrar_producto_terminado(
    v_turno_id, p_turno_linea_id, v_linea_codigo, v_sabor_id, v_volumen_ml,
    p_paletas, p_cajas_sueltas, p_usuario, v_producto_retenido, v_cajas_retenidas, false, true
  );

  update producto_terminado
  set editado_por = v_usuario_id, editado_en = now()
  where turno_linea_id = p_turno_linea_id;

  return turno_json(v_turno_id);
end;
$$;

grant execute on function corregir_producto_terminado_auditoria(text, uuid, integer, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- estadisticas_produccion(): los contadores parciales (referencia) no
-- cuentan para la merma histórica.
-- ------------------------------------------------------------
drop function if exists estadisticas_produccion(date, date, text);

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
    where c.turno_linea_id = tl.id and not c.parcial
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
-- turno_json(): idéntica a 20260969090000, con:
--   - contadores expone 'parcial'
--   - producto_terminado expone 'tiene_parciales' y el detalle
--     'parciales' (una entrada por entrega parcial, para auditoría/acta)
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
