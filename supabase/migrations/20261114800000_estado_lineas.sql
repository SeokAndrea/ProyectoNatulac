-- ============================================================
-- ESTADO DE LÍNEA DESDE LA BASE (dueña, 2026-11-05)
-- ============================================================
-- Fase 2 de docs/superpowers/specs/2026-11-05-estado-linea-unico-design.md.
--
-- 1. estado_lineas(área): el estado YA DECIDIDO de cada línea del área, con
--    la parada en curso. Lo piden cada 15 s la tarjeta de Líneas, el Modo
--    Paradas y los dos paneles: todos reciben la misma respuesta y, si algo
--    cambió, recargan sus datos solos (antes el Panel de Producción se
--    refrescaba cada 15 min y Líneas solo al tocar algo). Es también la
--    entrada para el PLC.
--    Misma regla que src/components/panel/calculosPanel.ts (estadoDeLineas +
--    aplicarParadasEnVivo), que queda solo de respaldo si esta función no
--    responde. Si se cambia una, se cambia la otra (y el ensayo
--    scripts/ensayo-estado-lineas.sql).
--
-- 2. Un solo turno ABIERTO por área. abrir_turno() ya cierra el anterior en
--    el mismo paso, pero dos aperturas en el mismo instante (el botón y el
--    respaldo de las 7:30) podían dejar dos abiertos. Ahora la segunda falla.
--    Se revisa al confirmar la transacción (DEFERRABLE): abrir_turno inserta
--    el nuevo y cierra el anterior dentro de la misma.
-- ============================================================

-- ------------------------------------------------------------
-- 1. estado_lineas
-- ------------------------------------------------------------
-- Estados: activa | parada | detenida_por_parada | cip | cambio_presentacion
--          | sin_programacion | libre
--   * Con corrida manda lo guardado: Parar la pausa al instante y
--     aplicar_paradas_a_lineas a los 15 min de una parada abierta. Pausada
--     con la línea en CIP: cip.
--   * Sin corrida (también si una espera su PT: «Esperando PT» no es un
--     estado): la condición de la línea, o libre.
--   * Sin corrida, una parada abierta visible: detenida_por_parada (la LNPE,
--     sin_programacion). Visible = LNPE o de Mantenimiento al instante; las
--     demás desde los 15 min. Con corrida o en CIP solo se informa.
--   * Sin turno abierto (entre un turno y otro): nada de turno, solo paradas.
create or replace function estado_lineas(p_area_codigo text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ahora timestamptz := now();
  v_area_id uuid;
  v_area_codigo text;
  v_turno_id uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_estado text;
  v_parada jsonb;
  r record;
begin
  if p_area_codigo is not null then
    select id, codigo into v_area_id, v_area_codigo from areas where codigo = p_area_codigo;
    if v_area_id is null then
      raise exception 'Área % no existe', p_area_codigo;
    end if;
  else
    -- Sin área (Super Admin, áreas de apoyo): la producción con turno abierto, nunca Pruebas.
    select a.id, a.codigo into v_area_id, v_area_codigo
    from turnos t
    join areas a on a.id = t.area_id
    where t.estado = 'ABIERTO' and a.codigo <> 'PRUEBAS'
    order by t.created_at desc
    limit 1;
    if v_area_id is null then
      select id, codigo into v_area_id, v_area_codigo from areas where codigo = 'ASEPTICO';
    end if;
  end if;

  select t.id into v_turno_id
  from turnos t
  where t.area_id = v_area_id and t.estado = 'ABIERTO'
  order by t.created_at desc
  limit 1;

  for r in
    select l.id, l.codigo, l.nombre,
           c.id as corrida_id, c.pausada_en, c.lote_terminado_en,
           le.condicion, le.observacion
    from lineas l
    left join lateral (
      select tl.id, tl.pausada_en, tl.lote_terminado_en
      from turno_lineas tl
      where tl.turno_id = v_turno_id and tl.linea_id = l.id and tl.activa
      order by tl.activada_en desc
      limit 1
    ) c on true
    left join lineas_estado le on le.turno_id = v_turno_id and le.linea_id = l.id
    where l.area_id = v_area_id and l.activo
    order by l.codigo
  loop
    -- Estado según la corrida en marcha o la condición de la línea.
    if r.corrida_id is not null then
      v_estado := case
        when r.pausada_en is not null and r.condicion = 'CIP' then 'cip'
        when r.pausada_en is not null then 'parada'
        else 'activa'
      end;
    else
      v_estado := case r.condicion
        when 'CIP' then 'cip'
        when 'CAMBIO_PRESENTACION' then 'cambio_presentacion'
        when 'SIN_PROGRAMACION' then 'sin_programacion'
        else 'libre'
      end;
    end if;

    -- La parada en curso: primero la LNPE, después la de Mantenimiento, después la más larga.
    select jsonb_build_object(
             'id', x.id,
             'inicio', x.inicio,
             'tipo_nombre', x.tipo_nombre,
             'nota', x.nota,
             'de_mantenimiento', x.mtto,
             'linea_no_programada', x.lnp,
             'visible', x.lnp or x.mtto or x.inicio <= v_ahora - interval '15 minutes'
           )
    into v_parada
    from (
      select p.id, p.inicio, p.tipo_nombre, p.nota,
             coalesce(pt.prefijo_planilla, '') = 'LNPE' as lnp,
             coalesce(p.responsable, '') = 'MANTENIMIENTO' and coalesce(pt.prefijo_planilla, '') <> 'LNPE' as mtto
      from paradas p
      left join paradas_tipos pt on pt.id = p.tipo_id
      where p.linea_id = r.id
        and not p.pendiente
        and p.inicio >= v_ahora - interval '31 days'
        and (
          p.fin is null
          -- La LNPE cargada hasta el final del turno sigue en curso hasta esa hora.
          or (coalesce(pt.prefijo_planilla, '') = 'LNPE' and p.inicio <= v_ahora and p.fin > v_ahora)
        )
      order by lnp desc, mtto desc, p.inicio asc
      limit 1
    ) x;

    -- Sin parada registrada pero con la corrida en pausa: el aviso es la pausa.
    if v_parada is null and r.pausada_en is not null then
      v_parada := jsonb_build_object(
        'id', null,
        'inicio', r.pausada_en,
        'tipo_nombre', null,
        'nota', null,
        'de_mantenimiento', false,
        'linea_no_programada', false,
        'visible', r.pausada_en <= v_ahora - interval '15 minutes'
      );
    end if;

    -- Sin corrida, la parada abierta visible detiene la línea.
    if v_estado not in ('activa', 'parada', 'cip') and v_parada is not null and (v_parada ->> 'visible')::boolean then
      v_estado := case when (v_parada ->> 'linea_no_programada')::boolean then 'sin_programacion' else 'detenida_por_parada' end;
    end if;

    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'linea_codigo', r.codigo,
      'linea_nombre', r.nombre,
      'estado', v_estado,
      'corrida_id', r.corrida_id,
      'pausada_en', r.pausada_en,
      'lote_terminado', r.lote_terminado_en is not null,
      'condicion', r.condicion,
      'observacion', case when r.condicion = 'CIP' then r.observacion end,
      'parada', v_parada
    ));
  end loop;

  return jsonb_build_object(
    'area_codigo', v_area_codigo,
    'turno_id', v_turno_id,
    'calculado_en', v_ahora,
    'lineas', v_lineas
  );
end;
$$;

-- Como estado_planta_actual: lo leen los paneles con cualquier sesión (también Solo Vista).
grant execute on function estado_lineas(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Un solo turno ABIERTO por área
-- ------------------------------------------------------------
-- Si hoy ya hay dos abiertos en un área, no se pone (fallaría): avisa cuáles
-- para cerrarlos y volver a correr este bloque. El resto de la migración
-- queda aplicado igual.
do $$
declare
  v_dup text;
begin
  select string_agg(format('%s (%s abiertos)', a.codigo, d.n), ', ')
  into v_dup
  from (
    select area_id, count(*) as n
    from turnos
    where estado = 'ABIERTO'
    group by area_id
    having count(*) > 1
  ) d
  join areas a on a.id = d.area_id;

  if v_dup is not null then
    raise warning 'No se puso el candado de un turno abierto por área: hoy hay más de uno en %. Ciérrelos y vuelva a correr este bloque.', v_dup;
  elsif not exists (select 1 from pg_constraint where conname = 'turnos_un_abierto_por_area') then
    alter table turnos
      add constraint turnos_un_abierto_por_area
      exclude using btree (area_id with =) where (estado = 'ABIERTO')
      deferrable initially deferred;
  end if;
end;
$$;
