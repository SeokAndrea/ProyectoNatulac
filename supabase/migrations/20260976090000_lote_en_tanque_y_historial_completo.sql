-- ============================================================
-- LOTE EN EL TANQUE DESDE LA PREPARACIÓN + HISTORIAL CON VALORES
-- ============================================================
-- 1. iniciar_preparacion() ponía el tanque EN_PREPARACION y BORRABA
--    recepcion_tanques.lote / lote_id — el número de lote recién
--    aparecía en el tanque al liberar el lote. Ahora se guarda desde
--    que arranca la preparación: el tanque muestra su lote todo el
--    tiempo (EN_PREPARACION → LISTO → STANDBY). liberar_lote() ya
--    seteaba los dos campos, así que el estado LISTO no cambia.
--
-- 2. historial_dia_area() sumaba las acciones pero sin varios de sus
--    valores. Se completan:
--      - Preparación: cantidad de tambores + agua/azúcar/ácido cítrico.
--      - Contadores: marca "(parcial)" cuando es una lectura de
--        referencia de una entrega parcial.
--      - Producto Terminado: nuevas filas con paletas/cajas por corrida.
--      - Entregas parciales: una fila por entrega, con el incremento.
-- ============================================================

-- ------------------------------------------------------------
-- iniciar_preparacion(): idéntica a 20260964090000, salvo que el
-- UPDATE final conserva lote / lote_id en el tanque.
-- ------------------------------------------------------------
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_reserva_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
  v_reserva reservas_tobos%rowtype;
  v_nuevo_lote_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque_actual.condicion = 'LISTO' and v_tanque_actual.lote_id is not null then
    update preparaciones set cerrado_en = now() where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now()
    where lote_id = v_tanque_actual.lote_id and activa;
  elsif v_tanque_actual.condicion = 'STANDBY' then
    v_volumen_l := v_volumen_l + coalesce(v_tanque_actual.volumen_l, 0);
  end if;

  if p_reserva_id is not null then
    select * into v_reserva from reservas_tobos where id = p_reserva_id and consumido_en is null;
    if v_reserva.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_reserva.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_reserva.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id)
  values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_reserva_id is not null then
    update reservas_tobos
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_reserva_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = normalizar_lote(p_lote), lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function iniciar_preparacion(text, uuid, smallint, uuid, text, integer, numeric, numeric, numeric, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- historial_dia_area(): las acciones con todos sus valores.
-- ------------------------------------------------------------
create or replace function historial_dia_area(p_area_codigo text, p_fecha date)
returns table (
  supervisor_usuario text,
  supervisor_nombre text,
  hora time,
  seccion text,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.usuario, u.nombre, t.hora_inicio, 'Comenzar Turno'::text, ('Turno ' || t.codigo)::text
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  where a.codigo = p_area_codigo and t.fecha = p_fecha

  union all

  select u.usuario, u.nombre, prep.created_at::time, 'Preparación'::text,
         ('Tanque ' || prep.numero_tanque
           || coalesce(' · ' || s.nombre, '')
           || coalesce(' · Lote ' || prep.lote, '')
           || ' · ' || prep.tambores || ' tambores'
           || coalesce(' · agua ' || prep.agua || ' L', '')
           || coalesce(' · azúcar ' || prep.azucar || ' kg', '')
           || coalesce(' · ácido cítrico ' || prep.acido_citrico || ' kg', ''))::text
  from preparaciones prep
  join turnos t on t.id = prep.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = prep.usuario_id
  left join sabores s on s.id = prep.sabor_id
  where a.codigo = p_area_codigo and prep.created_at::date = p_fecha

  union all

  select u.usuario, u.nombre, rt.activada_en::time, 'Status (Tanques)'::text,
         ('Tanque ' || rt.numero_tanque || ' → ' || rt.condicion)::text
  from recepcion_tanques rt
  join turnos t on t.id = rt.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = rt.actualizada_por
  where a.codigo = p_area_codigo and rt.actualizada_por is not null and rt.activada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, tl.activada_en::time, 'Líneas'::text,
         (l.codigo || ': corrida activada' || coalesce(' · Lote ' || tl.lote, ''))::text
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = tl.activada_por
  join lineas l on l.id = tl.linea_id
  where a.codigo = p_area_codigo and tl.activada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, tl.entregada_en::time, 'Líneas'::text,
         (l4.codigo || ': entregada al siguiente turno, sigue activa')::text
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = tl.entregada_por
  join lineas l4 on l4.id = tl.linea_id
  where a.codigo = p_area_codigo and tl.entregada_en is not null and tl.entregada_en::date = p_fecha

  union all

  select u.usuario, u.nombre, c.created_at::time, 'Contadores'::text,
         (l2.codigo || ': ' || c.envases_llenadora || ' envases'
           || case when c.parcial then ' (parcial, referencia)' else '' end)::text
  from contadores c
  join turnos t on t.id = c.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = c.usuario_id
  join lineas l2 on l2.id = c.linea_id
  where a.codigo = p_area_codigo and c.created_at::date = p_fecha

  union all

  select u.usuario, u.nombre, pt.updated_at::time, 'Producto Terminado'::text,
         (l5.codigo || ': ' || pt.paletas || ' paletas · ' || pt.cajas_sueltas || ' cajas sueltas'
           || coalesce(' · Lote ' || tl5.lote, ''))::text
  from producto_terminado pt
  join turnos t on t.id = pt.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = pt.usuario_id
  join lineas l5 on l5.id = pt.linea_id
  left join turno_lineas tl5 on tl5.id = pt.turno_linea_id
  where a.codigo = p_area_codigo and pt.updated_at::date = p_fecha

  union all

  select u.usuario, u.nombre, ptp.created_at::time, 'Producto Terminado'::text,
         (l6.codigo || ': entrega parcial · +' || ptp.paletas || ' paletas'
           || case when ptp.cajas_sueltas > 0 then ' · +' || ptp.cajas_sueltas || ' cajas sueltas' else '' end
           || coalesce(' · Lote ' || tl6.lote, ''))::text
  from producto_terminado_parciales ptp
  join turnos t on t.id = ptp.turno_id
  join areas a on a.id = t.area_id
  join usuarios u on u.id = ptp.usuario_id
  join lineas l6 on l6.id = ptp.linea_id
  left join turno_lineas tl6 on tl6.id = ptp.turno_linea_id
  where a.codigo = p_area_codigo and ptp.created_at::date = p_fecha

  order by 1, 3;
end;
$$;

grant execute on function historial_dia_area(text, date) to anon, authenticated;
