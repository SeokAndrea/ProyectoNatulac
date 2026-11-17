-- ============================================================
-- Nitrógeno: bombonas llenas al recibir y al entregar el turno
-- (Alexander, 2026-11-17)
-- ============================================================
-- Obligatorio en Comenzar Turno (al recibir) y en Finalizar Turno (al
-- entregar, con las bombonas que llegaron en el turno). Consumo del turno =
-- recibidas + llegaron - entregadas. Si se entregan más llenas de las que hay
-- (ej. recibe 3 y entrega 5), no se guarda hasta anotar las que llegaron
-- (al menos 2) o corregir los conteos.
--   * turnos.nitrogeno_aplica: false en los turnos que ya existían (no se les
--     pide ni sale en su acta), true en los nuevos.
--   * turno_nitrogeno: una fila por turno, aparte de turnos para no tocar sus
--     disparadores. La auditoría la escribe guardar_nitrogeno_turno().
--   * guardar_nitrogeno_turno(): INICIO o FIN.
--   * turno_json(): nitrogeno_aplica, nitrogeno y lo que entregó el turno
--     anterior. Copia de 20261109490000 + esos campos.
--   * finalizar_turno(): no cierra sin el nitrógeno (salvo Pruebas). Copia de
--     20261111190000 + esa regla. Los cierres automáticos no pasan por aquí.
-- ============================================================

alter table turnos add column if not exists nitrogeno_aplica boolean not null default false;
alter table turnos alter column nitrogeno_aplica set default true;
comment on column turnos.nitrogeno_aplica is 'Pide y muestra el nitrógeno del turno: false en los turnos anteriores a 20261116290000.';

create table if not exists turno_nitrogeno (
  turno_id uuid primary key references turnos (id) on delete cascade,
  inicio integer check (inicio between 0 and 999),
  llegaron integer not null default 0 check (llegaron between 0 and 999),
  fin integer check (fin between 0 and 999),
  inicio_por uuid references usuarios (id),
  inicio_en timestamptz,
  fin_por uuid references usuarios (id),
  fin_en timestamptz,
  constraint turno_nitrogeno_cuadra check (inicio is null or fin is null or fin <= inicio + llegaron)
);
comment on table turno_nitrogeno is 'Bombonas de nitrógeno llenas al recibir (inicio), que llegaron y al entregar (fin) el turno. Consumo = inicio + llegaron - fin.';
alter table turno_nitrogeno enable row level security;

-- ------------------------------------------------------------
-- guardar_nitrogeno_turno(): INICIO = bombonas llenas al recibir;
-- FIN = bombonas llenas al entregar + las que llegaron en el turno.
-- Se puede corregir mientras se puedan cargar datos del turno.
-- ------------------------------------------------------------
create or replace function guardar_nitrogeno_turno(
  p_usuario text,
  p_turno_id uuid,
  p_momento text,
  p_bombonas integer,
  p_llegaron integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_codigo text;
  v_antes turno_nitrogeno;
  v_inicio integer;
  v_llegaron integer;
  v_fin integer;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario) and activo;
  if v_usuario_id is null then
    raise exception 'Usuario no válido.';
  end if;
  if not (tiene_permiso(p_usuario, 'TURNO_CARGAR') or tiene_permiso(p_usuario, 'TURNO_ASUMIR')) then
    raise exception 'No tienes permiso para cargar datos del turno.';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  select codigo into v_codigo from turnos where id = p_turno_id;

  if coalesce(p_momento, '') not in ('INICIO', 'FIN') then
    raise exception 'Momento no válido.';
  end if;
  if p_bombonas is null or p_bombonas < 0 or p_bombonas > 999 then
    raise exception 'Escribe cuántas bombonas llenas hay (un número entero desde 0).';
  end if;
  if p_llegaron is not null and (p_llegaron < 0 or p_llegaron > 999) then
    raise exception 'Las bombonas que llegaron tienen que ser un número entero desde 0.';
  end if;

  select * into v_antes from turno_nitrogeno where turno_id = p_turno_id for update;
  v_inicio := v_antes.inicio;
  v_llegaron := coalesce(v_antes.llegaron, 0);
  v_fin := v_antes.fin;
  if p_momento = 'INICIO' then
    v_inicio := p_bombonas;
  else
    v_fin := p_bombonas;
    v_llegaron := coalesce(p_llegaron, v_llegaron);
  end if;

  if v_inicio is not null and v_fin is not null and v_fin > v_inicio + v_llegaron then
    raise exception 'Entregas % bombonas llenas, pero recibiste % y anotaste % que llegaron en el turno. Si llegaron bombonas, anota cuántas en «Llegaron en el turno» (al menos %); si no, revisa los conteos.',
      v_fin, v_inicio, v_llegaron, v_fin - v_inicio;
  end if;

  insert into turno_nitrogeno (turno_id, inicio, llegaron, fin, inicio_por, inicio_en, fin_por, fin_en)
  values (
    p_turno_id, v_inicio, v_llegaron, v_fin,
    case when p_momento = 'INICIO' then v_usuario_id end, case when p_momento = 'INICIO' then now() end,
    case when p_momento = 'FIN' then v_usuario_id end, case when p_momento = 'FIN' then now() end
  )
  on conflict (turno_id) do update
  set inicio = excluded.inicio,
      llegaron = excluded.llegaron,
      fin = excluded.fin,
      inicio_por = coalesce(excluded.inicio_por, turno_nitrogeno.inicio_por),
      inicio_en = coalesce(excluded.inicio_en, turno_nitrogeno.inicio_en),
      fin_por = coalesce(excluded.fin_por, turno_nitrogeno.fin_por),
      fin_en = coalesce(excluded.fin_en, turno_nitrogeno.fin_en);

  perform registrar_auditoria(
    p_usuario,
    case when v_antes.turno_id is null then 'CREAR' else 'EDITAR' end,
    'turno_nitrogeno',
    p_turno_id::text,
    case when p_momento = 'INICIO' then 'Comenzar Turno' else 'Finalizar Turno' end,
    'Nitrógeno del turno ' || coalesce(v_codigo, '') || case when p_momento = 'INICIO'
      then ': ' || v_inicio || ' bombonas llenas al recibir'
      else ': ' || v_fin || ' bombonas llenas al entregar, llegaron ' || v_llegaron end,
    case when v_antes.turno_id is null then null
         else jsonb_build_object('inicio', v_antes.inicio, 'llegaron', v_antes.llegaron, 'fin', v_antes.fin) end,
    jsonb_build_object('inicio', v_inicio, 'llegaron', v_llegaron, 'fin', v_fin)
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function guardar_nitrogeno_turno(text, uuid, text, integer, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- turno_json(): + nitrogeno_aplica, nitrogeno, nitrogeno_turno_anterior.
-- ------------------------------------------------------------
-- Última versión: 20261109490000_lotes_para_vacio.sql
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
    -- Nitrógeno (20261116290000): bombonas llenas al recibir, las que llegaron y al entregar.
    'nitrogeno_aplica', t.nitrogeno_aplica,
    'nitrogeno', (
      select jsonb_build_object('inicio', n.inicio, 'llegaron', n.llegaron, 'fin', n.fin)
      from turno_nitrogeno n where n.turno_id = t.id
    ),
    -- Lo que entregó el turno anterior del área (para comparar con lo que se recibe).
    'nitrogeno_turno_anterior', (
      select n.fin
      from (
        select p.id from turnos p
        where p.area_id = t.area_id and p.id <> t.id and (p.fecha + p.hora_inicio) < (t.fecha + t.hora_inicio)
        order by p.fecha + p.hora_inicio desc
        limit 1
      ) anterior
      join turno_nitrogeno n on n.turno_id = anterior.id
    ),
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', case when t.grupo_pendiente then 'SIN_GRUPO' else g.codigo end,
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
    'sin_responsable', u.usuario = 'sistema',
    'grupo_pendiente', t.grupo_pendiente,
    'apertura_automatica', t.apertura_automatica,
    'esquema', t.esquema,
    'correcciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', cu.nombre,
        'motivo', c.motivo,
        'creada_en', c.creada_en
      ) order by c.creada_en)
      from turno_correcciones c
      join usuarios cu on cu.id = c.usuario_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario', ru.usuario,
        'nombre', ru.nombre,
        'motivo', tr.motivo,
        'desde', tr.desde,
        'hasta', tr.hasta
      ) order by tr.desde)
      from turno_responsables tr
      join usuarios ru on ru.id = tr.usuario_id
      where tr.turno_id = t.id
    ), '[]'::jsonb),
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
        'entrega_automatica', tl.entrega_automatica,
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
        'cip_finalizado_en', rt.cip_finalizado_en,
        -- VACÍO (20261109490000)
        'para_vacio', coalesce(prep_t.para_vacio, false)
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
          when t.volumenes_lote_inicio is not null and jsonb_exists(t.volumenes_lote_inicio, prep.id::text)
            then (t.volumenes_lote_inicio ->> prep.id::text)::numeric
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
        'cerrado_en', prep.cerrado_en,
        -- VACÍO (20261109490000)
        'para_vacio', prep.para_vacio
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
         -- VACÍO (20261109490000): los lotes de los que salió algo a Vacío en este turno.
         or prep.id in (
           select sv.lote_id from salidas_vacio sv
           where sv.turno_id = t.id and sv.lote_id is not null
         )
    ), '[]'::jsonb),
    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'litros', tr.litros,
        'modo', tr.modo,
        'lote_id_origen', tr.lote_id_origen,
        'lote_id_destino', tr.lote_id_destino,
        'creado_en', tr.creado_en
      ) order by tr.creado_en)
      from transferencias tr
      where tr.turno_id = t.id
    ), '[]'::jsonb),
    'desvases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'litros', d.litros,
        'lote_id_origen', d.lote_id_origen,
        'creado_en', d.creado_en
      ) order by d.creado_en)
      from desvases d
      where d.turno_id_origen = t.id
    ), '[]'::jsonb),
    -- VACÍO (20261109490000)
    'salidas_vacio', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id,
        'numero_tanque', sv.numero_tanque,
        'lote_id', sv.lote_id,
        'lote', sv.lote,
        'sabor_nombre', sabor_display(svs.nombre, svf.nombre),
        'litros', sv.litros,
        'de_lote_vacio', sv.de_lote_vacio,
        'usuario_nombre', svu.nombre,
        'creado_en', sv.creado_en
      ) order by sv.creado_en)
      from salidas_vacio sv
      left join sabores svs on svs.id = sv.sabor_id
      left join familias_producto svf on svf.id = svs.familia_id
      left join usuarios svu on svu.id = sv.usuario_id
      where sv.turno_id = t.id
    ), '[]'::jsonb),
    'novedades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'texto', n.texto,
        'creado_en', n.creado_en,
        'creado_por_nombre', nu.nombre
      ) order by n.creado_en)
      from turno_novedades n
      left join usuarios nu on nu.id = n.usuario_id
      where n.turno_id = t.id
    ), '[]'::jsonb),
    'ajustes_volumen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', av.id,
        'lote_id', av.lote_id,
        'numero_tanque', avp.numero_tanque,
        'lote', avp.lote,
        'sabor_nombre', sabor_display(avs.nombre, avfs.nombre),
        'litros', av.litros,
        'detalle', av.detalle,
        'creado_en', av.creado_en,
        'usuario_nombre', avu.nombre
      ) order by av.creado_en)
      from preparaciones_ajuste_volumen av
      join preparaciones avp on avp.id = av.lote_id
      left join sabores avs on avs.id = avp.sabor_id
      left join familias_producto avfs on avfs.id = avs.familia_id
      left join usuarios avu on avu.id = av.usuario_id
      where av.turno_id = t.id
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
-- finalizar_turno(): + no cierra sin el nitrógeno (salvo Pruebas).
-- ------------------------------------------------------------
-- Última versión: 20261111190000_corridas_entregadas_congeladas.sql
create or replace function finalizar_turno(p_usuario text, p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas_activas text;
  v_es_pruebas boolean;
  v_pendientes integer;
  v_codigo text;
  v_inicio timestamp;
begin
  perform exigir_puede_finalizar(p_usuario, p_turno_id);

  -- El turno que el sistema le abrió al mismo supervisor como continuación
  -- del suyo (12x12 a las 22:30, relevo temprano) no se finaliza en sus
  -- primeras 2 h: el anterior ya quedó cerrado y su PT va en la gracia.
  select t.codigo, t.fecha + t.hora_inicio
  into v_codigo, v_inicio
  from turnos t
  where t.id = p_turno_id
    and t.apertura_automatica
    and t.supervisor_id = (select id from usuarios where usuario = lower(p_usuario))
    and exists (
      select 1 from turnos p
      where p.area_id = t.area_id and p.id <> t.id and p.estado = 'CERRADO'
        and p.supervisor_id = t.supervisor_id
        and p.fecha_fin + p.hora_fin between t.fecha + t.hora_inicio - interval '2 minutes'
                                         and t.fecha + t.hora_inicio + interval '2 minutes'
    );
  if v_codigo is not null and (now() at time zone 'America/Caracas') < v_inicio + interval '2 hours' then
    raise exception 'El turno % lo abrió el sistema a las % como continuación del tuyo: el turno anterior ya quedó cerrado. No lo finalices, sigues a cargo hasta el cambio de turno. Si falta PT del turno anterior, cárgalo en Producto Terminado con «Cargar en el turno anterior».',
      v_codigo, to_char(v_inicio, 'HH24:MI');
  end if;
  select (a.codigo = 'PRUEBAS') into v_es_pruebas
  from turnos t
  join areas a on a.id = t.area_id
  where t.id = p_turno_id;

  select count(*) into v_pendientes from paradas where turno_id = p_turno_id and pendiente;
  if v_pendientes > 0 then
    raise exception 'Hay % parada(s) sin completar (tipo o minutos). Complétalas en Registrar Paradas antes de finalizar el turno.',
      v_pendientes;
  end if;

  if not coalesce(v_es_pruebas, false) then
    -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sin su Producto Terminado. Cárgalo antes de finalizar el turno.';
    end if;

    -- Case 6: corrida todavía activa y sin entregar. Hay que cargar el PT
    -- del tramo de este turno y elegir Terminar o Entregar línea.
    select string_agg(l.nombre, ', ' order by l.codigo)
    into v_lineas_activas
    from turno_lineas tl
    join lineas l on l.id = tl.linea_id
    where tl.turno_id = p_turno_id and tl.activa and tl.entregada_en is null;

    if v_lineas_activas is not null then
      raise exception 'Estas líneas siguen activas: %. Carga su Producto Terminado de este turno y elige Terminar o Entregar línea antes de finalizar.',
        v_lineas_activas;
    end if;

    -- Tanque con producción de este turno sin confirmar su estado
    -- final: sin esto, el cierre queda a merced de la foto automática
    -- (el bug de hoy).
    if exists (
      select 1
      from recepcion_tanques rt
      where rt.turno_id = p_turno_id
        and rt.confirmado_fin_en is null
        and rt.lote_id is not null
        and exists (select 1 from turno_lineas tl where tl.turno_id = p_turno_id and tl.lote_id = rt.lote_id)
    ) then
      raise exception 'Hay tanques con producción de este turno sin confirmar su estado final. Confírmalos desde Preparación antes de finalizar.';
    end if;

    -- Línea que se ENTREGA activa al turno siguiente sin confirmar su
    -- fin: es el único caso de línea con riesgo real de arrastre (mismo
    -- criterio que tanques) — una corrida que ya terminó (finalizada_en,
    -- por PT o por reemplazo) no hereda nada, no lo necesita. Red de
    -- seguridad: en el flujo normal ya queda confirmada sola al Entregar
    -- línea (ver entregar_corrida más arriba).
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id
        and activa and entregada_en is not null
        and confirmado_fin_en is null
    ) then
      raise exception 'Hay líneas entregadas de este turno sin confirmar su estado final.';
    end if;

    -- Nitrógeno (20261116290000): obligatorio al recibir y al entregar, solo en
    -- los turnos abiertos después de la migración (nitrogeno_aplica).
    if (select nitrogeno_aplica from turnos where id = p_turno_id) and not exists (
      select 1 from turno_nitrogeno where turno_id = p_turno_id and inicio is not null and fin is not null
    ) then
      raise exception 'Falta el nitrógeno del turno: carga las bombonas llenas al recibir y al entregar antes de finalizar.';
    end if;
  end if;

  update turnos
  set estado = 'CERRADO',
      fecha_fin = (now() at time zone 'America/Caracas')::date,
      hora_fin = (now() at time zone 'America/Caracas')::time
  where id = p_turno_id and estado = 'ABIERTO';
end;
$$;

select * from asegurar_control_usuario();
