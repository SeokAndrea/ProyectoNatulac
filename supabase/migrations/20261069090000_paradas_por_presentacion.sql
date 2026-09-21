-- ============================================================
-- PARADAS: disponibilidad por PRESENTACIÓN
-- ============================================================
-- El catálogo del dueño cambia por línea Y presentación (libro «Paradas por
-- Codigo», pestaña «Nueva Configuración»): el Cap Applicator existe en la
-- Línea 3 solo con 330 ml; el Film Wrapper y el Straw solo con 200 y 250 ml; el
-- décimo ítem de Robot Tavil depende de la presentación en la Línea 2; y la
-- lista de A3 Flex de la Línea 1 cambia entre 500 ml (57 ítems) y 1000 ml (41).
--
-- paradas_equipos_lineas y paradas_tipos_lineas ganan `presentaciones` (ml):
--   null = todas las presentaciones de esa línea.
-- registrar_parada() toma la presentación de la corrida ACTIVA de esa línea; si la
-- línea no tiene corrida activa no filtra por presentación.
-- (La pestaña «Paradas» del libro es la versión vieja; no se usa.)
-- ============================================================

alter table paradas_equipos_lineas add column presentaciones integer[];
alter table paradas_tipos_lineas add column presentaciones integer[];

-- Presentaciones de una fila {"presentaciones": [330, 500]} → integer[] (null si no trae).
create or replace function presentaciones_de(p jsonb)
returns integer[]
language sql
immutable
as $fn$
  select case
    when jsonb_typeof(p -> 'presentaciones') = 'array' and jsonb_array_length(p -> 'presentaciones') > 0
      then array(select jsonb_array_elements_text(p -> 'presentaciones')::integer)
    else null
  end;
$fn$;

-- Datos del libro (Aséptico).
update paradas_equipos_lineas el
set presentaciones = array[330]
from paradas_equipos e, lineas l, areas a
where el.equipo_id = e.id and l.id = el.linea_id and a.id = l.area_id
  and a.codigo = 'ASEPTICO' and l.codigo = 'LINEA_3' and e.codigo = 'CAP_APPLICATOR';

update paradas_equipos_lineas el
set presentaciones = array[200, 250]
from paradas_equipos e, lineas l, areas a
where el.equipo_id = e.id and l.id = el.linea_id and a.id = l.area_id
  and a.codigo = 'ASEPTICO' and l.codigo = 'LINEA_3' and e.codigo in ('FILM_WRAPPER', 'STRAW_APPLICATOR');

-- Robot Tavil, ítem 10: «Falla enfardadora» solo en la Línea 2 con 200 ml; «Baja Capacidad» en las
-- Líneas 1 y 3 y en la Línea 2 con 250 ml.
update paradas_tipos_lineas tl
set presentaciones = array[200]
from paradas_tipos t, lineas l, areas a
where tl.tipo_id = t.id and l.id = tl.linea_id and a.id = l.area_id
  and a.codigo = 'ASEPTICO' and l.codigo = 'LINEA_2' and t.nombre = 'Falla enfardadora';

insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia, presentaciones)
select t.id, l.id, 10, case when l.codigo = 'LINEA_2' then array[250] else null end
from paradas_tipos t
join paradas_equipos e on e.id = t.equipo_id and e.codigo = 'ROBOT_TAVIL'
join areas a on a.codigo = 'ASEPTICO'
join lineas l on l.area_id = a.id and l.codigo in ('LINEA_1', 'LINEA_2', 'LINEA_3')
where t.nombre = 'Baja Capacidad'
on conflict do nothing;

-- Línea 1, A3 Flex: la lista de 500 ml (57 ítems, ya cargada) queda limitada a 500 ml...
insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia, presentaciones)
select t.id, l.id, split_part(t.codigo, '_', 3)::integer, array[500]
from paradas_tipos t
join areas a on a.codigo = 'ASEPTICO'
join lineas l on l.area_id = a.id and l.codigo = 'LINEA_1'
where t.codigo ~ '^A3_FLEX_[0-9]+$';

-- ...y la de 1000 ml (41 ítems) entra como tipos propios, limitados a 1000 ml.
insert into paradas_tipos (equipo_id, codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, codigo_con_linea, secuencia_planilla, orden)
select e.id, v.codigo, v.nombre, 'NO_PROGRAMADA', 'EQUIPO', null, 'A3F', false, v.secuencia,
       (select coalesce(max(orden), 0) from paradas_tipos) + v.secuencia
from (values
  ('A3_FLEX_1000_1', 'Camara Aseptica - Superestructura', 1),
  ('A3_FLEX_1000_2', 'Camara de Secado - Superestructura', 2),
  ('A3_FLEX_1000_3', 'Elemento Sellado Longitudinal - Superestructura', 3),
  ('A3_FLEX_1000_4', 'Elemento de Parada Corta - Superestructura', 4),
  ('A3_FLEX_1000_5', 'Sistema de Aire Esteril - Superestructura', 5),
  ('A3_FLEX_1000_6', 'Sistema de Llenado - Superestructura', 6),
  ('A3_FLEX_1000_7', 'Sistema de Peroxido - Superestructura', 7),
  ('A3_FLEX_1000_8', 'Sistema Neumatico - Superestructura', 8),
  ('A3_FLEX_1000_9', 'Sistema de Limpieza - Superestructura', 9),
  ('A3_FLEX_1000_10', 'Sistema Electrico - Superestructura', 10),
  ('A3_FLEX_1000_11', 'Sistema de Comunicación - Superestructura', 11),
  ('A3_FLEX_1000_12', 'Sistema de Seguridad - Superestructura', 12),
  ('A3_FLEX_1000_13', 'Sistema Hidraulico - Cuerpo de Maquina', 13),
  ('A3_FLEX_1000_14', 'TPOP Falla - Cuerpo de Maquina', 14),
  ('A3_FLEX_1000_15', 'Sistema de Traccion - Traccion', 15),
  ('A3_FLEX_1000_16', 'Mordazas - Traccion', 16),
  ('A3_FLEX_1000_17', 'Brazo de Corte - Traccion', 17),
  ('A3_FLEX_1000_18', 'Brazo de Presión - Traccion', 18),
  ('A3_FLEX_1000_19', 'Falla en el Sellado Transversal - Traccion', 19),
  ('A3_FLEX_1000_20', 'Sistema de Lubricación central - Traccion', 20),
  ('A3_FLEX_1000_21', 'Corrección de diseño - Traccion', 21),
  ('A3_FLEX_1000_22', 'Ajuste de Volumen - Traccion', 22),
  ('A3_FLEX_1000_23', 'Correa de Alimentación - Plegador Final', 23),
  ('A3_FLEX_1000_24', 'PULL-DOWN - Plegador Final', 24),
  ('A3_FLEX_1000_25', 'Calentadores de Pliegues - Plegador Final', 25),
  ('A3_FLEX_1000_26', 'Dispositivo Prensor - Plegador Final', 26),
  ('A3_FLEX_1000_27', 'Empujador Plegadora - Plegador Final', 27),
  ('A3_FLEX_1000_28', 'Desincronización Plegadora - Plegador Final', 28),
  ('A3_FLEX_1000_29', 'Referencia - Plegador Final', 29),
  ('A3_FLEX_1000_30', 'Aire Comprimido - Unidad de Servicio', 30),
  ('A3_FLEX_1000_31', 'Agua Presión - Unidad de Servicio', 31),
  ('A3_FLEX_1000_32', 'Sistema de Refrigeración - Unidad de Servicio', 32),
  ('A3_FLEX_1000_33', 'Mesa de Empalme - ASU', 33),
  ('A3_FLEX_1000_34', 'Aplicador de Tira - ASU', 34),
  ('A3_FLEX_1000_35', 'Línea de Signado Fuera de Posición', 35),
  ('A3_FLEX_1000_36', 'Transportador de Desechos', 36),
  ('A3_FLEX_1000_37', 'Transportador de Salida', 37),
  ('A3_FLEX_1000_38', 'Mala Formación del Envase', 38),
  ('A3_FLEX_1000_39', 'Rebose de Producto en la Cámara Aséptica', 39),
  ('A3_FLEX_1000_40', 'Retraso en el Levantamiento de Programa', 40),
  ('A3_FLEX_1000_41', 'Sistema HI', 41)
) as v(codigo, nombre, secuencia)
join paradas_equipos e on e.codigo = 'A3_FLEX';

insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia, presentaciones)
select t.id, l.id, t.secuencia_planilla, array[1000]
from paradas_tipos t
join areas a on a.codigo = 'ASEPTICO'
join lineas l on l.area_id = a.id and l.codigo = 'LINEA_1'
where t.codigo ~ '^A3_FLEX_1000_[0-9]+$';

create or replace function listar_paradas_equipos()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'codigo', e.codigo,
    'nombre', e.nombre,
    'activo', e.activo,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('area', a.codigo, 'linea', l.codigo, 'presentaciones', el.presentaciones) order by a.codigo, l.codigo)
      from paradas_equipos_lineas el
      join lineas l on l.id = el.linea_id
      join areas a on a.id = l.area_id
      where el.equipo_id = e.id
    ), '[]'::jsonb)
  ) order by e.orden, e.nombre), '[]'::jsonb)
  from paradas_equipos e;
$$;

create or replace function guardar_parada_equipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_lineas jsonb,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes jsonb;
  v_n integer;
  l jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;
  if v_nombre = '' then
    raise exception 'El nombre del equipo es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_equipos where codigo = v_codigo or nombre = v_nombre) then
      raise exception 'Ya existe un equipo con ese nombre o código.';
    end if;
    insert into paradas_equipos (codigo, nombre, orden)
    values (v_codigo, v_nombre, (select coalesce(max(orden), 0) + 1 from paradas_equipos))
    returning id into v_id;
  else
    select id into v_id from paradas_equipos where codigo = p_codigo_original;
    if v_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
    if exists (select 1 from paradas_equipos where nombre = v_nombre and id <> v_id) then
      raise exception 'Ya existe un equipo con ese nombre.';
    end if;
    select jsonb_build_object('nombre', e.nombre,
             'lineas', (select count(*) from paradas_equipos_lineas x where x.equipo_id = e.id))
    into v_antes from paradas_equipos e where e.id = v_id;
    update paradas_equipos set nombre = v_nombre, updated_at = now() where id = v_id;
  end if;

  delete from paradas_equipos_lineas where equipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_equipos_lineas (equipo_id, linea_id, presentaciones)
    select v_id, ln.id, presentaciones_de(l)
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;

  select count(*) into v_n from paradas_equipos_lineas where equipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_equipos', v_id::text, p_pagina,
    format('%s el equipo «%s» (%s líneas)', case when p_codigo_original is null then 'Creó' else 'Editó' end, v_nombre, v_n),
    v_antes,
    jsonb_build_object('nombre', v_nombre, 'lineas', v_n)
  );
end;
$$;

create or replace function listar_paradas_tipos()
returns table (
  codigo text,
  nombre text,
  clase text,
  familia text,
  equipo_codigo text,
  tiempo_guia_min numeric,
  prefijo_planilla text,
  secuencia_planilla integer,
  codigo_con_linea boolean,
  activo boolean,
  lineas jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select t.codigo, t.nombre, t.clase, t.familia, e.codigo, t.tiempo_guia_min, t.prefijo_planilla,
         t.secuencia_planilla, t.codigo_con_linea, t.activo,
         coalesce((
           select jsonb_agg(jsonb_build_object('area', a.codigo, 'linea', l.codigo, 'secuencia', tl.secuencia, 'presentaciones', tl.presentaciones)
                            order by a.codigo, l.codigo)
           from paradas_tipos_lineas tl
           join lineas l on l.id = tl.linea_id
           join areas a on a.id = l.area_id
           where tl.tipo_id = t.id
         ), '[]'::jsonb)
  from paradas_tipos t
  left join paradas_equipos e on e.id = t.equipo_id
  order by t.orden, t.nombre;
$$;

create or replace function guardar_parada_tipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_familia text,
  p_equipo_codigo text,
  p_tiempo_guia_min numeric,
  p_prefijo_planilla text,
  p_secuencia_planilla integer,
  p_codigo_con_linea boolean,
  p_lineas jsonb,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_clase text;
  v_familia text;
  v_equipo_id uuid;
  v_guia numeric;
  v_antes paradas_tipos;
  v_id uuid;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_n integer;
  l jsonb;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if p_equipo_codigo is not null then
    select id into v_equipo_id from paradas_equipos where codigo = p_equipo_codigo;
    if v_equipo_id is null then
      raise exception 'No se encontró el equipo.';
    end if;
  end if;
  -- La familia agrupa (Suministro, Equipo de Proceso, ...); una falla de equipo sin familia propia es 'EQUIPO'.
  v_familia := coalesce(p_familia, case when p_equipo_codigo is not null then 'EQUIPO' end);
  if v_familia is null then
    raise exception 'Elige la familia del tipo.';
  end if;

  v_clase := case v_familia when 'PROGRAMADA' then 'PROGRAMADA' when 'OCIOSO' then 'OCIOSO' else 'NO_PROGRAMADA' end;

  -- Solo la Programada tiene tiempo guía.
  v_guia := case when v_clase = 'PROGRAMADA' then p_tiempo_guia_min else null end;
  if v_guia is not null and v_guia <= 0 then
    raise exception 'El tiempo guía debe ser mayor que 0.';
  end if;

  if v_clase <> 'OCIOSO' and coalesce(trim(p_prefijo_planilla), '') = '' then
    raise exception 'El prefijo de planilla es obligatorio.';
  end if;

  if p_codigo_original is null then
    if v_codigo = '' then
      raise exception 'El código interno es obligatorio.';
    end if;
    if exists (select 1 from paradas_tipos where codigo = v_codigo) then
      raise exception 'Ya existe un tipo con ese código interno.';
    end if;
    insert into paradas_tipos (codigo, nombre, clase, familia, equipo_id, tiempo_guia_min, prefijo_planilla,
                               secuencia_planilla, codigo_con_linea, orden)
    values (v_codigo, trim(p_nombre), v_clase, v_familia, v_equipo_id, v_guia,
            upper(trim(coalesce(p_prefijo_planilla, ''))), p_secuencia_planilla, coalesce(p_codigo_con_linea, true),
            (select coalesce(max(orden), 0) + 1 from paradas_tipos))
    returning id into v_id;
  else
    select * into v_antes from paradas_tipos where codigo = p_codigo_original;
    if not found then
      raise exception 'No se encontró el tipo de parada.';
    end if;
    v_id := v_antes.id;

    update paradas_tipos
    set nombre = trim(p_nombre),
        clase = v_clase,
        familia = v_familia,
        equipo_id = v_equipo_id,
        tiempo_guia_min = v_guia,
        prefijo_planilla = upper(trim(coalesce(p_prefijo_planilla, ''))),
        secuencia_planilla = p_secuencia_planilla,
        codigo_con_linea = coalesce(p_codigo_con_linea, true),
        updated_at = now()
    where id = v_id;
  end if;

  -- Líneas donde existe el tipo (vacío = todas).
  delete from paradas_tipos_lineas where tipo_id = v_id;
  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    insert into paradas_tipos_lineas (tipo_id, linea_id, secuencia, presentaciones)
    select v_id, ln.id, nullif(l ->> 'secuencia', '')::integer, presentaciones_de(l)
    from lineas ln join areas a on a.id = ln.area_id
    where a.codigo = l ->> 'area' and ln.codigo = l ->> 'linea'
    on conflict do nothing;
  end loop;
  select count(*) into v_n from paradas_tipos_lineas where tipo_id = v_id;

  perform registrar_auditoria(
    p_usuario,
    case when p_codigo_original is null then 'CREAR' else 'EDITAR' end,
    'paradas_tipos', v_id::text, p_pagina,
    format('%s el tipo de parada «%s» (%s)', case when p_codigo_original is null then 'Creó' else 'Editó' end,
           trim(p_nombre), v_clase),
    case when v_antes.id is null then null else
      jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'familia', v_antes.familia,
                         'tiempo_guia_min', v_antes.tiempo_guia_min, 'prefijo_planilla', v_antes.prefijo_planilla,
                         'secuencia_planilla', v_antes.secuencia_planilla, 'codigo_con_linea', v_antes.codigo_con_linea)
    end,
    jsonb_build_object('nombre', trim(p_nombre), 'clase', v_clase, 'familia', v_familia, 'equipo', p_equipo_codigo,
                       'tiempo_guia_min', v_guia, 'prefijo_planilla', upper(trim(coalesce(p_prefijo_planilla, ''))),
                       'secuencia_planilla', p_secuencia_planilla, 'codigo_con_linea', coalesce(p_codigo_con_linea, true),
                       'lineas', v_n)
  );
end;
$$;

create or replace function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_pagina text default 'Registrar Paradas'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_turno turnos;
  v_linea_id uuid;
  v_tipo paradas_tipos;
  v_equipo paradas_equipos;
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_fin timestamptz := now();
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
  v_pres integer;
begin
  if p_minutos is null or p_minutos <= 0 then
    raise exception 'La duración debe ser mayor que 0 minutos.';
  end if;
  if p_minutos > 1440 then
    raise exception 'La duración no puede superar 24 horas.';
  end if;

  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Solo los supervisores registran paradas (el Área de Pruebas también, para probar).
  if v_rol is distinct from 'SUPERVISOR' and v_area is distinct from 'PRUEBAS' then
    raise exception 'Solo los supervisores pueden registrar paradas.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;
  if v_turno.supervisor_id is distinct from v_usuario_id then
    raise exception 'Solo puedes registrar paradas en tu propio turno.';
  end if;

  select l.id into v_linea_id
  from lineas l
  where l.area_id = v_turno.area_id
    and regexp_replace(upper(l.codigo), '^LINEA_T?', '') = v_numero
  limit 1;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  -- Presentación (ml) que corre ahora en esa línea; sin corrida activa no se filtra por presentación.
  select pr.volumen_ml into v_pres
  from turno_lineas tl
  join presentaciones pr on pr.id = tl.presentacion_id
  where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1;

  if p_tipo_codigo is null then
    -- Ocioso de texto libre: sin tiempo guía.
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := null;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := case when v_clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

    -- El tipo puede existir solo en algunas líneas de esta área (paradas_tipos_lineas).
    if v_area is distinct from 'PRUEBAS'
       and exists (
         select 1 from paradas_tipos_lineas tl join lineas l2 on l2.id = tl.linea_id
         where tl.tipo_id = v_tipo.id and l2.area_id = v_turno.area_id
       )
       and not exists (
         select 1 from paradas_tipos_lineas
         where tipo_id = v_tipo.id and linea_id = v_linea_id
           and (presentaciones is null or v_pres is null or v_pres = any (presentaciones))
       ) then
      raise exception 'Esa parada no aplica a esta línea.';
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

    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min,
                       nota, justificacion_desvio, inicio, fin, creado_por)
  values (p_turno_id, v_linea_id, v_tipo.id, v_clase, 'MANUAL', v_nombre, v_guia,
          nullif(trim(coalesce(p_nota, '')), ''),
          case when v_clase = 'PROGRAMADA' then nullif(trim(coalesce(p_justificacion_desvio, '')), '') else null end,
          v_fin - make_interval(mins => p_minutos), v_fin, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, p_pagina,
    format('Registró parada «%s» de %s min en %s (turno %s)', v_nombre, p_minutos,
           (select nombre from lineas where id = v_linea_id), v_turno.codigo),
    null,
    jsonb_build_object('turno_id', p_turno_id, 'linea_id', v_linea_id, 'clase', v_clase, 'tipo', v_nombre,
                       'minutos', p_minutos, 'tiempo_guia_min', v_guia, 'nota', p_nota,
                       'justificacion_desvio', p_justificacion_desvio)
  );

  return v_id;
end;
$$;
