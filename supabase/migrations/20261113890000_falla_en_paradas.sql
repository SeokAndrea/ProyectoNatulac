-- ============================================================
-- FALLAS DEL CATÁLOGO MODULAR EN LAS PARADAS (fase 2)
-- ============================================================
-- Spec: docs/superpowers/specs/2026-10-31-catalogo-fallas-modular-design.md
-- Con el switch del área encendido (20261113790000) una parada de equipo:
--   * se registra con el tipo genérico FALLA_EQUIPO (así Parar, Anotar,
--     Terminar y Clasificar siguen igual por dentro), y
--   * después asignar_falla_parada() le pone la falla: la que dijo
--     Producción (falla_produccion_id) o la que confirmó Mantenimiento
--     (falla_final_id). También copia su nombre a tipo_nombre (lo que ya
--     muestran todas las listas) y su clase (la eficiencia).
-- La SIF cuenta por línea + falla (la final, o la de Producción mientras no
-- hay final) y FALLA_EQUIPO solo no cuenta nunca: si contara, fallas
-- distintas se sumarían como una. Empieza de cero el día del switch
-- (dueña, 2026-10-31): no hay equivalencias con el catálogo anterior.
-- ============================================================

insert into paradas_tipos (codigo, nombre, clase, familia, prefijo_planilla, secuencia_planilla, codigo_con_linea, activo, orden)
values ('FALLA_EQUIPO', 'Falla de equipo', 'NO_PROGRAMADA', 'EQUIPO', '', null, false, true, 902)
on conflict (codigo) do nothing;

-- El genérico no cuenta para la SIF (la cuenta va por la falla).
create or replace function tipo_cuenta_para_sif(p_tipo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select t.clase = 'NO_PROGRAMADA'
       and t.familia not in ('PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'OCIOSO')
       and t.codigo not in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR', 'FALLA_EQUIPO')
    from paradas_tipos t
    where t.id = p_tipo_id
  ), false);
$$;

-- ------------------------------------------------------------
-- Solicitudes por falla
-- ------------------------------------------------------------
alter table solicitudes_intervencion add column if not exists falla_id uuid references catalogo_fallas (id);
alter table solicitudes_intervencion alter column tipo_id drop not null;
alter table solicitudes_intervencion drop constraint if exists solicitudes_intervencion_tipo_o_falla;
alter table solicitudes_intervencion add constraint solicitudes_intervencion_tipo_o_falla check (tipo_id is not null or falla_id is not null);
create unique index if not exists solicitudes_intervencion_una_abierta_falla_uidx
  on solicitudes_intervencion (linea_id, falla_id) where estado not in ('CERRADA', 'REVISADA') and falla_id is not null;
comment on column solicitudes_intervencion.falla_id is 'Falla del catálogo modular (desde el switch); las anteriores van por tipo_id (20261113890000).';

create or replace function crear_sif(p_linea_id uuid, p_tipo_id uuid, p_falla_id uuid, p_inicio_jornada timestamptz, p_estado text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := (p_inicio_jornada at time zone 'America/Caracas')::date;
  v_numero integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sif_numero_' || v_fecha::text));
  select coalesce(max(numero), 0) + 1 into v_numero from solicitudes_intervencion where fecha_jornada = v_fecha;
  -- escalada_en queda null: solo la pone escalar_sif (así se sabe que pasó por Inspección).
  insert into solicitudes_intervencion (codigo, fecha_jornada, numero, linea_id, tipo_id, falla_id, estado)
  values ('SIF' || to_char(v_fecha, 'YYYYMMDD') || '_' || v_numero, v_fecha, v_numero, p_linea_id,
          case when p_falla_id is null then p_tipo_id end, p_falla_id, p_estado)
  returning id into v_id;
  return v_id;
end;
$$;

-- La de antes (por tipo) sigue existiendo para quien la llame.
create or replace function crear_sif(p_linea_id uuid, p_tipo_id uuid, p_inicio_jornada timestamptz, p_estado text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select crear_sif(p_linea_id, p_tipo_id, null::uuid, p_inicio_jornada, p_estado);
$$;

/*
 * Igual que la de 20261111690000 (3.ª en la jornada = Inspección, 4.ª =
 * Intervención, vuelve tras revisar o cerrar = Intervención), pero la falla
 * se reconoce por la falla del catálogo modular si la parada la tiene, y si
 * no por su tipo como siempre.
 */
create or replace function fn_paradas_sif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falla uuid := coalesce(new.falla_final_id, new.falla_produccion_id);
  v_desde timestamptz;
  v_hasta timestamptz;
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

  -- 1. Abierta: se suma a su historial. Una Inspección sube con la 4.ª falla.
  select s.id, s.estado into v_abierta, v_estado
  from solicitudes_intervencion s
  where s.linea_id = new.linea_id and s.estado not in ('CERRADA', 'REVISADA')
    and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end);
  if v_abierta is not null then
    new.sif_id := v_abierta;
    if v_estado = 'INSPECCION'
       and (select count(*) from paradas p where p.sif_id = v_abierta and p.id is distinct from new.id) + 1 >= 4 then
      perform escalar_sif(v_abierta, 'La falla llegó a la 4.ª: la inspección pasa a intervención.');
    end if;
    return new;
  end if;

  v_desde := inicio_jornada_planta(new.inicio);
  v_hasta := v_desde + interval '1 day';

  -- 2. Inspección de esta jornada (o revisada en ella) ya revisada y la falla volvió: sube a Intervención.
  select s.id into v_revisada
  from solicitudes_intervencion s
  where s.linea_id = new.linea_id and s.estado = 'REVISADA'
    and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end)
    and (s.fecha_jornada = (v_desde at time zone 'America/Caracas')::date
         or (s.revisada_en >= v_desde and s.revisada_en < v_hasta))
  order by s.revisada_en desc
  limit 1;
  if v_revisada is not null then
    new.sif_id := v_revisada;
    perform escalar_sif(v_revisada, 'La falla volvió después de la inspección: pasa a intervención.');
    return new;
  end if;

  -- 3. Intervención cerrada en esta jornada y la falla volvió: una sola alcanza.
  if exists (
    select 1 from solicitudes_intervencion s
    where s.linea_id = new.linea_id and s.estado = 'CERRADA'
      and (case when v_falla is not null then s.falla_id = v_falla else s.tipo_id = new.tipo_id and s.falla_id is null end)
      and s.cierre >= v_desde and s.cierre < v_hasta and s.cierre <= new.inicio
  ) then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_falla, v_desde, 'PENDIENTE');
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, 'La falla volvió después de cerrar la intervención anterior.');
    return new;
  end if;

  -- 4. Tercera del día sin solicitud: nace la Inspección y se le suman las anteriores.
  select count(*) into v_previas
  from paradas p
  where p.linea_id = new.linea_id and p.sif_id is null
    and (case when v_falla is not null then coalesce(p.falla_final_id, p.falla_produccion_id) = v_falla
              else p.tipo_id = new.tipo_id and coalesce(p.falla_final_id, p.falla_produccion_id) is null end)
    and p.inicio >= v_desde and p.inicio < v_hasta
    and p.id is distinct from new.id;
  if v_previas + 1 >= 3 then
    v_sif := crear_sif(new.linea_id, new.tipo_id, v_falla, v_desde, 'INSPECCION');
    update paradas p
    set sif_id = v_sif
    where p.linea_id = new.linea_id and p.sif_id is null
      and (case when v_falla is not null then coalesce(p.falla_final_id, p.falla_produccion_id) = v_falla
                else p.tipo_id = new.tipo_id and coalesce(p.falla_final_id, p.falla_produccion_id) is null end)
      and p.inicio >= v_desde and p.inicio < v_hasta
      and p.id is distinct from new.id;
    new.sif_id := v_sif;
    perform encolar_correo_sif(v_sif, 'La misma falla se repitió 3 veces en la jornada: hay que inspeccionar.');
  end if;
  return new;
end;
$$;

-- La falla llega en un segundo paso (asignar_falla_parada): el trigger también mira esas columnas.
drop trigger if exists trg_paradas_sif on paradas;
create trigger trg_paradas_sif
  before insert or update of tipo_id, linea_id, inicio, falla_produccion_id, falla_final_id on paradas
  for each row execute function fn_paradas_sif();

-- ------------------------------------------------------------
-- Lo que se muestra de una solicitud: la falla nueva si la tiene.
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
      'Generada: ' || to_char(s.generada_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI')),
    '/solicitudes-intervencion?sif=' || s.id
  from solicitudes_intervencion s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  left join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  left join catalogo_fallas f on f.id = s.falla_id
  left join catalogo_subsistemas u on u.id = f.subsistema_id
  left join catalogo_sistemas cs on cs.id = u.sistema_id
  left join catalogo_equipos ce on ce.id = cs.equipo_id
  where s.id = p_sif_id;
$$;

create or replace function listar_sif(p_usuario text, p_cerradas integer default 100)
returns table (sif_id uuid, codigo text, fecha_jornada date, estado text, generada_en timestamptz, escalada_en timestamptz,
               revisada_en timestamptz, revisada_por text, revision text, responsable text, inicio_reparacion timestamptz,
               trabajo_realizado text, entregada_a text, cierre timestamptz, linea_codigo text, linea_nombre text,
               area_codigo text, area_nombre text, tipo_codigo text, tipo_nombre text, equipo_nombre text, fallas integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
begin
  perform public.exigir_usuario('listar_sif', p_usuario);
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;
  -- Todo calificado: las columnas de salida (estado, cierre, area_codigo…) se llaman igual que las de las tablas.
  select r.area_codigo into v_area from rol_y_area_de(p_usuario) r;

  return query
  with visibles as (
    select si.*
    from solicitudes_intervencion si
    join lineas li on li.id = si.linea_id
    join areas ar on ar.id = li.area_id
    where (ar.codigo <> 'PRUEBAS' or v_area = 'PRUEBAS')
  ),
  elegidas as (
    select v.* from visibles v where v.estado not in ('CERRADA', 'REVISADA')
    union all
    (select v.* from visibles v where v.estado in ('CERRADA', 'REVISADA')
     order by coalesce(v.cierre, v.revisada_en) desc limit p_cerradas)
  )
  select s.id, s.codigo, s.fecha_jornada, s.estado, s.generada_en, s.escalada_en,
         s.revisada_en, coalesce(ur.nombre, ur.usuario), s.revision,
         s.responsable, s.inicio_reparacion, s.trabajo_realizado, s.entregada_a, s.cierre,
         l.codigo, l.nombre, a.codigo, a.nombre,
         coalesce(codigo_falla(f.id), t.codigo),
         coalesce(f.nombre || ' · ' || cu.nombre, t.nombre),
         coalesce(ce.nombre, e.nombre),
         (select count(*)::integer from paradas p where p.sif_id = s.id)
  from elegidas s
  join lineas l on l.id = s.linea_id
  join areas a on a.id = l.area_id
  left join paradas_tipos t on t.id = s.tipo_id
  left join paradas_equipos e on e.id = t.equipo_id
  left join catalogo_fallas f on f.id = s.falla_id
  left join catalogo_subsistemas cu on cu.id = f.subsistema_id
  left join catalogo_sistemas cs on cs.id = cu.sistema_id
  left join catalogo_equipos ce on ce.id = cs.equipo_id
  left join usuarios ur on ur.id = s.revisada_por
  order by case s.estado when 'PENDIENTE' then 0 when 'INSPECCION' then 1 when 'EN_REPARACION' then 2 else 3 end,
           coalesce(s.cierre, s.revisada_en, s.escalada_en, s.generada_en) desc;
end;
$$;

create or replace function listar_paradas_sif(p_usuario text, p_sif_id uuid)
returns table (parada_id uuid, inicio timestamptz, fin timestamptz, origen text, equipo text, subsistema text, registro text, responsable text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('listar_paradas_sif', p_usuario);
  if not usuario_activo_sif(p_usuario) then
    raise exception 'Usuario no válido.';
  end if;

  return query
  select p.id, p.inicio, p.fin, p.origen,
         -- Del Sheet: lo que escribió Mantenimiento. Con falla del catálogo modular: su equipo y
         -- «falla · subsistema». Si no, el equipo del tipo y el tipo mismo.
         case when p.origen = 'SHEET' then nullif(p.mtto_equipo, '') else coalesce(ce.nombre, te.nombre) end,
         case when p.origen = 'SHEET' then nullif(p.mtto_subsistema, '') else coalesce(f.nombre || ' · ' || cu.nombre, t.nombre) end,
         case when p.origen = 'SHEET' then 'Sheet de Mantenimiento' else coalesce(u.nombre, u.usuario) end,
         p.responsable
  from paradas p
  left join paradas_tipos t on t.id = p.tipo_id
  left join paradas_equipos te on te.id = t.equipo_id
  left join catalogo_fallas f on f.id = coalesce(p.falla_final_id, p.falla_produccion_id)
  left join catalogo_subsistemas cu on cu.id = f.subsistema_id
  left join catalogo_sistemas cs on cs.id = cu.sistema_id
  left join catalogo_equipos ce on ce.id = cs.equipo_id
  left join usuarios u on u.id = p.creado_por
  where p.sif_id = p_sif_id
  order by p.inicio;
end;
$$;

-- ------------------------------------------------------------
-- Poner la falla a una parada
-- ------------------------------------------------------------
/*
 * p_quien = 'PRODUCCION' (al Parar o Anotar) o 'MANTENIMIENTO' (al Terminar o
 * Poner código). La falla tiene que estar activa y ser de un equipo de la
 * línea de la parada (o de servicios). Deja el tipo genérico FALLA_EQUIPO,
 * el nombre «falla · subsistema» y la clase de la falla.
 */
create or replace function asignar_falla_parada(p_usuario text, p_parada_id uuid, p_falla_id uuid, p_quien text, p_pagina text default 'Líneas')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parada paradas;
  v_falla catalogo_fallas;
  v_nombre text;
  v_equipo catalogo_equipos;
begin
  if not (tiene_permiso(p_usuario, 'PARADAS_REGISTRAR') or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO')) then
    raise exception 'No tienes permiso para registrar paradas.';
  end if;
  if p_quien not in ('PRODUCCION', 'MANTENIMIENTO') then
    raise exception 'Falta decir quién elige la falla.';
  end if;
  select * into v_parada from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  select * into v_falla from catalogo_fallas where id = p_falla_id and activo;
  if not found then
    raise exception 'Esa falla no existe o está desactivada.';
  end if;
  select e.* into v_equipo
  from catalogo_subsistemas u
  join catalogo_sistemas s on s.id = u.sistema_id
  join catalogo_equipos e on e.id = s.equipo_id
  where u.id = v_falla.subsistema_id;
  if v_equipo.tipo = 'LINEA' and not exists (
    select 1 from catalogo_equipos_lineas el where el.equipo_id = v_equipo.id and el.linea_id = v_parada.linea_id
  ) then
    raise exception 'Esa falla es de %, que no está en esta línea.', v_equipo.nombre;
  end if;

  select v_falla.nombre || ' · ' || u.nombre into v_nombre from catalogo_subsistemas u where u.id = v_falla.subsistema_id;
  update paradas
  set tipo_id = (select id from paradas_tipos where codigo = 'FALLA_EQUIPO'),
      tipo_nombre = v_nombre,
      clase = v_falla.clase,
      falla_produccion_id = case when p_quien = 'PRODUCCION' then p_falla_id else falla_produccion_id end,
      falla_final_id = case when p_quien = 'MANTENIMIENTO' then p_falla_id else falla_final_id end
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, coalesce(p_pagina, 'Líneas'),
    format('%s eligió la falla %s (%s)', case when p_quien = 'PRODUCCION' then 'Producción' else 'Mantenimiento' end, v_nombre, codigo_falla(p_falla_id)),
    jsonb_build_object('falla_produccion_id', v_parada.falla_produccion_id, 'falla_final_id', v_parada.falla_final_id, 'tipo_nombre', v_parada.tipo_nombre),
    jsonb_build_object('falla', p_falla_id, 'quien', p_quien)
  );
end;
$$;
grant execute on function asignar_falla_parada(text, uuid, uuid, text, text) to anon, authenticated;

/*
 * Parar y Anotar no devuelven la parada a la app: esto le pone la falla a la
 * que esa misma persona acaba de registrar en esa línea (tipo genérico, sin
 * falla todavía, de los últimos 5 minutos). Devuelve su id.
 */
create or replace function asignar_falla_recien_registrada(p_usuario text, p_linea_codigo text, p_falla_id uuid, p_pagina text default 'Líneas')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select p.id into v_id
  from paradas p
  join lineas l on l.id = p.linea_id
  join usuarios u on u.id = p.creado_por
  where l.codigo = p_linea_codigo
    and u.usuario = lower(p_usuario)
    and p.tipo_id = (select id from paradas_tipos where codigo = 'FALLA_EQUIPO')
    and p.falla_produccion_id is null
    and p.created_at > now() - interval '5 minutes'
  order by p.created_at desc
  limit 1;
  if v_id is null then
    raise exception 'No se encontró la parada recién registrada para ponerle la falla.';
  end if;
  perform asignar_falla_parada(p_usuario, v_id, p_falla_id, 'PRODUCCION', p_pagina);
  -- Si la registró Mantenimiento, esa ya es su diagnóstico: también es la falla final.
  if es_de_mantenimiento(p_usuario) then
    perform asignar_falla_parada(p_usuario, v_id, p_falla_id, 'MANTENIMIENTO', p_pagina);
  end if;
  return v_id;
end;
$$;
grant execute on function asignar_falla_recien_registrada(text, text, uuid, text) to anon, authenticated;

-- Las fallas de una o varias paradas (para prellenar lo de Mantenimiento y mostrar el código).
create or replace function fallas_de_paradas(p_ids uuid[])
returns table (parada_id uuid, falla_produccion_id uuid, falla_final_id uuid, codigo_produccion text, codigo_final text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.falla_produccion_id, p.falla_final_id, codigo_falla(p.falla_produccion_id), codigo_falla(p.falla_final_id)
  from paradas p
  where p.id = any (coalesce(p_ids, '{}'));
$$;
grant execute on function fallas_de_paradas(uuid[]) to anon, authenticated;

-- ------------------------------------------------------------
-- Terminar y Poner código (Mantenimiento) con el catálogo nuevo: no exigen el
-- equipo y el subsistema del catálogo viejo de Mantenimiento. Copias de su
-- última versión (20261113090000 y 20261113290000), solo cambia esa condición.
-- ------------------------------------------------------------
create or replace function terminar_parada(p_usuario text, p_parada_id uuid, p_tipo_codigo text, p_subsistema_codigo text, p_solucion text, p_fin text DEFAULT NULL::text, p_inicio text DEFAULT NULL::text, p_pagina text DEFAULT 'Reportes de paradas'::text, p_mtto_equipo_codigo text DEFAULT NULL::text, p_reparacion_min integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

create or replace function clasificar_falla_mantenimiento(p_usuario text, p_parada_id uuid, p_tipo_codigo text, p_mtto_equipo_codigo text, p_subsistema_codigo text, p_solucion text, p_reparacion_min integer DEFAULT NULL::integer, p_pagina text DEFAULT 'Líneas'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  v_usuario_id uuid;
  v_p paradas;
  v_antes text;
  v_tipo paradas_tipos;
  v_nombre text;
  v_mtto_eq mtto_equipos;
  v_sub text := nullif(btrim(coalesce(p_subsistema_codigo, '')), '');
  v_sub_nombre text;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
begin
  perform public.exigir_usuario('clasificar_falla_mantenimiento', p_usuario);
  if not es_de_mantenimiento(p_usuario) and not coalesce(es_dueno(p_usuario), false) then
    raise exception 'El código de la falla lo pone Mantenimiento.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  select codigo into v_antes from paradas_tipos where id = v_p.tipo_id;
  if coalesce(v_antes, '') not in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR') then
    raise exception 'Esa parada ya tiene su código.';
  end if;
  if v_p.pendiente then
    raise exception 'Primero hay que poner cuánto duró (está como +1).';
  end if;
  if v_p.fin is null then
    raise exception 'La parada sigue abierta: usa Terminar parada.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
  if v_tipo.id is null or v_tipo.codigo in ('FALLA_SIN_ESPECIFICAR', 'POR_CLASIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  -- Con el catálogo nuevo (20261113890000) no se usa el catálogo viejo de Mantenimiento: la falla la pone asignar_falla_parada.
  if catalogo_modular_area((select a.codigo from lineas l join areas a on a.id = l.area_id where l.id = v_p.linea_id)) then
    v_sub := 'SIN_SUBSISTEMA';
  else
    select * into v_mtto_eq from mtto_equipos where codigo = upper(nullif(btrim(coalesce(p_mtto_equipo_codigo, '')), '')) and activo;
    if v_mtto_eq.codigo is null then
      raise exception 'Elige el equipo de Mantenimiento.';
    end if;
    if v_sub is null then
      raise exception 'Elige el subsistema (o «Sin subsistema»).';
    end if;
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
    raise exception 'Escribe qué se hizo para resolver la falla.';
  end if;
  if p_reparacion_min is not null and p_reparacion_min not between 1 and 43200 then
    raise exception 'El tiempo de reparación va en minutos (1 o más).';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      mtto_equipo_codigo = v_mtto_eq.codigo,
      mtto_equipo_nombre = v_mtto_eq.nombre,
      subsistema_codigo = left(v_sub, 40),
      subsistema_nombre = v_sub_nombre,
      solucion = left(v_solucion, 300),
      reparacion_min = p_reparacion_min,
      terminada_por = coalesce(terminada_por, v_usuario_id)
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Puso el código a la falla de la %s: «%s» (%s · %s): %s',
           (select nombre from lineas where id = v_p.linea_id), v_nombre, v_mtto_eq.nombre, v_sub_nombre, v_solucion),
    jsonb_build_object('tipo', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_nombre, 'mtto_equipo', v_mtto_eq.codigo, 'subsistema', v_sub,
                       'solucion', v_solucion, 'reparacion_min', p_reparacion_min)
  );
end;
$function$;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
