-- ============================================================
-- FALLAS NUEVAS: identificarlas (dueña, 2026-11-13)
-- ============================================================
-- Hasta hoy la cola «Fallas nuevas» solo tenía Descartar: quien mantiene el
-- catálogo creaba la falla en otra pestaña y la parada se quedaba para
-- siempre como «Falla nueva» (en el Top, la SIF y los reportes).
--
-- Ahora, desde la cola, «Identificar»: se elige la falla real del catálogo
-- (si ya existía) o se crea ahí mismo (el código lo arma el catálogo, como
-- siempre), y identificar_falla_nueva():
--   * pone esa falla en la parada donde estaba la «Falla nueva» (la de
--     Producción y/o la final de Mantenimiento), con su nombre y su clase,
--     y la saca de la cola (revisada);
--   * si la parada estaba en una Solicitud de intervención de la «Falla
--     nueva», identifica juntas todas las paradas de esa SIF (siguen siendo
--     «Falla nueva») y la SIF pasa a llamarse como la falla real,
--     conservando número, estado e historial;
--   * si en esa línea ya había otra SIF abierta de la falla real, las dos se
--     unen: queda la más avanzada (En reparación > Pendiente > Inspección; a
--     igual estado, la más vieja), recibe las paradas de la otra y la otra se
--     borra (foto completa en Auditoría). Si la que queda es una Inspección y
--     con las paradas sumadas llega a la cuenta de Intervención del área, sube.
--   * una parada sin SIF, al cambiar de falla, cuenta para la SIF de la falla
--     real con la regla de siempre (fn_paradas_sif).
-- Las «Parada nueva · <prefijo>» (tipos, no fallas) siguen con Descartar.
--
-- listar_fallas_nuevas(): + falla_id (la «Falla nueva» que cuenta, para
-- arrancar el selector en su equipo) y la SIF en la que está.
-- ============================================================

-- ------------------------------------------------------------
-- 1. listar_fallas_nuevas(): copia de 20261114890000 + falla_id y SIF
-- ------------------------------------------------------------
drop function if exists listar_fallas_nuevas(text);

create function listar_fallas_nuevas(p_usuario text)
returns table (
  parada_id uuid,
  linea_codigo text,
  linea_nombre text,
  origen text,
  tipo_nombre text,
  nota text,
  solucion text,
  creada_por text,
  inicio timestamptz,
  fin timestamptz,
  minutos integer,
  terminada boolean,
  falla_id uuid,
  sif_codigo text,
  sif_paradas integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not puede_ver_fallas_nuevas(p_usuario) then
    raise exception 'No tienes permiso para ver las fallas nuevas.';
  end if;
  return query
  select p.id, l.codigo, l.nombre,
         coalesce(e.nombre, t.nombre),
         p.tipo_nombre, p.nota, p.solucion, u.nombre,
         p.inicio, p.fin,
         round(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::integer,
         (p.fin is not null and not p.pendiente),
         case when coalesce(f.reservada, false) then f.id end,
         s.codigo,
         case when s.id is not null then (select count(*)::integer from paradas q where q.sif_id = s.id) end
  from paradas p
  join lineas l on l.id = p.linea_id
  left join catalogo_fallas f on f.id = coalesce(p.falla_final_id, p.falla_produccion_id)
  left join catalogo_subsistemas su on su.id = f.subsistema_id
  left join catalogo_sistemas si on si.id = su.sistema_id
  left join catalogo_equipos e on e.id = si.equipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  left join solicitudes_intervencion s on s.id = p.sif_id
  where p.revisada_en is null
    and (coalesce(f.reservada, false) or coalesce(t.reservada, false))
  order by p.inicio desc;
end;
$$;
grant execute on function listar_fallas_nuevas(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. identificar_falla_nueva()
-- ------------------------------------------------------------
create or replace function rango_estado_sif(p_estado text)
returns integer
language sql
immutable
as $$
  select case p_estado when 'EN_REPARACION' then 3 when 'PENDIENTE' then 2 when 'INSPECCION' then 1 else 0 end;
$$;
revoke execute on function rango_estado_sif(text) from public, anon, authenticated;

create or replace function identificar_falla_nueva(
  p_usuario text,
  p_parada_id uuid,
  p_falla_id uuid,
  p_pagina text default 'Catálogo de Paradas'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_p paradas;
  v_falla catalogo_fallas;
  v_equipo catalogo_equipos;
  v_nombre text;
  v_codigo text;
  v_tipo_id uuid := (select id from paradas_tipos where codigo = 'FALLA_EQUIPO');
  v_sif solicitudes_intervencion;
  v_otra solicitudes_intervencion;
  v_queda uuid;
  v_sale solicitudes_intervencion;
  v_ids uuid[];
  v_n integer;
  v_int integer;
  v_cuenta integer;
  v_unida boolean := false;
begin
  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.revisada_en is not null or not exists (
    select 1 from catalogo_fallas f where f.id = coalesce(v_p.falla_final_id, v_p.falla_produccion_id) and f.reservada
  ) then
    raise exception 'Esa parada ya no tiene «Falla nueva» por identificar.';
  end if;

  select * into v_falla from catalogo_fallas where id = p_falla_id and activo;
  if not found then
    raise exception 'Esa falla no existe o está desactivada.';
  end if;
  if v_falla.reservada then
    raise exception 'Elige la falla real, no «Falla nueva».';
  end if;
  -- Igual que asignar_falla_parada(): la falla tiene que ser de un equipo de la línea (o de servicios).
  select e.* into v_equipo
  from catalogo_subsistemas u
  join catalogo_sistemas s on s.id = u.sistema_id
  join catalogo_equipos e on e.id = s.equipo_id
  where u.id = v_falla.subsistema_id;
  if v_equipo.tipo = 'LINEA' and not exists (
    select 1 from catalogo_equipos_lineas el where el.equipo_id = v_equipo.id and el.linea_id = v_p.linea_id
  ) then
    raise exception 'Esa falla es de %, que no está en esta línea.', v_equipo.nombre;
  end if;
  select v_falla.nombre || ' · ' || u.nombre into v_nombre from catalogo_subsistemas u where u.id = v_falla.subsistema_id;
  v_codigo := codigo_falla(p_falla_id);

  -- Qué paradas: las de su SIF de «Falla nueva» que siguen sin identificar, o solo esta.
  if v_p.sif_id is not null then
    select * into v_sif from solicitudes_intervencion where id = v_p.sif_id for update;
    if not exists (select 1 from catalogo_fallas f where f.id = v_sif.falla_id and f.reservada) then
      v_sif := null;
    end if;
  end if;
  if v_sif.id is not null then
    select array_agg(q.id) into v_ids
    from paradas q
    join catalogo_fallas f on f.id = coalesce(q.falla_final_id, q.falla_produccion_id) and f.reservada
    where q.sif_id = v_sif.id;
  else
    v_ids := array[p_parada_id];
  end if;

  -- Donde estaba la «Falla nueva» va la real (la de Producción y/o la final). Con la SIF ya puesta,
  -- fn_paradas_sif no la mueve; sin SIF, cuenta para la de la falla real con la regla de siempre.
  update paradas q
  set falla_final_id = case when exists (select 1 from catalogo_fallas f where f.id = q.falla_final_id and f.reservada)
                            then p_falla_id else q.falla_final_id end,
      falla_produccion_id = case when exists (select 1 from catalogo_fallas f where f.id = q.falla_produccion_id and f.reservada)
                                 then p_falla_id else q.falla_produccion_id end,
      tipo_id = v_tipo_id,
      tipo_nombre = v_nombre,
      clase = v_falla.clase,
      revisada_en = now(),
      revisada_por = v_uid
  where q.id = any (v_ids);
  get diagnostics v_n = row_count;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Identificó %s %s de «Falla nueva» como %s (%s)', v_n, case when v_n = 1 then 'parada' else 'paradas' end, v_nombre, v_codigo),
    jsonb_build_object('paradas', to_jsonb(v_ids), 'tipo_nombre', v_p.tipo_nombre, 'sif', v_sif.codigo),
    jsonb_build_object('falla', p_falla_id, 'codigo', v_codigo, 'tipo_nombre', v_nombre)
  );

  -- La SIF de la «Falla nueva» pasa a la falla real (o se une con la que ya había abierta).
  if v_sif.id is not null then
    if v_sif.estado not in ('CERRADA', 'REVISADA') then
      select * into v_otra
      from solicitudes_intervencion s
      where s.linea_id = v_sif.linea_id and s.falla_id = p_falla_id and s.id <> v_sif.id
        and s.estado not in ('CERRADA', 'REVISADA')
      for update;
    end if;

    if v_otra.id is null then
      update solicitudes_intervencion set falla_id = p_falla_id, tipo_id = null where id = v_sif.id;
      perform registrar_auditoria(
        p_usuario, 'EDITAR', 'solicitudes_intervencion', v_sif.id::text, p_pagina,
        format('La solicitud %s pasó de «Falla nueva» a %s (%s)', v_sif.codigo, v_nombre, v_codigo),
        jsonb_build_object('falla_id', v_sif.falla_id),
        jsonb_build_object('falla_id', p_falla_id)
      );
    else
      v_unida := true;
      if rango_estado_sif(v_sif.estado) > rango_estado_sif(v_otra.estado)
         or (rango_estado_sif(v_sif.estado) = rango_estado_sif(v_otra.estado) and v_sif.generada_en < v_otra.generada_en) then
        v_queda := v_sif.id;
        v_sale := v_otra;
      else
        v_queda := v_otra.id;
        v_sale := v_sif;
      end if;

      update paradas set sif_id = v_queda where sif_id = v_sale.id;
      delete from solicitudes_intervencion where id = v_sale.id;
      if v_queda = v_sif.id then
        update solicitudes_intervencion set falla_id = p_falla_id, tipo_id = null where id = v_queda;
      end if;
      perform registrar_auditoria(
        p_usuario, 'ELIMINAR', 'solicitudes_intervencion', v_sale.id::text, p_pagina,
        format('La solicitud %s se unió a %s: las dos eran de %s (%s)', v_sale.codigo,
               (select codigo from solicitudes_intervencion where id = v_queda), v_nombre, v_codigo),
        to_jsonb(v_sale),
        jsonb_build_object('unida_a', v_queda)
      );

      -- Una Inspección que con las paradas sumadas llega a la cuenta de Intervención, sube.
      if (select estado from solicitudes_intervencion where id = v_queda) = 'INSPECCION' then
        select c.intervencion_en into v_int
        from config_sif_area((select area_id from lineas where id = v_sif.linea_id)) c;
        select count(*) into v_cuenta from paradas where sif_id = v_queda;
        if v_cuenta >= v_int then
          perform escalar_sif(v_queda, format('Al identificar la «Falla nueva» la falla suma %s: la inspección pasa a intervención.', v_cuenta));
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'paradas', v_n,
    'sif', (select codigo from solicitudes_intervencion where id = coalesce(v_queda, v_sif.id, (select sif_id from paradas where id = p_parada_id))),
    'unida', v_unida
  );
end;
$$;
grant execute on function identificar_falla_nueva(text, uuid, uuid, text) to anon, authenticated;
