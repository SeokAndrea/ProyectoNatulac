-- ============================================================
-- VALIDAR: Contador 2 (envases buenos), datos de presentación para
-- recalcular al editar, y paradas del turno
-- ============================================================
-- 1. validacion_produccion gana `envases_buenos` (override del Contador 2).
-- 2. listar_validacion_produccion() devuelve además el Contador 2 del
--    supervisor y los datos de la presentación (cajas/paleta, envases/caja,
--    litros/caja, volumen) — así el front recalcula cajas, litros y mermas
--    cuando se edita paletas, cajas sueltas o contador.
-- 3. editar_produccion_validada() recibe `p_envases_buenos` y registra
--    auditoría explícita (antes no la tenía).
-- 4. paradas_de_turnos(): las paradas de una lista de turnos, para verlas
--    en Validar junto a los tanques (solo SUPERADMINISTRADOR).
-- ============================================================

alter table validacion_produccion add column envases_buenos integer;

-- ------------------------------------------------------------
-- listar_validacion_produccion(): misma firma, más campos.
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
      'datos_presentacion', jsonb_build_object(
        'cajas_x_paleta', coalesce(pt.cajas_x_paleta, p.cajas_x_paleta),
        'envases_x_caja', p.envases_x_caja,
        'litros_x_caja', p.litros_x_caja,
        'volumen_ml', p.volumen_ml
      ),
      'supervisor', jsonb_build_object(
        'paletas', coalesce(pt.paletas, 0),
        'cajas_sueltas', coalesce(pt.cajas_sueltas, 0),
        'cajas', coalesce(pt.paletas, 0) * coalesce(pt.cajas_x_paleta, p.cajas_x_paleta, 0) + coalesce(pt.cajas_sueltas, 0),
        'envases_llenadora', coalesce(cont.llenadora, 0),
        'envases_buenos', cont.buenos,
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
          'envasesBuenos', v.envases_buenos,
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
      select sum(c.envases_llenadora) as llenadora,
             sum(c.envases_buenos) as buenos
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

-- ------------------------------------------------------------
-- editar_produccion_validada(): + p_envases_buenos (Contador 2) y auditoría.
-- ------------------------------------------------------------
drop function if exists editar_produccion_validada(text, uuid, integer, integer, integer, numeric, text, numeric, numeric, text);

create function editar_produccion_validada(
  p_usuario text,
  p_turno_linea_id uuid,
  p_paletas integer default null,
  p_cajas_sueltas integer default null,
  p_envases_llenadora integer default null,
  p_litros_consumidos numeric default null,
  p_lote text default null,
  p_merma_envases_pct numeric default null,
  p_merma_semielaborado_pct numeric default null,
  p_nota text default null,
  p_envases_buenos integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_turno_id uuid;
  v_antes validacion_produccion;
  v_codigo text;
begin
  if not es_superadmin(p_usuario) then
    raise exception 'No tienes permiso para validar producción.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select turno_id into v_turno_id from turno_lineas where id = p_turno_linea_id;
  if v_turno_id is null then
    raise exception 'Esa corrida no existe.';
  end if;
  select codigo into v_codigo from turnos where id = v_turno_id;

  if p_envases_buenos is not null and p_envases_buenos < 0 then
    raise exception 'El Contador 2 no puede ser negativo.';
  end if;

  select * into v_antes from validacion_produccion where turno_linea_id = p_turno_linea_id;

  insert into validacion_produccion (
    turno_linea_id, turno_id, estado,
    paletas, cajas_sueltas, envases_llenadora, envases_buenos, litros_consumidos, lote,
    merma_envases_pct, merma_semielaborado_pct, nota,
    validado_por, validado_en
  )
  values (
    p_turno_linea_id, v_turno_id, 'EDITADO',
    p_paletas, p_cajas_sueltas, p_envases_llenadora, p_envases_buenos, p_litros_consumidos, nullif(trim(coalesce(p_lote, '')), ''),
    p_merma_envases_pct, p_merma_semielaborado_pct, nullif(trim(coalesce(p_nota, '')), ''),
    v_usuario_id, now()
  )
  on conflict (turno_linea_id) do update
    set estado = 'EDITADO',
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        envases_llenadora = excluded.envases_llenadora,
        envases_buenos = excluded.envases_buenos,
        litros_consumidos = excluded.litros_consumidos,
        lote = excluded.lote,
        merma_envases_pct = excluded.merma_envases_pct,
        merma_semielaborado_pct = excluded.merma_semielaborado_pct,
        nota = excluded.nota,
        validado_por = v_usuario_id, validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_produccion', p_turno_linea_id::text, 'Validar',
    format('Corrigió la producción validada del turno %s', v_codigo),
    case when v_antes.turno_linea_id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'estado', v_antes.estado, 'paletas', v_antes.paletas, 'cajas_sueltas', v_antes.cajas_sueltas,
      'envases_llenadora', v_antes.envases_llenadora, 'envases_buenos', v_antes.envases_buenos,
      'litros_consumidos', v_antes.litros_consumidos, 'lote', v_antes.lote,
      'merma_envases_pct', v_antes.merma_envases_pct, 'merma_semielaborado_pct', v_antes.merma_semielaborado_pct)) end,
    jsonb_strip_nulls(jsonb_build_object(
      'estado', 'EDITADO', 'paletas', p_paletas, 'cajas_sueltas', p_cajas_sueltas,
      'envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
      'litros_consumidos', p_litros_consumidos, 'lote', p_lote,
      'merma_envases_pct', p_merma_envases_pct, 'merma_semielaborado_pct', p_merma_semielaborado_pct,
      'nota', p_nota))
  );
end;
$$;

grant execute on function editar_produccion_validada(text, uuid, integer, integer, integer, numeric, text, numeric, numeric, text, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- paradas_de_turnos(): { codigo_turno: [ {linea, clase, tipo, minutos, guia, nota, justificacion} ] }
-- Solo lectura, para Validar.
-- ------------------------------------------------------------
create or replace function paradas_de_turnos(p_usuario text, p_codigos text[])
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

  select coalesce(jsonb_object_agg(x.codigo, x.paradas), '{}'::jsonb)
  into v_result
  from (
    select t.codigo,
           jsonb_agg(jsonb_build_object(
             'linea', l.nombre,
             'clase', p.clase,
             'tipo', p.tipo_nombre,
             'minutos', greatest(0, round(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)),
             'guia', p.tiempo_guia_min,
             'nota', p.nota,
             'justificacion', p.justificacion_desvio
           ) order by l.nombre, p.inicio) as paradas
    from turnos t
    join paradas p on p.turno_id = t.id
    join lineas l on l.id = p.linea_id
    where t.codigo = any(p_codigos)
    group by t.codigo
  ) x;

  return v_result;
end;
$$;

grant execute on function paradas_de_turnos(text, text[]) to anon, authenticated;
