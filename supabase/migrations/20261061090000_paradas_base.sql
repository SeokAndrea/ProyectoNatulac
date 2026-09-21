-- ============================================================
-- PARADAS (FASE B′): catálogo de tipos + registro de paradas por turno
-- ============================================================
-- Hasta ahora el módulo Paradas corría contra un fixture. Esta migración
-- crea la base real:
--   * paradas_tipos: catálogo editable (46 tipos sembrados, línea-agnóstico;
--     el código de planilla se arma por línea en la app: prefijo + "L" +
--     número + secuencia). Solo SUPERADMINISTRADOR lo edita. Un tipo no se
--     borra, se desactiva.
--   * paradas: cada parada queda asociada a un TURNO y a una LÍNEA. El
--     supervisor carga la duración en minutos; inicio/fin los calcula el
--     servidor (fin = ahora, inicio = ahora − duración) y se guardan
--     siempre cerradas. La duración real no se edita después.
-- Auditoría explícita (registrar_auditoria) en toda mutación.
-- No se toca el estado de la línea en Líneas: son registros independientes.
-- ============================================================

create table paradas_tipos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  clase text not null check (clase in ('PROGRAMADA', 'NO_PROGRAMADA', 'OCIOSO')),
  familia text not null check (familia in (
    'PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'SUMINISTRO_VAPOR', 'SUMINISTRO',
    'ESTERILIZACION', 'PREPARACION', 'CODIFICACION', 'OCIOSO'
  )),
  tiempo_guia_min numeric(8, 2) check (tiempo_guia_min is null or tiempo_guia_min > 0),
  prefijo_planilla text not null default '',
  secuencia_planilla integer,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table paradas_tipos enable row level security;

insert into paradas_tipos (codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, secuencia_planilla, orden) values
  ('ARRANQUE_PRODUCCION', 'Arranque de Producción', 'PROGRAMADA', 'PROGRAMADA', 180, 'PP', null, 1),
  ('CAMBIO_LOTE', 'Cambio de Lote', 'PROGRAMADA', 'PROGRAMADA', 10, 'PP', null, 2),
  ('CAMBIO_SABOR', 'Cambio de Sabor', 'PROGRAMADA', 'PROGRAMADA', 25, 'PP', null, 3),
  ('DESCANSO_LEGAL', 'Descanso Legal', 'PROGRAMADA', 'PROGRAMADA', 30, 'PP', null, 4),
  ('FINAL_PRODUCCION', 'Final de Producción', 'PROGRAMADA', 'PROGRAMADA', null, 'PP', null, 5),
  ('LIMPIEZA_INTERMEDIA', 'Limpieza Intermedia Programada', 'PROGRAMADA', 'PROGRAMADA', 180, 'PP', null, 6),
  ('ORDEN_LIMPIEZA_FIN_TURNO', 'Orden y Limpieza del Área — Final de Turno', 'PROGRAMADA', 'PROGRAMADA', 15, 'PP', null, 7),
  ('MANTENIMIENTO_PROGRAMADO', 'Mantenimiento Programado / Cambio de Presentación', 'PROGRAMADA', 'PROGRAMADA', 180, 'PP', null, 8),
  ('DESARROLLO_PRODUCTO', 'Desarrollo de Producto / Insumo', 'PROGRAMADA', 'PROGRAMADA', null, 'PP', null, 9),
  ('LIBERACION_VAPOR', 'Liberación de Vapor', 'PROGRAMADA', 'PROGRAMADA', null, 'PP', null, 10),
  ('TRANSFERENCIA_ENERGIA', 'Transferencia de Energía Eléctrica / Preventivo', 'PROGRAMADA', 'PROGRAMADA', null, 'PPE', null, 11),
  ('LINEA_NO_PROG_VENTAS', 'Línea No Programada / Disponibilidad de Ventas', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 1, 12),
  ('LINEA_NO_PROG_INSUMOS_PALETAS', 'Línea No Programada / Falta de Insumos / Paletas', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 2, 13),
  ('FALLA_SUMINISTRO_ELECTRICO', 'Falla en Suministro Eléctrico', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 3, 14),
  ('LINEA_NO_PROG_ESPACIO_ALMACEN', 'Línea No Programada / Falta de Espacio de Almacenamiento', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 4, 15),
  ('FERIADO', 'Feriado', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 5, 16),
  ('PRESENTACION_NO_PLANIFICADA', 'Presentación No Planificada', 'NO_PROGRAMADA', 'EXTERNA', null, 'LNPE', 6, 17),
  ('DESVASE_PRODUCTO', 'Desvase de Producto', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 1, 18),
  ('INSUMOS_NO_CONFORME', 'Insumos No Conforme (Prueba Industrial)', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 2, 19),
  ('LOGISTICA_LINEA', 'Logística de Línea', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 3, 20),
  ('PARADAS_NO_DOCUMENTADAS', 'Paradas No Documentadas', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 4, 21),
  ('FALTA_DISPONIBILIDAD_INSUMO', 'Falta de Disponibilidad de Insumo', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 5, 22),
  ('FALLA_FALTA_MONTACARGAS', 'Falla / Falta de Montacargas', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 6, 23),
  ('FALLA_OPERACIONAL', 'Falla Operacional (Operación)', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 7, 24),
  ('FALTA_OPERADOR', 'Falta de Operador', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 8, 25),
  ('LOGISTICA_CONDICIONADA_DISTRIBUCION', 'Logística Condicionada por Distribución', 'NO_PROGRAMADA', 'OPERACIONAL', null, 'OP', 9, 26),
  ('FALLA_CODIFICACION', 'Falla en la Codificación', 'NO_PROGRAMADA', 'CODIFICACION', null, 'ID', 1, 27),
  ('FALTA_VAPOR', 'Falta de Vapor', 'NO_PROGRAMADA', 'SUMINISTRO_VAPOR', null, 'SC', 1, 28),
  ('BAJA_PRESION_AGUA_DURA', 'Baja Presión de Agua Dura', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 1, 29),
  ('BAJA_PRESION_AGUA_OSMOTIZADA_PRINCIPAL', 'Baja Presión de Agua Osmotizada Principal', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 2, 30),
  ('BAJA_PRESION_AGUA_OSMOTIZADA_SECUNDARIO', 'Baja Presión de Agua Osmotizada Secundario', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 3, 31),
  ('BAJA_PRESION_AIRE_COMPRIMIDO', 'Baja Presión de Aire Comprimido', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 4, 32),
  ('FALLA_GENERADOR_440V', 'Falla en Generador 440V', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 5, 33),
  ('FALLA_GENERADOR_480V', 'Falla en Generador 480V', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 6, 34),
  ('FALLA_SUMINISTRO_AGUA_HELADA', 'Falla en Suministro de Agua Helada', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 7, 35),
  ('ALARMA_440V', 'Alarma 440V', 'NO_PROGRAMADA', 'SUMINISTRO', null, 'S', 8, 36),
  ('FALLA_NIVEL_BTD', 'Falla de Nivel del BTD', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 1, 37),
  ('FALLA_SISTEMA_AGUA_CALIENTE', 'Falla en el Sistema de Agua Caliente', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 2, 38),
  ('PERDIDA_ESTERILIDAD', 'Pérdida de Esterilidad', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 3, 39),
  ('RETRASO_ARRANQUE', 'Retraso en el Arranque', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 4, 40),
  ('RETRASO_ESTERILIZACION', 'Retraso en la Esterilización', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 5, 41),
  ('RETRASO_LIMPIEZA', 'Retraso en la Limpieza', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 6, 42),
  ('DESPLACE_INCORRECTO', 'Desplace Incorrecto', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 7, 43),
  ('EMPACADURAS_DETERIORADAS', 'Empacaduras Deterioradas', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 8, 44),
  ('LOGISTICA_CONDICIONADA', 'Logística Condicionada', 'NO_PROGRAMADA', 'ESTERILIZACION', null, 'EPT', 9, 45),
  ('COLEO_PREPARACION', 'Coleo de Preparación', 'NO_PROGRAMADA', 'PREPARACION', null, 'P', 1, 46);

-- ------------------------------------------------------------
-- paradas: una fila por parada registrada
-- ------------------------------------------------------------
create table paradas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  linea_id uuid not null references lineas (id),
  tipo_id uuid references paradas_tipos (id),
  clase text not null check (clase in ('PROGRAMADA', 'NO_PROGRAMADA', 'OCIOSO')),
  origen text not null default 'MANUAL' check (origen in ('MANUAL', 'SHEET')),
  -- Nombre mostrado: el del tipo al registrar, o el texto libre del Ocioso.
  tipo_nombre text not null,
  -- Tiempo guía heredado del tipo al registrar (o cargado a mano en Ocioso).
  tiempo_guia_min numeric(8, 2),
  nota text,
  justificacion_desvio text,
  inicio timestamptz not null,
  fin timestamptz,
  ref_sheet text,
  creado_por uuid references usuarios (id),
  created_at timestamptz not null default now(),
  check (fin is null or fin >= inicio)
);

create index paradas_turno_idx on paradas (turno_id);
create index paradas_linea_inicio_idx on paradas (linea_id, inicio);
create unique index paradas_ref_sheet_uidx on paradas (ref_sheet) where ref_sheet is not null;

alter table paradas enable row level security;

-- ------------------------------------------------------------
-- Catálogo: lectura (cualquiera) y edición (solo SUPERADMINISTRADOR)
-- ------------------------------------------------------------
create or replace function listar_paradas_tipos()
returns table (
  codigo text,
  nombre text,
  clase text,
  familia text,
  tiempo_guia_min numeric,
  prefijo_planilla text,
  secuencia_planilla integer,
  activo boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select t.codigo, t.nombre, t.clase, t.familia, t.tiempo_guia_min, t.prefijo_planilla, t.secuencia_planilla, t.activo
  from paradas_tipos t
  order by t.orden, t.nombre;
$$;

grant execute on function listar_paradas_tipos() to anon, authenticated;

-- Crea (p_codigo_original null) o edita (p_codigo_original = código actual) un tipo.
create or replace function guardar_parada_tipo(
  p_usuario text,
  p_codigo_original text,
  p_codigo text,
  p_nombre text,
  p_familia text,
  p_tiempo_guia_min numeric,
  p_prefijo_planilla text,
  p_secuencia_planilla integer,
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
  v_antes paradas_tipos;
  v_id uuid;
  v_codigo text := upper(trim(p_codigo));
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio.';
  end if;
  if p_tiempo_guia_min is not null and p_tiempo_guia_min <= 0 then
    raise exception 'El tiempo guía debe ser mayor que 0.';
  end if;

  v_clase := case p_familia when 'PROGRAMADA' then 'PROGRAMADA' when 'OCIOSO' then 'OCIOSO' else 'NO_PROGRAMADA' end;
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
    insert into paradas_tipos (codigo, nombre, clase, familia, tiempo_guia_min, prefijo_planilla, secuencia_planilla, orden)
    values (
      v_codigo, trim(p_nombre), v_clase, p_familia, p_tiempo_guia_min,
      upper(trim(coalesce(p_prefijo_planilla, ''))), p_secuencia_planilla,
      (select coalesce(max(orden), 0) + 1 from paradas_tipos)
    )
    returning id into v_id;

    perform registrar_auditoria(
      p_usuario, 'CREAR', 'paradas_tipos', v_id::text, p_pagina,
      format('Creó el tipo de parada «%s» (%s)', trim(p_nombre), v_clase),
      null,
      jsonb_build_object('codigo', v_codigo, 'nombre', trim(p_nombre), 'clase', v_clase, 'familia', p_familia,
                         'tiempo_guia_min', p_tiempo_guia_min, 'prefijo_planilla', p_prefijo_planilla,
                         'secuencia_planilla', p_secuencia_planilla)
    );
  else
    select * into v_antes from paradas_tipos where codigo = p_codigo_original;
    if not found then
      raise exception 'No se encontró el tipo de parada.';
    end if;

    update paradas_tipos
    set nombre = trim(p_nombre),
        clase = v_clase,
        familia = p_familia,
        tiempo_guia_min = p_tiempo_guia_min,
        prefijo_planilla = upper(trim(coalesce(p_prefijo_planilla, ''))),
        secuencia_planilla = p_secuencia_planilla,
        updated_at = now()
    where id = v_antes.id;

    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'paradas_tipos', v_antes.id::text, p_pagina,
      format('Editó el tipo de parada «%s»', trim(p_nombre)),
      jsonb_build_object('nombre', v_antes.nombre, 'clase', v_antes.clase, 'familia', v_antes.familia,
                         'tiempo_guia_min', v_antes.tiempo_guia_min, 'prefijo_planilla', v_antes.prefijo_planilla,
                         'secuencia_planilla', v_antes.secuencia_planilla),
      jsonb_build_object('nombre', trim(p_nombre), 'clase', v_clase, 'familia', p_familia,
                         'tiempo_guia_min', p_tiempo_guia_min, 'prefijo_planilla', upper(trim(coalesce(p_prefijo_planilla, ''))),
                         'secuencia_planilla', p_secuencia_planilla)
    );
  end if;
end;
$$;

grant execute on function guardar_parada_tipo(text, text, text, text, text, numeric, text, integer, text) to anon, authenticated;

create or replace function cambiar_activo_parada_tipo(
  p_usuario text,
  p_codigo text,
  p_activo boolean,
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
  v_tipo paradas_tipos;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para editar el catálogo de paradas.';
  end if;

  select * into v_tipo from paradas_tipos where codigo = p_codigo;
  if not found then
    raise exception 'No se encontró el tipo de parada.';
  end if;
  if v_tipo.activo = p_activo then
    return;
  end if;

  update paradas_tipos set activo = p_activo, updated_at = now() where id = v_tipo.id;

  perform registrar_auditoria(
    p_usuario, case when p_activo then 'ACTIVAR' else 'DESACTIVAR' end, 'paradas_tipos', v_tipo.id::text, p_pagina,
    format('%s el tipo de parada «%s»', case when p_activo then 'Activó' else 'Desactivó' end, v_tipo.nombre),
    jsonb_build_object('activo', v_tipo.activo),
    jsonb_build_object('activo', p_activo)
  );
end;
$$;

grant execute on function cambiar_activo_parada_tipo(text, text, boolean, text) to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_parada(): el supervisor (solo supervisores) carga la duración en minutos.
-- Inicio/fin los calcula el servidor: fin = ahora, inicio = ahora − duración.
-- p_tipo_codigo null = Ocioso de texto libre (la nota es obligatoria).
-- La línea se resuelve dentro del área del turno por su número, de modo
-- que 'LINEA_1' sirve igual para Producción (LINEA_1) y Pruebas (LINEA_T1).
-- ------------------------------------------------------------
create or replace function registrar_parada(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_minutos integer,
  p_nota text default null,
  p_justificacion_desvio text default null,
  p_tiempo_guia_min numeric default null,
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
  v_clase text;
  v_nombre text;
  v_guia numeric;
  v_fin timestamptz := now();
  v_id uuid;
  v_numero text := regexp_replace(upper(p_linea_codigo), '^LINEA_T?', '');
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

  if p_tipo_codigo is null then
    if coalesce(trim(p_nota), '') = '' then
      raise exception 'Escribe el motivo del tiempo ocioso.';
    end if;
    v_clase := 'OCIOSO';
    v_nombre := 'Tiempo ocioso';
    v_guia := p_tiempo_guia_min;
  else
    select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
    if not found or not v_tipo.activo then
      raise exception 'El tipo de parada no existe o está desactivado.';
    end if;
    v_clase := v_tipo.clase;
    v_nombre := v_tipo.nombre;
    v_guia := v_tipo.tiempo_guia_min;
    -- Solo Programada exige justificar cuando se pasa del tiempo guía.
    if v_clase = 'PROGRAMADA' and v_guia is not null and p_minutos > v_guia
       and coalesce(trim(p_justificacion_desvio), '') = '' then
      raise exception 'Justifica por qué se pasó del tiempo guía.';
    end if;
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       justificacion_desvio, inicio, fin, creado_por)
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

grant execute on function registrar_parada(text, uuid, text, text, integer, text, text, numeric, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Lectura. Misma forma que `Parada` en src/lib/paradas.ts: inicio/fin
-- en hora de planta ('YYYY-MM-DDTHH:MM:SS'), línea normalizada a
-- LINEA_1/2/3 (Pruebas usa LINEA_T#) y turno como TURNO_#.
-- ------------------------------------------------------------
create or replace function listar_paradas(
  p_desde date,
  p_hasta date,
  p_linea text default null,
  p_clase text default null,
  p_turno_id uuid default null
)
returns table (
  id uuid,
  turno_id uuid,
  clase text,
  origen text,
  linea_codigo text,
  turno_tipo text,
  tipo_codigo text,
  tipo_nombre text,
  tiempo_guia_min numeric,
  nota text,
  justificacion_desvio text,
  inicio text,
  fin text,
  supervisor_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.turno_id,
    p.clase,
    p.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    tt.codigo,
    t.codigo,
    p.tipo_nombre,
    p.tiempo_guia_min,
    p.nota,
    p.justificacion_desvio,
    to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre
  from paradas p
  join lineas l on l.id = p.linea_id
  join turnos tu on tu.id = p.turno_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  where (p_turno_id is null or p.turno_id = p_turno_id)
    and (p_turno_id is not null or (
      (p.inicio at time zone 'America/Caracas')::date between p_desde and p_hasta
    ))
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or p.clase = p_clase)
  order by p.inicio desc;
$$;

grant execute on function listar_paradas(date, date, text, text, uuid) to anon, authenticated;
