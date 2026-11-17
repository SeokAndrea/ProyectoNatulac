-- ============================================================
-- Arreglo: Terminar parada de Mantenimiento con el catálogo nuevo
-- (2026-11-16)
-- ============================================================
-- 20261115590000 redefinió terminar_parada partiendo de la copia de
-- 20261113090000 (anterior al catálogo modular) y perdió dos cosas de
-- 20261113890000:
--   1. La condición «not catalogo_modular_area(...)»: con el catálogo nuevo
--      Mantenimiento ya no elige subsistema del catálogo viejo (la falla la
--      pone asignar_falla_parada), pero la función volvió a exigirlo y
--      fallaba con «Elige el subsistema (o «Sin subsistema»).».
--   2. exigir_usuario('terminar_parada', p_usuario).
-- Aquí se devuelven las dos; el resto queda como en 20261115590000
-- (flujo «por definir»).
-- ============================================================

create or replace function terminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_fin text default null,
  p_inicio text default null,
  p_pagina text default 'Reportes de paradas',
  p_mtto_equipo_codigo text default null,
  p_reparacion_min integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  v_usuario_id uuid;
  v_p paradas;
  v_tipo paradas_tipos;
  v_nombre text;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
  v_sub text := nullif(btrim(coalesce(p_subsistema_codigo, '')), '');
  v_mtto_eq mtto_equipos;
  v_de_mtto boolean := es_de_mantenimiento(p_usuario);
  v_sub_nombre text;
  v_cierre timestamptz;
  v_ini timestamptz;
  v_fin timestamptz;
  v_min integer;
  v_reparacion integer := p_reparacion_min;
begin
  perform public.exigir_usuario('terminar_parada', p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  -- Una pendiente (el +1 sin completar) se guarda con fin = inicio: se puede terminar.
  if v_p.fin is not null and not v_p.pendiente then
    raise exception 'Esa parada ya terminó.';
  end if;
  -- La dueña también (prueba en Pruebas, donde el interruptor está encendido).
  if la_termina_mantenimiento(p_parada_id) and not es_de_mantenimiento(p_usuario) and not es_dueno(p_usuario) then
    raise exception 'Esta parada la termina Mantenimiento.';
  end if;

  -- Flujo nuevo: por definir, solo Mantenimiento la termina (y al hacerlo queda suya);
  -- el supervisor primero la marca Operacional.
  if v_p.responsable = 'POR_DEFINIR' and not es_de_mantenimiento(p_usuario) and not es_dueno(p_usuario)
     then
    raise exception 'Marca la parada como Operacional antes de terminarla.';
  end if;

  -- El equipo y la falla de Producción son del supervisor: no se tocan. Solo se
  -- completan si la parada quedó con el tipo provisional (por clasificar).
  select * into v_tipo from paradas_tipos where id = v_p.tipo_id;
  if v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
    if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
      raise exception 'Elige el código de la parada del catálogo.';
    end if;
  elsif nullif(btrim(coalesce(p_tipo_codigo, '')), '') is not null and p_tipo_codigo is distinct from v_tipo.codigo then
    raise exception 'El equipo y la falla de Producción no se cambian.';
  end if;
  -- Lo de Mantenimiento: su equipo y su subsistema, de su catálogo. El supervisor
  -- (interruptor apagado) no los conoce: queda «Sin subsistema» y sin equipo.
  -- Con el catálogo nuevo (20261113890000) Mantenimiento no usa su catálogo viejo: la falla la pone asignar_falla_parada.
  if v_de_mtto and not catalogo_modular_area((select a.codigo from lineas l join areas a on a.id = l.area_id where l.id = v_p.linea_id)) then
    select * into v_mtto_eq from mtto_equipos where codigo = upper(nullif(btrim(coalesce(p_mtto_equipo_codigo, '')), '')) and activo;
    if v_sub is null then
      raise exception 'Elige el subsistema (o «Sin subsistema»).';
    end if;
    if v_mtto_eq.codigo is null then
      raise exception 'Elige el equipo de Mantenimiento.';
    end if;
  else
    v_sub := 'SIN_SUBSISTEMA';
  end if;
  if v_sub = 'SIN_SUBSISTEMA' then
    v_sub_nombre := 'Sin subsistema';
  else
    select nombre into v_sub_nombre from mtto_subsistemas where equipo_codigo = v_mtto_eq.codigo and codigo = v_sub and activo;
    if v_sub_nombre is null then
      raise exception 'Elige el subsistema de la lista.';
    end if;
  end if;
  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la parada.';
  end if;
  -- Tiempo de reparación: opcional, solo registro (la pantalla lo pide solo a Mantenimiento).
  if v_reparacion is not null and v_reparacion not between 1 and 43200 then
    raise exception 'El tiempo de reparación va en minutos (1 o más).';
  end if;
  if v_p.tipo_id is not distinct from v_tipo.id then
    v_nombre := v_p.tipo_nombre;
  else
    v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  end if;

  -- Lo cerrado queda fijo: si un turno cerrado ya contó un tramo, el comienzo
  -- no se toca y el fin no puede caer antes de su cierre.
  v_cierre := parada_cierre_turno_cerrado(p_parada_id);
  if v_cierre is not null then
    v_fin := hora_planta_a_timestamptz(p_fin, 'fin');
    if v_fin is null then
      raise exception 'La parada viene de un turno ya cerrado: pon la hora de fin.';
    end if;
    if v_fin < v_cierre then
      raise exception 'El fin no puede caer en un turno ya cerrado (cerró a las %).',
        to_char(v_cierre at time zone 'America/Caracas', 'DD/MM HH24:MI');
    end if;
    v_ini := v_p.inicio;
  else
    v_ini := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), v_p.inicio);
    v_fin := coalesce(hora_planta_a_timestamptz(p_fin, 'fin'), now());
    -- Los minutos mandan (dueña, 2026-10-27): el comienzo puede caer en un turno ya cerrado.
  end if;

  if v_ini > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_fin > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;
  if v_fin < v_ini then
    raise exception 'El fin no puede ser anterior al inicio.';
  end if;
  v_min := round(extract(epoch from (v_fin - v_ini)) / 60);

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      subsistema_codigo = left(v_sub, 40),
      subsistema_nombre = v_sub_nombre,
      mtto_equipo_codigo = v_mtto_eq.codigo,
      mtto_equipo_nombre = v_mtto_eq.nombre,
      solucion = left(v_solucion, 300),
      reparacion_min = v_reparacion,
      responsable = case when responsable = 'POR_DEFINIR' and v_de_mtto then 'MANTENIMIENTO' when responsable = 'POR_DEFINIR' then 'OPERACIONAL' else responsable end,
      inicio = v_ini,
      fin = v_fin,
      pendiente = false,
      terminada_por = v_usuario_id,
      terminada_en = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Terminó la parada de la %s como «%s» (%s min): %s',
           (select nombre from lineas where id = v_p.linea_id), v_nombre, v_min, v_solucion),
    jsonb_build_object('inicio', v_p.inicio, 'fin', null, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('inicio', v_ini, 'fin', v_fin, 'tipo', v_nombre, 'subsistema', v_sub,
                       'minutos', v_min, 'solucion', v_solucion, 'reparacion_min', v_reparacion)
  );
end;
$$;
grant execute on function terminar_parada(text, uuid, text, text, text, text, text, text, text, integer) to anon, authenticated;
