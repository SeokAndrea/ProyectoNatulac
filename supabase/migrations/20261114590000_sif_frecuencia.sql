-- ============================================================
-- SIF: frecuencia y ventana configurables por área
-- ============================================================
-- Hasta hoy (20261113890000): la misma falla en la misma línea, contada dentro
-- de la JORNADA, nace como Inspección a la 3.ª y sube a Intervención a la 4.ª.
-- Aprobado (dueña, 2026-11-01): por área de producción se configura
--   * la ventana en que se cuenta: TURNO | DIA (la de hoy) | SEMANA,
--   * a la cuántas veces nace la Inspección (inspeccion_en, 2 a 10) y
--   * a la cuántas sube a Intervención (intervencion_en, mayor que la
--     anterior y hasta 15).
-- Sin fila para un área = DIA, 3 y 4: se comporta EXACTAMENTE como hoy.
-- Aplica desde que se guarda: no recalcula solicitudes que ya existen.
--
-- Ventanas (función ventana_sif):
--   DIA     inicio_jornada_planta(instante) → +1 día (como hoy).
--   SEMANA  del lunes 7:00 (hora de planta) de la semana de la jornada del
--           instante → +7 días. Se toma la jornada (no el reloj) para que
--           el domingo a las 3:00 cuente como domingo, no como lunes.
--   TURNO   1) el turno REAL del área que contiene el instante, con la
--              misma ventana que ya usan Paradas, Panel y el reporte
--              (ventana_paradas_turno: su hora oficial de inicio, y el fin
--              donde empieza el siguiente). Si está abierto, termina en su
--              hora oficial de fin (o sin fin si es 12x12 sin horario).
--           2) si no hay turno real (fin de semana, parada anotada con
--              hora pasada, base vacía): el turno TEÓRICO según el esquema
--              que tenía el área en ese momento. 3x8: 7:00-15:00, 15:00-
--              22:30, 22:30-7:00. 12x12: 7:00-19:00 y 19:00-7:00.
--
-- Permiso nuevo SIF_CONFIGURAR (tema MANTENIMIENTO) para el Jefe de
-- Mantenimiento; el Super Administrador lo tiene por ser todo.
-- ============================================================

-- ------------------------------------------------------------
-- Tabla de configuración
-- ------------------------------------------------------------
create table if not exists sif_config (
  area_id uuid primary key references areas (id),
  ventana text not null default 'DIA' check (ventana in ('TURNO', 'DIA', 'SEMANA')),
  inspeccion_en integer not null default 3 check (inspeccion_en between 2 and 10),
  intervencion_en integer not null default 4 check (intervencion_en between 3 and 15),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references usuarios (id),
  check (inspeccion_en < intervencion_en)
);
alter table sif_config enable row level security;
comment on table sif_config is 'Frecuencia de las SIF por área de producción: ventana, inspección a la N.ª e intervención a la M.ª (20261114590000). Sin fila = DIA, 3 y 4.';

-- ------------------------------------------------------------
-- Permiso
-- ------------------------------------------------------------
insert into permisos (codigo, nombre, tema)
values ('SIF_CONFIGURAR', 'Configurar las SIF (frecuencia)', 'MANTENIMIENTO')
on conflict (codigo) do nothing;

insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, 'SIF_CONFIGURAR' from puestos p where p.codigo = 'JEFE_MANTENIMIENTO'
on conflict do nothing;

-- ------------------------------------------------------------
-- Ayudas internas (no se exponen)
-- ------------------------------------------------------------
-- La configuración de un área, con los valores por defecto si no tiene fila.
create or replace function config_sif_area(p_area_id uuid)
returns table (ventana text, inspeccion_en integer, intervencion_en integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.ventana, 'DIA'), coalesce(c.inspeccion_en, 3), coalesce(c.intervencion_en, 4)
  from (select 1) x
  left join sif_config c on c.area_id = p_area_id;
$$;
revoke execute on function config_sif_area(uuid) from public, anon, authenticated;

-- «en el turno» / «en la jornada» / «en la semana», para los motivos de los correos.
create or replace function texto_ventana_sif(p_ventana text)
returns text
language sql
immutable
as $$
  select case p_ventana when 'TURNO' then 'el turno' when 'SEMANA' then 'la semana' else 'la jornada' end;
$$;
revoke execute on function texto_ventana_sif(text) from public, anon, authenticated;

/*
 * La ventana en que se cuentan las repeticiones de una falla en un área que
 * contiene ese instante (ver el encabezado). Devuelve siempre una fila.
 */
create or replace function ventana_sif(p_area_id uuid, p_instante timestamptz)
returns table (desde timestamptz, hasta timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ventana text;
  v_jornada timestamptz := inicio_jornada_planta(p_instante);
  v_dia date;
  v_lunes date;
  v_d timestamptz;
  v_h timestamptz;
  v_esquema text;
  v_local timestamp;
  v_rel interval;
  v_base timestamp;
  v_lo interval;
  v_hi interval;
begin
  select c.ventana into v_ventana from config_sif_area(p_area_id) c;

  if v_ventana = 'SEMANA' then
    v_dia := (v_jornada at time zone 'America/Caracas')::date;
    v_lunes := v_dia - (extract(isodow from v_dia)::integer - 1);
    desde := (v_lunes::timestamp + interval '7 hours') at time zone 'America/Caracas';
    hasta := ((v_lunes + 7)::timestamp + interval '7 hours') at time zone 'America/Caracas';
    return next;
    return;
  end if;

  if v_ventana = 'TURNO' then
    -- 1. El turno real del área que contiene el instante (el más reciente si hubiera dos).
    select r.d, r.h into v_d, v_h
    from (
      select v.desde as d,
             case when tu.estado = 'ABIERTO'
                  then coalesce(((tu.fecha + case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end) + tt.hora_fin)
                                  at time zone 'America/Caracas', 'infinity'::timestamptz)
                  else v.hasta end as h,
             tu.created_at
      from turnos tu
      join turno_tipos tt on tt.id = tu.turno_tipo_id
      cross join lateral ventana_paradas_turno(tu.id) v
      where tu.area_id = p_area_id
        and tu.fecha between (v_jornada at time zone 'America/Caracas')::date - 2
                         and (v_jornada at time zone 'America/Caracas')::date + 2
    ) r
    where r.d <= p_instante and p_instante < r.h
    order by r.created_at desc
    limit 1;
    if v_d is not null then
      desde := v_d;
      hasta := v_h;
      return next;
      return;
    end if;

    -- 2. Sin turno real: el teórico del esquema que tenía el área en ese momento.
    if exists (select 1 from esquema_turnos_historial e where e.area_id = p_area_id) then
      select coalesce((select e.esquema from esquema_turnos_historial e
                       where e.area_id = p_area_id and e.cambiado_en <= p_instante
                       order by e.cambiado_en desc limit 1), '3x8') into v_esquema;
    else
      select a.esquema_turnos into v_esquema from areas a where a.id = p_area_id;
    end if;
    v_local := p_instante at time zone 'America/Caracas';
    v_base := (v_jornada at time zone 'America/Caracas');          -- 7:00 de la jornada
    v_rel := v_local - v_base;                                      -- 0 a 24 h dentro de la jornada
    if coalesce(v_esquema, '3x8') = '12x12' then
      v_lo := case when v_rel < interval '12 hours' then interval '0' else interval '12 hours' end;
      v_hi := case when v_rel < interval '12 hours' then interval '12 hours' else interval '24 hours' end;
    else
      v_lo := case when v_rel < interval '8 hours' then interval '0'
                   when v_rel < interval '15 hours 30 minutes' then interval '8 hours'
                   else interval '15 hours 30 minutes' end;
      v_hi := case when v_rel < interval '8 hours' then interval '8 hours'
                   when v_rel < interval '15 hours 30 minutes' then interval '15 hours 30 minutes'
                   else interval '24 hours' end;
    end if;
    desde := (v_base + v_lo) at time zone 'America/Caracas';
    hasta := (v_base + v_hi) at time zone 'America/Caracas';
    return next;
    return;
  end if;

  -- DIA: la jornada de hoy.
  desde := v_jornada;
  hasta := v_jornada + interval '1 day';
  return next;
end;
$$;
revoke execute on function ventana_sif(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- El trigger: igual que el de 20261113890000, con umbrales y ventana del área
-- ------------------------------------------------------------
create or replace function fn_paradas_sif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falla uuid := coalesce(new.falla_final_id, new.falla_produccion_id);
  v_area uuid;
  v_ventana text;
  v_ins integer;
  v_int integer;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_jornada timestamptz;
  v_abierta uuid;
  v_estado text;
  v_revisada uuid;
  v_previas integer;
  v_sif uuid;
begin
  if new.sif_id is not null then
    return new;
  end if;
  if v_falla is not null then
    if not exists (select 1 from catalogo_fallas f where f.id = v_falla and f.clase = 'NO_PROGRAMADA') then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtext('sif_' || new.linea_id::text || '_f_' || v_falla::text));
  elsif new.tipo_id is null or not tipo_cuenta_para_sif(new.tipo_id) then
    return new;
  else
    perform pg_advisory_xact_lock(hashtext('sif_' || new.linea_id::text || '_' || new.tipo_id::text));
  end if;

  select l.area_id into v_area from lineas l where l.id = new.linea_id;
  select c.ventana, c.inspeccion_en, c.intervencion_en into v_ventana, v_ins, v_int from config_sif_area(v_area) c;

  -- 1. Abierta: se suma a su historial. Una Inspección sube con la repetición de Intervención.
  select s.id, s.estado into v_abierta, v_estado
  from solicitudes_intervencion s
  where s.linea_id = new.linea_id and s.estado not in ('CERRADA', 'REVISADA')
    and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end);
  if v_abierta is not null then
    new.sif_id := v_abierta;
    if v_estado = 'INSPECCION'
       and (select count(*) from paradas p where p.sif_id = v_abierta and p.id is distinct from new.id) + 1 >= v_int then
      perform escalar_sif(v_abierta, format('La falla llegó a la %s.ª: la inspección pasa a intervención.',
        (select count(*) from paradas p where p.sif_id = v_abierta and p.id is distinct from new.id) + 1));
    end if;
    return new;
  end if;

  select w.desde, w.hasta into v_desde, v_hasta from ventana_sif(v_area, new.inicio) w;
  v_jornada := inicio_jornada_planta(new.inicio);

  -- 2. Inspección de esta ventana (o revisada en ella) ya revisada y la falla volvió: sube a Intervención.
  --    Por jornada o semana se mira también la jornada de la solicitud; por turno, solo cuándo se revisó.
  select s.id into v_revisada
  from solicitudes_intervencion s
  where s.linea_id = new.linea_id and s.estado = 'REVISADA'
    and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end)
    and ((v_ventana <> 'TURNO'
          and s.fecha_jornada >= (v_desde at time zone 'America/Caracas')::date
          and s.fecha_jornada < (v_hasta at time zone 'America/Caracas')::date)
         or (s.revisada_en >= v_desde and s.revisada_en < v_hasta))
  order by s.revisada_en desc
  limit 1;
  if v_revisada is not null then
    new.sif_id := v_revisada;
    perform escalar_sif(v_revisada, 'La falla volvió después de la inspección: pasa a intervención.');
    return new;
  end if;

  -- 3. Intervención cerrada en esta ventana y la falla volvió: una sola alcanza.
  if exists (
    select 1 from solicitudes_intervencion s
    where s.linea_id = new.linea_id and s.estado = 'CERRADA'
      and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end)
      and s.cierre >= v_desde and s.cierre < v_hasta and s.cierre <= new.inicio
  ) then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_falla, v_jornada, 'PENDIENTE');
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, 'La falla volvió después de cerrar la intervención anterior.');
    return new;
  end if;

  -- 4. La N.ª de la ventana sin solicitud: nace la Inspección y se le suman las anteriores.
  select count(*) into v_previas
  from paradas p
  where p.linea_id = new.linea_id and p.sif_id is null
    and (case when v_falla is not null then coalesce(p.falla_final_id, p.falla_produccion_id) = v_falla
              else p.tipo_id = new.tipo_id and coalesce(p.falla_final_id, p.falla_produccion_id) is null end)
    and p.inicio >= v_desde and p.inicio < v_hasta
    and p.id is distinct from new.id;
  if v_previas + 1 >= v_ins then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_falla, v_jornada, 'INSPECCION');
    update paradas p
    set sif_id = v_sif
    where p.linea_id = new.linea_id and p.sif_id is null
      and (case when v_falla is not null then coalesce(p.falla_final_id, p.falla_produccion_id) = v_falla
                else p.tipo_id = new.tipo_id and coalesce(p.falla_final_id, p.falla_produccion_id) is null end)
      and p.inicio >= v_desde and p.inicio < v_hasta
      and p.id is distinct from new.id;
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, format('La misma falla se repitió %s veces en %s: hay que inspeccionar.',
      v_previas + 1, texto_ventana_sif(v_ventana)));
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- El correo dice la regla del área
-- ------------------------------------------------------------
create or replace function encolar_correo_sif(p_sif_id uuid, p_motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into correos_pendientes (asunto, cuerpo, enlace)
  select
    case when a.codigo = 'PRUEBAS' then '[Pruebas] ' else '' end
      || case when s.estado = 'INSPECCION' then 'Solicitud de Inspección ' else 'Solicitud de Intervención ' end
      || s.codigo || ' · ' || l.nombre || ' · ' || coalesce(f.nombre, t.nombre),
    concat_ws(E'\n',
      p_motivo,
      '',
      'Línea: ' || l.nombre || ' (' || a.nombre || ')',
      'Falla: ' || coalesce(f.nombre || ' · ' || u.nombre, t.nombre) || ' (' || coalesce(codigo_falla(f.id), t.codigo) || ')',
      'Equipo: ' || coalesce(ce.nombre, e.nombre, '—'),
      'Generada: ' || to_char(s.generada_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
      'Regla del área: inspección a la ' || cfg.inspeccion_en || '.ª vez e intervención a la ' || cfg.intervencion_en
        || '.ª, contadas por ' || case cfg.ventana when 'TURNO' then 'turno' when 'SEMANA' then 'semana' else 'jornada' end || '.'),
    '/solicitudes-intervencion?sif=' || s.id
  from solicitudes_intervencion s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  cross join lateral config_sif_area(a.id) cfg
  left join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  left join catalogo_fallas f on f.id = s.falla_id
  left join catalogo_subsistemas u on u.id = f.subsistema_id
  left join catalogo_sistemas cs on cs.id = u.sistema_id
  left join catalogo_equipos ce on ce.id = cs.equipo_id
  where s.id = p_sif_id;
$$;

-- ------------------------------------------------------------
-- RPC: leer y guardar
-- ------------------------------------------------------------
-- Cualquiera que pueda ver las SIF.
create or replace function leer_config_sif(p_usuario text, p_area text)
returns table (ventana text, inspeccion_en integer, intervencion_en integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area uuid;
begin
  perform public.exigir_usuario('leer_config_sif', p_usuario);
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;
  select a.id into v_area from areas a where a.codigo = p_area and a.tipo = 'PRODUCCION';
  if v_area is null then
    raise exception 'Esa área no existe o no es de producción.';
  end if;
  return query select c.ventana, c.inspeccion_en, c.intervencion_en from config_sif_area(v_area) c;
end;
$$;
grant execute on function leer_config_sif(text, text) to anon, authenticated;

create or replace function guardar_config_sif(
  p_usuario text,
  p_area text,
  p_ventana text,
  p_inspeccion_en integer,
  p_intervencion_en integer,
  p_pagina text default 'Solicitudes de Intervención'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
  v_antes record;
  v_usuario uuid;
begin
  perform public.exigir_usuario('guardar_config_sif', p_usuario);
  if not tiene_permiso(p_usuario, 'SIF_CONFIGURAR') then
    raise exception 'No tienes permiso para configurar las SIF.';
  end if;
  select a.id into v_area from areas a where a.codigo = p_area and a.tipo = 'PRODUCCION';
  if v_area is null then
    raise exception 'Esa área no existe o no es de producción.';
  end if;
  if p_ventana is null or p_ventana not in ('TURNO', 'DIA', 'SEMANA') then
    raise exception 'Elige si se cuenta por turno, por día o por semana.';
  end if;
  if p_inspeccion_en is null or p_inspeccion_en < 2 or p_inspeccion_en > 10 then
    raise exception 'La inspección tiene que ser entre la 2.ª y la 10.ª vez.';
  end if;
  if p_intervencion_en is null or p_intervencion_en <= p_inspeccion_en then
    raise exception 'La intervención tiene que ser después de la inspección (más veces que ella).';
  end if;
  if p_intervencion_en > 15 then
    raise exception 'La intervención puede ser hasta la 15.ª vez.';
  end if;

  select c.ventana, c.inspeccion_en, c.intervencion_en into v_antes from config_sif_area(v_area) c;
  select u.id into v_usuario from usuarios u where u.usuario = lower(p_usuario);

  insert into sif_config (area_id, ventana, inspeccion_en, intervencion_en, actualizado_en, actualizado_por)
  values (v_area, p_ventana, p_inspeccion_en, p_intervencion_en, now(), v_usuario)
  on conflict (area_id) do update
    set ventana = excluded.ventana,
        inspeccion_en = excluded.inspeccion_en,
        intervencion_en = excluded.intervencion_en,
        actualizado_en = now(),
        actualizado_por = v_usuario;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'sif_config', v_area::text, coalesce(p_pagina, 'Solicitudes de Intervención'),
    format('Cambió la frecuencia de las SIF en %s: inspección a la %s.ª e intervención a la %s.ª, por %s',
           p_area, p_inspeccion_en, p_intervencion_en,
           case p_ventana when 'TURNO' then 'turno' when 'SEMANA' then 'semana' else 'día' end),
    jsonb_build_object('ventana', v_antes.ventana, 'inspeccion_en', v_antes.inspeccion_en, 'intervencion_en', v_antes.intervencion_en),
    jsonb_build_object('ventana', p_ventana, 'inspeccion_en', p_inspeccion_en, 'intervencion_en', p_intervencion_en)
  );
end;
$$;
grant execute on function guardar_config_sif(text, text, text, integer, integer, text) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
