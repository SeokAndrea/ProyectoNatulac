-- ============================================================
-- PARADAS DE MANTENIMIENTO: se registran EN LA APP (dueño, 2026-09-21)
-- ============================================================
-- Mantenimiento no lleva su propio sistema: hace el mismo proceso que los
-- supervisores, con el mismo catálogo y códigos, pero por línea y con hora real
-- de inicio y fin (puede quedar EN CURSO y durar más de un turno).
--   * paradas.origen gana 'MANTENIMIENTO'. No pertenecen a un turno (turno_id
--     null): a cada turno le tocan los minutos que se solapan con su ventana.
--   * registrar_parada_mantenimiento / cerrar_parada_mantenimiento /
--     eliminar_parada_mantenimiento (con Auditoría).
--   * Se retira la sincronización con el Google Sheet (20261065/66): ya no hace
--     falta y dejaba abierta una función que inserta paradas.
-- ============================================================

alter table paradas drop constraint if exists paradas_origen_check;
alter table paradas add constraint paradas_origen_check check (origen in ('MANUAL', 'SHEET', 'MANTENIMIENTO'));

-- ------------------------------------------------------------
-- Paradas de UN turno: las manuales (por turno_id) y las que no pertenecen a un
-- turno (Mantenimiento) de las líneas del área que se solapan con su ventana,
-- recortadas a ella. Una parada en curso de un turno abierto sigue con fin null.
-- ------------------------------------------------------------
create or replace function paradas_efectivas_turno(p_turno_id uuid)
returns table (
  id uuid,
  linea_id uuid,
  clase text,
  origen text,
  tipo_id uuid,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio timestamptz,
  fin timestamptz,
  creado_por uuid
)
language sql
security definer
set search_path = public
stable
as $$
  with t as (
    select tu.id, tu.area_id, tu.estado,
           ((tu.fecha + tu.hora_inicio) at time zone 'America/Caracas') as desde,
           case
             when tu.estado = 'CERRADO' and tu.fecha_fin is not null and tu.hora_fin is not null
               then ((tu.fecha_fin + tu.hora_fin) at time zone 'America/Caracas')
             else now()
           end as hasta
    from turnos tu
    where tu.id = p_turno_id
  )
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio, p.inicio, p.fin, p.creado_por
  from paradas p
  where p.turno_id = p_turno_id
  union all
  select p.id, p.linea_id, p.clase, p.origen, p.tipo_id, p.tipo_nombre, p.tiempo_guia_min, p.nota,
         p.justificacion_desvio,
         greatest(p.inicio, t.desde),
         case
           when t.estado = 'ABIERTO' then (case when p.fin is null then null else least(p.fin, t.hasta) end)
           else least(coalesce(p.fin, t.hasta), t.hasta)
         end,
         p.creado_por
  from t
  join lineas l on l.area_id = t.area_id
  join paradas p on p.linea_id = l.id
                and p.turno_id is null
                and p.origen in ('SHEET', 'MANTENIMIENTO')
                and p.inicio < t.hasta
                and coalesce(p.fin, t.hasta) > t.desde;
$$;

grant execute on function paradas_efectivas_turno(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- Permiso común: el área MANTENIMIENTO (y el Área de Pruebas y el
-- SUPERADMINISTRADOR, para probar). Devuelve el área donde se registra:
-- ASEPTICO (o PRUEBAS si quien usa es de Pruebas).
-- ------------------------------------------------------------
create or replace function area_de_paradas_mantenimiento(p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not (v_area in ('MANTENIMIENTO', 'PRUEBAS') or v_rol = 'SUPERADMINISTRADOR') then
    raise exception 'Solo el área de Mantenimiento puede registrar estas paradas.';
  end if;
  select a.id into v_area_id from areas a where a.codigo = case when v_area = 'PRUEBAS' then 'PRUEBAS' else 'ASEPTICO' end;
  return v_area_id;
end;
$$;

grant execute on function area_de_paradas_mantenimiento(text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_parada_mantenimiento(): p_inicio / p_fin en hora de planta
-- ('YYYY-MM-DDTHH:MM:SS'). Sin fin = en curso. El tipo tiene que existir en la
-- línea (y en la presentación que corre ahora), igual que para el supervisor.
-- ------------------------------------------------------------
create or replace function registrar_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_inicio text,
  p_fin text default null,
  p_nota text default null,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_ini timestamptz;
  v_fin timestamptz;
  v_nombre text;
  v_guia numeric;
  v_pres integer;
  v_turno_id uuid;
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_area_id and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if not found or not v_tipo.activo then
    raise exception 'El tipo de parada no existe o está desactivado.';
  end if;
  if v_tipo.clase = 'OCIOSO' then
    raise exception 'El tiempo ocioso no lo registra Mantenimiento.';
  end if;

  begin
    v_ini := (p_inicio::timestamp) at time zone 'America/Caracas';
  exception when others then
    raise exception 'La hora de inicio no es válida.';
  end;
  if v_ini > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if coalesce(trim(p_fin), '') <> '' then
    begin
      v_fin := (p_fin::timestamp) at time zone 'America/Caracas';
    exception when others then
      raise exception 'La hora de fin no es válida.';
    end;
    if v_fin < v_ini then
      raise exception 'El fin no puede ser anterior al inicio.';
    end if;
    if v_fin > now() + interval '1 minute' then
      raise exception 'La hora de fin no puede estar en el futuro.';
    end if;
  end if;
  if coalesce(v_fin, now()) - v_ini > interval '30 days' then
    raise exception 'La parada no puede durar más de 30 días.';
  end if;

  -- Presentación (ml) que corre ahora en esa línea (turno abierto del área); sin corrida no se filtra.
  select tu.id into v_turno_id
  from turnos tu
  where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
  order by tu.fecha desc, tu.hora_inicio desc
  limit 1;
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = v_turno_id and tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  v_nombre := v_tipo.nombre;
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  if v_area is distinct from 'PRUEBAS' then
    if exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_area_id
       )
       and not exists (
         select 1 from paradas_tipos_lineas
         where tipo_id = v_tipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa parada no aplica a esta línea.';
    end if;
  end if;

  if v_tipo.equipo_id is not null then
    select * into v_equipo from paradas_equipos where id = v_tipo.equipo_id;
    if not v_equipo.activo then
      raise exception 'Ese equipo está desactivado.';
    end if;
    if v_area is distinct from 'PRUEBAS'
       and not exists (
         select 1 from paradas_equipos_lineas
         where equipo_id = v_equipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa falla no aplica a esta línea.';
    end if;
    v_nombre := v_equipo.nombre || ' · ' || v_tipo.nombre;
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, creado_por)
  values (null, v_linea_id, v_tipo.id, v_tipo.clase, 'MANTENIMIENTO', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''), v_ini, v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Mantenimiento registró la parada «%s» en %s%s', v_nombre,
           (select nombre from lineas where id = v_linea_id), case when v_fin is null then ' (en curso)' else '' end),
    null,
    jsonb_build_object('origen', 'MANTENIMIENTO', 'linea_id', v_linea_id, 'clase', v_tipo.clase, 'tipo', v_nombre,
                       'inicio', p_inicio, 'fin', p_fin, 'nota', p_nota)
  );

  return v_id;
end;
$$;

grant execute on function registrar_parada_mantenimiento(text, text, text, text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- cerrar_parada_mantenimiento(): pone el fin a una parada en curso (por defecto, ahora).
-- ------------------------------------------------------------
create or replace function cerrar_parada_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_fin text default null,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
  v_fin timestamptz;
begin
  select * into v_p from paradas where id = p_parada_id and origen = 'MANTENIMIENTO';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.fin is not null then
    raise exception 'La parada ya estaba cerrada.';
  end if;

  if coalesce(trim(p_fin), '') = '' then
    v_fin := now();
  else
    begin
      v_fin := (p_fin::timestamp) at time zone 'America/Caracas';
    exception when others then
      raise exception 'La hora de fin no es válida.';
    end;
  end if;
  if v_fin < v_p.inicio then
    raise exception 'El fin no puede ser anterior al inicio.';
  end if;
  if v_fin > now() + interval '1 minute' then
    raise exception 'La hora de fin no puede estar en el futuro.';
  end if;

  update paradas set fin = v_fin where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Mantenimiento cerró la parada «%s» (%s min)', v_p.tipo_nombre,
           round(extract(epoch from (v_fin - v_p.inicio)) / 60)),
    jsonb_build_object('fin', null),
    jsonb_build_object('fin', v_fin)
  );
end;
$$;

grant execute on function cerrar_parada_mantenimiento(text, uuid, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- eliminar_parada_mantenimiento(): para corregir un error de carga (queda en Auditoría).
-- ------------------------------------------------------------
create or replace function eliminar_parada_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
begin
  select * into v_p from paradas where id = p_parada_id and origen = 'MANTENIMIENTO';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;

  delete from paradas where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'paradas', p_parada_id::text, p_pagina,
    format('Mantenimiento eliminó la parada «%s»', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'linea_id', v_p.linea_id, 'inicio', v_p.inicio, 'fin', v_p.fin, 'nota', v_p.nota),
    null
  );
end;
$$;

grant execute on function eliminar_parada_mantenimiento(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Se retira la sincronización con el Google Sheet y sus ajustes.
-- ------------------------------------------------------------
drop function if exists sincronizar_paradas_mantenimiento(text, jsonb);
drop function if exists guardar_configuracion(text, text, text, text);
drop function if exists obtener_configuracion(text);
drop table if exists configuracion_app;
