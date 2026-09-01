-- ============================================================
-- KITS EN LOS TEXTOS DEL SERVIDOR (Historial del Día)
-- ============================================================
-- Selecto, Mango y "35%" se preparan por KITS (1 kit = 2 tambores).
-- El frontend ya cambia el rótulo (src/lib/sabores.ts unidadPreparacion);
-- acá se hace lo mismo del lado del servidor: helper unidad_preparacion()
-- e historial_dia_area() lo usa para no decir "N tambores" cuando en
-- realidad son kits.
-- ============================================================

create or replace function unidad_preparacion(p_sabor_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when p_sabor_id is null then 'tambores'
    when exists (
      select 1
      from sabores s
      left join familias_producto f on f.id = s.familia_id
      where s.id = p_sabor_id
        and (coalesce(f.nombre, '') ~* 'selecto|35\s*%' or s.nombre ~* 'mango|35\s*%')
    ) then 'kits'
    else 'tambores'
  end;
$$;

grant execute on function unidad_preparacion(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- historial_dia_area(): igual que 20260976, sólo cambia "N tambores"
-- por "N kits/tambores" según el sabor.
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
           || ' · ' || prep.tambores || ' ' || unidad_preparacion(prep.sabor_id)
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
