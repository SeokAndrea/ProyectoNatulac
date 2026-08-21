-- ============================================================
-- PRODUCTO TERMINADO
-- ============================================================
-- Registro manual, uno por línea, cargado al finalizar el turno (no
-- depende de los contadores de envases — es un conteo físico aparte
-- de paletas y "restos": cajas sueltas que no llegaron a armar una
-- paleta entera). Pensado para conectarse más adelante a un PLC que
-- cuente las cajas automáticamente — por eso el dato queda en
-- paletas + cajas_sueltas (números simples), no en texto libre.
--
-- El sabor se elige a mano por ahora (a veces el supervisor continúa
-- el sabor del turno anterior, a veces viene de Recepción, a veces
-- de una futura sección "Preparación" todavía sin definir) — cuando
-- eso se resuelva, esto se puede conectar automático.
--
-- cajas_x_paleta y litros_x_caja quedan copiados (snapshot) de la
-- presentación al momento de registrar, mismo criterio que
-- turno_lineas.envases_hora/litros_hora: si la presentación cambia
-- después en Edición de Datos, este registro histórico no se altera.
--
-- Es upsert (un registro por línea, se actualiza si se vuelve a
-- cargar) porque es un conteo final, no una serie de eventos como
-- "contadores".
-- ============================================================

create table producto_terminado (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  linea_id uuid not null references lineas (id),
  sabor_id uuid references sabores (id),
  presentacion_id uuid not null references presentaciones (id),
  paletas integer not null check (paletas >= 0),
  cajas_sueltas integer not null check (cajas_sueltas >= 0),
  cajas_x_paleta integer not null,
  litros_x_caja numeric(6, 2) not null,
  litros_producidos numeric(12, 2) generated always as (
    (paletas * cajas_x_paleta + cajas_sueltas) * litros_x_caja
  ) stored,
  usuario_id uuid not null references usuarios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (turno_id, linea_id)
);

alter table producto_terminado enable row level security;

create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text
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
  v_sabor_nombre text;
  v_registro producto_terminado%rowtype;
begin
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select nombre into v_sabor_nombre from sabores where id = p_sabor_id;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into producto_terminado (
    turno_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_id, linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        usuario_id = excluded.usuario_id,
        updated_at = now()
  returning * into v_registro;

  return jsonb_build_object(
    'linea_codigo', p_linea_codigo,
    'sabor_id', v_registro.sabor_id,
    'sabor_nombre', v_sabor_nombre,
    'presentacion_volumen_ml', p_volumen_ml,
    'paletas', v_registro.paletas,
    'cajas_sueltas', v_registro.cajas_sueltas,
    'litros_producidos', v_registro.litros_producidos,
    'creado_en', v_registro.updated_at
  );
end;
$$;

-- turno_activo_de() se amplía para traer también producto_terminado,
-- igual que ya trae líneas/tanques/contadores.
create or replace function turno_activo_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno_id uuid;
  v_result jsonb;
begin
  select t.id into v_turno_id
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where u.usuario = lower(p_usuario) and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora
      ))
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', s.nombre,
        'condicion', rt.condicion,
        'volumen_l', rt.volumen_l,
        'lote', rt.lote
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'envases_desechados', c.envases_desechados,
        'merma_pct', c.merma_pct,
        'requiere_justificacion', c.requiere_justificacion,
        'justificacion', c.justificacion,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l3.codigo,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', s2.nombre,
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at
      ))
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      where pt.turno_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  where t.id = v_turno_id;

  return v_result;
end;
$$;

grant execute on function registrar_producto_terminado(uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;
