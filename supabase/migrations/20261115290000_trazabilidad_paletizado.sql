-- ============================================================
-- Trazabilidad de paletizado (hoja 1-PR-F-040 Rev.01)
-- ============================================================
-- Aprobado por Alexander (2026-11-11 y 2026-11-12). Ver
-- docs/superpowers/specs/2026-11-11-trazabilidad-paletizado-design.md.
--
-- Va después de 20261114690000_robot_tavil_precarga.sql.
--
--   * Cada paleta del Robot Tavil guarda los datos de la hoja: día y turno,
--     sabor y presentación, Nº de paleta, ticket, tipo (Automático/Manual),
--     cajas, conformidad, observación y acción de corrección.
--   * Nº de paleta: cuenta propia por línea + día + sabor + presentación.
--     Una combinación nueva arranca en 1; si se vuelve a una que ya salió
--     ese día, continúa desde su último número.
--   * El «+» pide el ticket (obligatorio, no se repite entre paletas vivas)
--     y la conformidad (NC exige observación 1 a 7).
--   * «Paleta manual»: interruptor por línea. Encendido, toda paleta nueva
--     de esa línea se guarda como MANUAL.
--   * Códigos de la hoja: sabores.codigo y presentaciones.codigos_presentacion,
--     editables desde Edición de Datos.
--   * Tarjeta «Trazabilidad del paletizado»: TRAZABILIDAD_VER (ver y
--     exportar) y TRAZABILIDAD_EDITAR (corregir conformidad y observación).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
alter table robot_tavil_paletas add column if not exists fecha_produccion date;
alter table robot_tavil_paletas add column if not exists turno_tipo text;
alter table robot_tavil_paletas add column if not exists sabor_id uuid references sabores (id);
alter table robot_tavil_paletas add column if not exists presentacion_id uuid references presentaciones (id);
alter table robot_tavil_paletas add column if not exists numero integer;
alter table robot_tavil_paletas add column if not exists tipo_paletizado text not null default 'AUTOMATICO';
alter table robot_tavil_paletas add column if not exists cajas integer;
alter table robot_tavil_paletas add column if not exists ticket text;
alter table robot_tavil_paletas add column if not exists conforme boolean not null default true;
alter table robot_tavil_paletas add column if not exists observacion_codigos integer[] not null default '{}';
alter table robot_tavil_paletas add column if not exists observacion_otros text;
alter table robot_tavil_paletas add column if not exists accion_correccion text;
alter table robot_tavil_paletas add column if not exists editada_en timestamptz;
alter table robot_tavil_paletas add column if not exists editada_por uuid references usuarios (id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'robot_tavil_paletas_tipo_check') then
    alter table robot_tavil_paletas add constraint robot_tavil_paletas_tipo_check
      check (tipo_paletizado in ('AUTOMATICO', 'MANUAL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robot_tavil_paletas_turno_check') then
    alter table robot_tavil_paletas add constraint robot_tavil_paletas_turno_check
      check (turno_tipo is null or turno_tipo in ('TURNO_1', 'TURNO_2', 'TURNO_3'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robot_tavil_paletas_obs_check') then
    alter table robot_tavil_paletas add constraint robot_tavil_paletas_obs_check
      check (observacion_codigos <@ array[1, 2, 3, 4, 5, 6, 7]);
  end if;
end;
$$;

comment on column robot_tavil_paletas.fecha_produccion is 'Día de la hoja de trazabilidad: fecha del turno de la paleta (20261115290000).';
comment on column robot_tavil_paletas.turno_tipo is 'Turno de la paleta: el de la corrida, o el de la hora de planta si salió sin corrida.';
comment on column robot_tavil_paletas.numero is 'Nº de paleta de la hoja: cuenta por línea + día + sabor + presentación.';
comment on column robot_tavil_paletas.ticket is 'Código del papel pegado a la paleta. Lo teclea el operador; no se repite entre paletas vivas.';

alter table sabores add column if not exists codigo text;
comment on column sabores.codigo is 'Código del sabor en la hoja de trazabilidad de paletizado (MZ, PR, DZ%…). Editable en Edición de Datos.';
alter table presentaciones add column if not exists codigos_presentacion text;
comment on column presentaciones.codigos_presentacion is 'Código de la presentación en la hoja de trazabilidad (TBA-1000 cm3, TPA-250 cm3…). Editable en Edición de Datos.';

-- Interruptor «Paleta manual» por línea.
create table if not exists robot_tavil_linea_manual (
  linea_id uuid primary key references lineas (id),
  manual boolean not null default false,
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid references usuarios (id)
);
alter table robot_tavil_linea_manual enable row level security;
comment on table robot_tavil_linea_manual is 'Interruptor «Paleta manual» del Robot Tavil por línea: encendido, las paletas nuevas se guardan como MANUAL (20261115290000).';

-- ------------------------------------------------------------
-- 2. Códigos de la hoja
-- ------------------------------------------------------------
-- Base por el nombre del sabor; sufijo por la familia (Selecto «%», Jucosa «J»).
-- Los Tés se reconocen por el nombre. Lo que no encaje queda en null.
with s as (
  select sa.id,
         lower(translate(sa.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) as n,
         lower(translate(coalesce(f.nombre, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) as fam
  from sabores sa
  left join familias_producto f on f.id = sa.familia_id
  where sa.codigo is null
),
b as (
  select id, n, fam,
         case
           when n ~ '^te de durazno' then 'DZT'
           when n ~ '^te de limon' then 'LMT'
           when n ~ 'clarificad' then 'CL'
           when n ~ 'coco' then 'CC'
           when n ~ 'manzana' then 'MZ'
           when n ~ 'pera' then 'PR'
           when n ~ 'durazno' then 'DZ'
           when n ~ 'naranja' then 'NJ'
           when n ~ 'mango' then 'MG'
           when n ~ 'coctel' then 'CT'
         end as base
  from s
)
update sabores sa
set codigo = case
               when b.base in ('DZT', 'LMT') then b.base
               when b.fam = 'selecto' then b.base || '%'
               when b.fam = 'jucosa' then b.base || 'J'
               when b.fam = 'premium' and b.base = 'NJ' and b.n ~ '100' then 'NJ%'
               else b.base
             end
from b
where sa.id = b.id and b.base is not null;

update presentaciones
set codigos_presentacion = case volumen_ml
                             when 1000 then 'TBA-1000 cm3'
                             when 500 then 'TBA-500 cm3'
                             when 330 then 'TPA-330 cm3'
                             when 250 then 'TPA-250 cm3'
                             when 200 then 'TPA-200 cm3'
                           end
where codigos_presentacion is null and volumen_ml in (1000, 500, 330, 250, 200);

-- ------------------------------------------------------------
-- 3. Relleno de las paletas ya cargadas (solo Pruebas tenía el robot)
-- ------------------------------------------------------------
-- Con corrida: día, turno, sabor y presentación de la corrida. Sin corrida:
-- sabor y presentación de la corrida que seguía el operador; día y turno por
-- la hora de planta.
update robot_tavil_paletas rp
set fecha_produccion = t.fecha,
    turno_tipo = tt.codigo,
    sabor_id = tl.sabor_id,
    presentacion_id = tl.presentacion_id
from turno_lineas tl
join turnos t on t.id = tl.turno_id
join turno_tipos tt on tt.id = t.turno_tipo_id
where rp.turno_linea_id = tl.id and rp.fecha_produccion is null;

update robot_tavil_paletas rp
set fecha_produccion = (select h.fecha from turno_de_hora(rp.creada_en at time zone 'America/Caracas') h),
    turno_tipo = (select h.tipo_codigo from turno_de_hora(rp.creada_en at time zone 'America/Caracas') h),
    sabor_id = tl.sabor_id,
    presentacion_id = tl.presentacion_id
from robot_tavil_seguimiento s
join turno_lineas tl on tl.id = s.turno_linea_id
where rp.turno_linea_id is null and s.linea_id = rp.linea_id and rp.fecha_produccion is null;

update robot_tavil_paletas rp
set cajas = p.cajas_x_paleta
from presentaciones p
where p.id = rp.presentacion_id and rp.cajas is null;

with n as (
  select id, row_number() over (
           partition by linea_id, fecha_produccion, sabor_id, presentacion_id
           order by creada_en, id) as numero
  from robot_tavil_paletas
  where anulada_en is null and numero is null
)
update robot_tavil_paletas rp set numero = n.numero from n where n.id = rp.id;

-- ------------------------------------------------------------
-- 4. Garantías
-- ------------------------------------------------------------
-- Ticket repetido: se bloquea entre paletas vivas (sin espacios a los lados,
-- sin distinguir mayúsculas). La anulada sale del índice y libera su ticket.
create unique index if not exists robot_tavil_paletas_ticket_unico
  on robot_tavil_paletas (upper(btrim(ticket)))
  where anulada_en is null and ticket is not null;

-- Dos paletas vivas no repiten número en su combinación.
create unique index if not exists robot_tavil_paletas_numero_unico
  on robot_tavil_paletas (linea_id, fecha_produccion, sabor_id, presentacion_id, numero)
  where anulada_en is null and numero is not null;

create index if not exists robot_tavil_paletas_dia
  on robot_tavil_paletas (fecha_produccion, linea_id) where anulada_en is null;

-- ------------------------------------------------------------
-- 5. Permisos
-- ------------------------------------------------------------
-- No se dan a ningún puesto: se asignan desde Áreas y puestos o como permiso extra.
insert into permisos (codigo, nombre, tema)
values ('TRAZABILIDAD_VER', 'Ver y exportar la Trazabilidad del paletizado', 'TURNOS'),
       ('TRAZABILIDAD_EDITAR', 'Corregir la Trazabilidad del paletizado', 'TURNOS')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 6. Ayudas internas
-- ------------------------------------------------------------
-- Hora de planta → fecha y turno.
create or replace function robot_tavil_dia_actual(out fecha date, out turno_tipo text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from turno_de_hora(now() at time zone 'America/Caracas');
  fecha := v.fecha;
  turno_tipo := v.tipo_codigo;
end;
$$;
revoke execute on function robot_tavil_dia_actual() from public, anon, authenticated;

/*
 * Lo que llevaría una paleta nueva de la línea según su estado:
 *   con corrida   → la corrida que sigue el operador (día y turno de su turno);
 *   sin corrida   → (ENTREGADA) sabor y presentación de la corrida que seguía,
 *                   día y turno por la hora de planta.
 * null en turno_linea_id = la paleta queda sin corrida.
 */
create or replace function robot_tavil_contexto_paleta(
  p_linea_id uuid,
  out turno_linea_id uuid,
  out sabor_id uuid,
  out presentacion_id uuid,
  out fecha date,
  out turno_tipo text,
  out puede boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e record;
  v_ref uuid;
  v_dia record;
begin
  select * into v_e from robot_tavil_estado_linea(p_linea_id);
  puede := v_e.estado = 'EN_CURSO' or v_e.estado = 'ENTREGADA' or (v_e.estado = 'LOTE_NUEVO' and v_e.seguida_abierta);
  if not coalesce(puede, false) then
    puede := false;
    return;
  end if;
  v_ref := v_e.seguida;
  select tl.sabor_id, tl.presentacion_id into sabor_id, presentacion_id from turno_lineas tl where tl.id = v_ref;
  if v_e.estado = 'ENTREGADA' then
    turno_linea_id := null;
    select * into v_dia from robot_tavil_dia_actual();
    fecha := v_dia.fecha;
    turno_tipo := v_dia.turno_tipo;
  else
    turno_linea_id := v_ref;
    select t.fecha, tt.codigo into fecha, turno_tipo
    from turno_lineas tl
    join turnos t on t.id = tl.turno_id
    join turno_tipos tt on tt.id = t.turno_tipo_id
    where tl.id = v_ref;
  end if;
end;
$$;
revoke execute on function robot_tavil_contexto_paleta(uuid) from public, anon, authenticated;

create or replace function robot_tavil_siguiente_numero(p_linea_id uuid, p_fecha date, p_sabor_id uuid, p_presentacion_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(rp.numero), 0) + 1
  from robot_tavil_paletas rp
  where rp.linea_id = p_linea_id
    and rp.fecha_produccion = p_fecha
    and rp.sabor_id is not distinct from p_sabor_id
    and rp.presentacion_id is not distinct from p_presentacion_id
    and rp.anulada_en is null;
$$;
revoke execute on function robot_tavil_siguiente_numero(uuid, date, uuid, uuid) from public, anon, authenticated;

-- Valida y normaliza conformidad + observación. p_obligatoria: NC exige observación.
create or replace function robot_tavil_validar_conformidad(
  p_conforme boolean,
  p_codigos integer[],
  p_otros text,
  p_accion text,
  p_obligatoria boolean,
  out codigos integer[],
  out otros text,
  out accion text
)
language plpgsql
immutable
set search_path = public
as $$
begin
  codigos := coalesce((select array_agg(distinct c order by c) from unnest(coalesce(p_codigos, '{}')) c), '{}');
  otros := nullif(btrim(coalesce(p_otros, '')), '');
  accion := nullif(btrim(coalesce(p_accion, '')), '');
  if not (codigos <@ array[1, 2, 3, 4, 5, 6, 7]) then
    raise exception 'La observación solo admite los códigos 1 a 7 de la hoja.';
  end if;
  if p_conforme then
    -- Conforme: sin observación ni acción.
    codigos := '{}';
    otros := null;
    accion := null;
    return;
  end if;
  if not p_conforme and p_obligatoria and cardinality(codigos) = 0 then
    raise exception 'Marca al menos una observación (1 a 7) para una paleta no conforme.';
  end if;
  if 7 = any(codigos) and otros is null then
    raise exception 'Especifica el «Otros» (observación 7).';
  end if;
  if not (7 = any(codigos)) then
    otros := null;
  end if;
end;
$$;
revoke execute on function robot_tavil_validar_conformidad(boolean, integer[], text, text, boolean) from public, anon, authenticated;

-- ¿Ese ticket ya está en otra paleta viva? Devuelve el aviso o null.
create or replace function robot_tavil_aviso_ticket(p_ticket text, p_excluir uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Ese ticket ya está en la paleta Nº ' || coalesce(rp.numero::text, '?') || ' de la ' || l.nombre
         || ' (' || coalesce(to_char(rp.fecha_produccion, 'DD/MM/YYYY'), 'sin fecha') || '). No se puede repetir: revisa el papel.'
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id
  where rp.anulada_en is null
    and rp.ticket is not null
    and upper(btrim(rp.ticket)) = upper(btrim(p_ticket))
    and rp.id is distinct from p_excluir
  limit 1;
$$;
revoke execute on function robot_tavil_aviso_ticket(text, uuid) from public, anon, authenticated;

-- Una paleta para mostrar (operador y tarjeta de Trazabilidad).
create or replace function robot_tavil_paleta_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', rp.id,
    'linea_codigo', l.codigo,
    'linea_nombre', l.nombre,
    'fecha_produccion', rp.fecha_produccion,
    'turno_tipo', rp.turno_tipo,
    'creada_en', rp.creada_en,
    'numero', rp.numero,
    'ticket', rp.ticket,
    'tipo_paletizado', rp.tipo_paletizado,
    'cajas', rp.cajas,
    'conforme', rp.conforme,
    'observacion_codigos', to_jsonb(rp.observacion_codigos),
    'observacion_otros', rp.observacion_otros,
    'accion_correccion', rp.accion_correccion,
    'lote', tl.lote,
    'sabor_codigo', s.codigo,
    'sabor_nombre', sabor_display(s.nombre, f.nombre),
    'presentacion_volumen_ml', p.volumen_ml,
    'presentacion_codigo', p.codigos_presentacion,
    'editada_en', rp.editada_en,
    'editada_por', nullif(trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), '')
  )
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id
  left join turno_lineas tl on tl.id = rp.turno_linea_id
  left join sabores s on s.id = rp.sabor_id
  left join familias_producto f on f.id = s.familia_id
  left join presentaciones p on p.id = rp.presentacion_id
  left join usuarios u on u.id = rp.editada_por
  where rp.id = p_id;
$$;
revoke execute on function robot_tavil_paleta_json(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Pantalla del operador: + interruptor manual, Nº próximo y paletas del día
-- ------------------------------------------------------------
create or replace function robot_tavil_pantalla(p_area_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_linea record;
  v_e record;
  v_ctx record;
  v_actual jsonb;
  v_anterior uuid;
  v_cerrada_en timestamptz;
  v_dia date := (select fecha from robot_tavil_dia_actual());
  v_lineas jsonb := '[]'::jsonb;
begin
  for v_linea in select l.id, l.codigo, l.nombre from lineas l where l.area_id = p_area_id and l.activo order by l.codigo loop
    select * into v_e from robot_tavil_estado_linea(v_linea.id);
    continue when v_e.estado is null;
    -- Una corrida cerrada hace más de 12 h ya no se muestra.
    if v_e.estado in ('TERMINADA', 'ENTREGADA') then
      select greatest(tl.finalizada_en, tl.entregada_en) into v_cerrada_en from turno_lineas tl where tl.id = v_e.seguida;
      continue when v_cerrada_en is not null and v_cerrada_en < now() - interval '12 hours';
    end if;
    v_actual := robot_tavil_corrida_json(v_e.seguida);
    select s.anterior_turno_linea_id into v_anterior from robot_tavil_seguimiento s where s.linea_id = v_linea.id;
    select * into v_ctx from robot_tavil_contexto_paleta(v_linea.id);
    v_lineas := v_lineas || jsonb_build_object(
      'linea_codigo', v_linea.codigo,
      'linea_nombre', v_linea.nombre,
      'estado', v_e.estado,
      'puede_sumar', v_e.estado in ('EN_CURSO', 'ENTREGADA') or (v_e.estado = 'LOTE_NUEVO' and v_e.seguida_abierta),
      'corrida', v_actual,
      'sin_corrida', case when v_e.estado = 'ENTREGADA' then (
        select count(*) from robot_tavil_paletas rp where rp.linea_id = v_linea.id and rp.turno_linea_id is null and rp.anulada_en is null
      ) else 0 end,
      'nueva', case when v_e.estado = 'LOTE_NUEVO' then robot_tavil_corrida_json(v_e.vigente) end,
      -- El aviso del lote anterior, mientras la corrida nueva no tenga paletas.
      'anterior', case when v_anterior is not null and v_e.estado = 'EN_CURSO' and (v_actual ->> 'paletas')::integer = 0
                       then robot_tavil_corrida_json(v_anterior) end,
      'manual', coalesce((select m.manual from robot_tavil_linea_manual m where m.linea_id = v_linea.id), false),
      'proximo_numero', case when v_ctx.puede
                             then robot_tavil_siguiente_numero(v_linea.id, v_ctx.fecha, v_ctx.sabor_id, v_ctx.presentacion_id) end,
      'proximo_turno', case when v_ctx.puede then v_ctx.turno_tipo end,
      'proximo_sabor_codigo', (select s.codigo from sabores s where s.id = v_ctx.sabor_id),
      'proximo_presentacion_codigo', (select p.codigos_presentacion from presentaciones p where p.id = v_ctx.presentacion_id),
      -- Paletas del día de la hoja (la más reciente primero).
      'paletas_dia', coalesce((
        select jsonb_agg(robot_tavil_paleta_json(rp.id) order by rp.creada_en desc, rp.id desc)
        from robot_tavil_paletas rp
        where rp.linea_id = v_linea.id and rp.anulada_en is null
          and (rp.fecha_produccion = v_dia or rp.fecha_produccion = v_ctx.fecha)
      ), '[]'::jsonb),
      'anuladas_dia', (
        select count(*) from robot_tavil_paletas rp
        where rp.linea_id = v_linea.id and rp.anulada_en is not null
          and (rp.fecha_produccion = v_dia or rp.fecha_produccion = v_ctx.fecha)
      )
    );
  end loop;
  return jsonb_build_object('lineas', v_lineas);
end;
$$;
revoke execute on function robot_tavil_pantalla(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. Funciones del operador
-- ------------------------------------------------------------
-- «+» sin ticket ya no existe: la pantalla nueva siempre lo pide.
drop function if exists robot_tavil_sumar(text, text);

create or replace function robot_tavil_sumar(
  p_usuario text,
  p_linea_codigo text,
  p_ticket text,
  p_conforme boolean default true,
  p_observacion_codigos integer[] default '{}',
  p_observacion_otros text default null,
  p_accion_correccion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_sumar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
  v_ctx record;
  v_obs record;
  v_ticket text := nullif(btrim(coalesce(p_ticket, '')), '');
  v_aviso text;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  if v_ticket is null then
    raise exception 'Escribe el número de ticket para guardar la paleta.';
  end if;
  -- Un «+» a la vez por línea: así dos toques seguidos no repiten número.
  perform 1 from lineas where id = v_linea for update;

  select * into v_e from robot_tavil_estado_linea(v_linea);
  if v_e.estado = 'LOTE_NUEVO' and not v_e.seguida_abierta then
    raise exception 'El supervisor cargó un lote nuevo en esta línea. Toca «Iniciar con el lote» antes de sumar.';
  end if;
  select * into v_ctx from robot_tavil_contexto_paleta(v_linea);
  if not v_ctx.puede then
    raise exception 'Esta línea no tiene una corrida en curso.';
  end if;

  select * into v_obs from robot_tavil_validar_conformidad(coalesce(p_conforme, true), p_observacion_codigos,
                                                          p_observacion_otros, p_accion_correccion, true);
  v_aviso := robot_tavil_aviso_ticket(v_ticket, null);
  if v_aviso is not null then
    raise exception '%', v_aviso;
  end if;

  begin
    insert into robot_tavil_paletas (
      linea_id, turno_linea_id, creada_por, fecha_produccion, turno_tipo, sabor_id, presentacion_id,
      numero, tipo_paletizado, cajas, ticket, conforme, observacion_codigos, observacion_otros, accion_correccion
    )
    values (
      v_linea, v_ctx.turno_linea_id, v_usuario, v_ctx.fecha, v_ctx.turno_tipo, v_ctx.sabor_id, v_ctx.presentacion_id,
      robot_tavil_siguiente_numero(v_linea, v_ctx.fecha, v_ctx.sabor_id, v_ctx.presentacion_id),
      case when coalesce((select m.manual from robot_tavil_linea_manual m where m.linea_id = v_linea), false)
           then 'MANUAL' else 'AUTOMATICO' end,
      (select p.cajas_x_paleta from presentaciones p where p.id = v_ctx.presentacion_id),
      v_ticket, coalesce(p_conforme, true), v_obs.codigos, v_obs.otros, v_obs.accion
    );
  exception when unique_violation then
    -- Otro operador guardó el mismo ticket en el mismo instante.
    raise exception '%', coalesce(robot_tavil_aviso_ticket(v_ticket, null), 'Ese ticket ya está en otra paleta.');
  end;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_sumar(text, text, text, boolean, integer[], text, text) to anon, authenticated;

-- Corregir una paleta viva del área desde la lista del operador.
create or replace function robot_tavil_editar_paleta(
  p_usuario text,
  p_paleta_id uuid,
  p_ticket text,
  p_tipo_paletizado text,
  p_cajas integer,
  p_conforme boolean,
  p_observacion_codigos integer[],
  p_observacion_otros text,
  p_accion_correccion text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_editar_paleta', p_usuario);
  v_antes robot_tavil_paletas;
  v_obs record;
  v_ticket text := nullif(btrim(coalesce(p_ticket, '')), '');
  v_aviso text;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  select rp.* into v_antes
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id and l.area_id = v_area
  where rp.id = p_paleta_id and rp.anulada_en is null
  for update of rp;
  if not found then
    raise exception 'Esa paleta ya no existe o fue anulada. Recarga la página.';
  end if;
  if v_ticket is null then
    raise exception 'Escribe el número de ticket.';
  end if;
  if coalesce(p_tipo_paletizado, '') not in ('AUTOMATICO', 'MANUAL') then
    raise exception 'Elige si la paleta es automática o manual.';
  end if;
  if coalesce(p_cajas, 0) <= 0 then
    raise exception 'El número de cajas debe ser mayor que cero.';
  end if;
  select * into v_obs from robot_tavil_validar_conformidad(coalesce(p_conforme, true), p_observacion_codigos,
                                                          p_observacion_otros, p_accion_correccion, true);
  v_aviso := robot_tavil_aviso_ticket(v_ticket, p_paleta_id);
  if v_aviso is not null then
    raise exception '%', v_aviso;
  end if;

  update robot_tavil_paletas
  set ticket = v_ticket, tipo_paletizado = p_tipo_paletizado, cajas = p_cajas,
      conforme = coalesce(p_conforme, true), observacion_codigos = v_obs.codigos,
      observacion_otros = v_obs.otros, accion_correccion = v_obs.accion,
      editada_en = now(), editada_por = v_usuario
  where id = p_paleta_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'robot_tavil_paletas', p_paleta_id::text, 'Robot Tavil',
    'Corrigió la paleta Nº ' || coalesce(v_antes.numero::text, '?') || ' (ticket ' || coalesce(v_antes.ticket, '—') || ')',
    jsonb_build_object('ticket', v_antes.ticket, 'tipo_paletizado', v_antes.tipo_paletizado, 'cajas', v_antes.cajas,
                       'conforme', v_antes.conforme, 'observacion_codigos', v_antes.observacion_codigos,
                       'observacion_otros', v_antes.observacion_otros, 'accion_correccion', v_antes.accion_correccion),
    jsonb_build_object('ticket', v_ticket, 'tipo_paletizado', p_tipo_paletizado, 'cajas', p_cajas,
                       'conforme', coalesce(p_conforme, true), 'observacion_codigos', v_obs.codigos,
                       'observacion_otros', v_obs.otros, 'accion_correccion', v_obs.accion)
  );
  return robot_tavil_pantalla(v_area);
exception when unique_violation then
  raise exception '%', coalesce(robot_tavil_aviso_ticket(v_ticket, p_paleta_id), 'Ese ticket ya está en otra paleta.');
end;
$$;
grant execute on function robot_tavil_editar_paleta(text, uuid, text, text, integer, boolean, integer[], text, text) to anon, authenticated;

-- Interruptor «Paleta manual» de la línea.
create or replace function robot_tavil_cambiar_manual(p_usuario text, p_linea_codigo text, p_manual boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_cambiar_manual', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_antes boolean := coalesce((select m.manual from robot_tavil_linea_manual m where m.linea_id = v_linea), false);
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  if p_manual is null then
    raise exception 'Falta indicar si la paleta manual queda encendida o apagada.';
  end if;
  insert into robot_tavil_linea_manual (linea_id, manual, cambiado_en, cambiado_por)
  values (v_linea, p_manual, now(), v_usuario)
  on conflict (linea_id) do update set manual = excluded.manual, cambiado_en = now(), cambiado_por = v_usuario;
  if v_antes is distinct from p_manual then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'robot_tavil_linea_manual', v_linea::text, 'Robot Tavil',
      case when p_manual then 'Encendió' else 'Apagó' end || ' «Paleta manual» en ' || p_linea_codigo,
      jsonb_build_object('manual', v_antes),
      jsonb_build_object('manual', p_manual)
    );
  end if;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_cambiar_manual(text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Tarjeta «Trazabilidad del paletizado»
-- ------------------------------------------------------------
-- Paletas vivas del día, con los filtros de turno y línea (null = todos).
-- Trae también las líneas del área para el filtro.
create or replace function trazabilidad_paletizado_listar(
  p_usuario text,
  p_fecha date,
  p_turnos text[] default null,
  p_lineas text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area uuid;
begin
  perform public.exigir_usuario('trazabilidad_paletizado_listar', p_usuario);
  if not (tiene_permiso(p_usuario, 'TRAZABILIDAD_VER') or tiene_permiso(p_usuario, 'TRAZABILIDAD_EDITAR')) then
    raise exception 'No tienes permiso para ver la Trazabilidad del paletizado.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  return jsonb_build_object(
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', l.codigo, 'nombre', l.nombre) order by l.codigo)
      from lineas l where l.area_id = v_area and l.activo
    ), '[]'::jsonb),
    'paletas', coalesce((
      select jsonb_agg(robot_tavil_paleta_json(rp.id) order by l.codigo, rp.creada_en, rp.id)
      from robot_tavil_paletas rp
      join lineas l on l.id = rp.linea_id and l.area_id = v_area
      where rp.anulada_en is null
        and rp.fecha_produccion = p_fecha
        and (p_turnos is null or rp.turno_tipo = any(p_turnos))
        and (p_lineas is null or l.codigo = any(p_lineas))
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function trazabilidad_paletizado_listar(text, date, text[], text[]) to anon, authenticated;

-- Corregir conformidad y observación (aquí la observación es opcional).
create or replace function trazabilidad_paletizado_corregir(
  p_usuario text,
  p_paleta_id uuid,
  p_conforme boolean,
  p_observacion_codigos integer[],
  p_observacion_otros text,
  p_accion_correccion text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
  v_antes robot_tavil_paletas;
  v_obs record;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  perform public.exigir_usuario('trazabilidad_paletizado_corregir', p_usuario);
  if not tiene_permiso(p_usuario, 'TRAZABILIDAD_EDITAR') then
    raise exception 'No tienes permiso para corregir la Trazabilidad del paletizado.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  select rp.* into v_antes
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id and l.area_id = v_area
  where rp.id = p_paleta_id and rp.anulada_en is null
  for update of rp;
  if not found then
    raise exception 'Esa paleta ya no existe o fue anulada. Recarga la página.';
  end if;
  select * into v_obs from robot_tavil_validar_conformidad(coalesce(p_conforme, true), p_observacion_codigos,
                                                          p_observacion_otros, p_accion_correccion, false);
  update robot_tavil_paletas
  set conforme = coalesce(p_conforme, true), observacion_codigos = v_obs.codigos,
      observacion_otros = v_obs.otros, accion_correccion = v_obs.accion,
      editada_en = now(), editada_por = v_usuario
  where id = p_paleta_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'robot_tavil_paletas', p_paleta_id::text, 'Trazabilidad del paletizado',
    'Corrigió la conformidad de la paleta Nº ' || coalesce(v_antes.numero::text, '?') || ' (ticket ' || coalesce(v_antes.ticket, '—') || ')',
    jsonb_build_object('conforme', v_antes.conforme, 'observacion_codigos', v_antes.observacion_codigos,
                       'observacion_otros', v_antes.observacion_otros, 'accion_correccion', v_antes.accion_correccion),
    jsonb_build_object('conforme', coalesce(p_conforme, true), 'observacion_codigos', v_obs.codigos,
                       'observacion_otros', v_obs.otros, 'accion_correccion', v_obs.accion)
  );
  return robot_tavil_paleta_json(p_paleta_id);
end;
$$;
grant execute on function trazabilidad_paletizado_corregir(text, uuid, boolean, integer[], text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 10. Edición de Datos: código del sabor y de la presentación
-- ------------------------------------------------------------
-- Igual que 20261112390000 + sabores.codigo y presentaciones.codigos_presentacion.
-- (listar_catalogo_edicion ya devuelve todas las columnas; el trigger
-- auditar_cambio guarda antes/después.)
create or replace function guardar_catalogo(
  p_usuario text,
  p_catalogo text,
  p_id uuid,
  p_valores jsonb,
  p_pagina text default 'Edición de Datos'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid := exigir_edicion_datos(p_usuario);
  d jsonb := coalesce(p_valores, '{}'::jsonb);
  v_id uuid;
  v_nombre text := nullif(trim(d->>'nombre'), '');
  v_codigo text;
  v_n integer;
begin
  perform set_config('app.audit_pagina', coalesce(p_pagina, 'Edición de Datos'), true);

  if p_catalogo = 'sabores' then
    if v_nombre is null then raise exception 'Escribe el nombre del sabor.'; end if;
    if nullif(d->>'familia_id', '') is null then raise exception 'Elige la familia.'; end if;
    if p_id is null then
      insert into sabores (familia_id, nombre, volumen, codigo, editado_por, editado_en)
      values ((d->>'familia_id')::uuid, v_nombre, nullif(d->>'volumen', '')::numeric,
              nullif(upper(btrim(coalesce(d->>'codigo', ''))), ''), v, now())
      returning id into v_id;
    else
      update sabores
      set familia_id = (d->>'familia_id')::uuid, nombre = v_nombre, volumen = nullif(d->>'volumen', '')::numeric,
          codigo = case when d ? 'codigo' then nullif(upper(btrim(coalesce(d->>'codigo', ''))), '') else codigo end,
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'presentaciones' then
    if coalesce((d->>'cajas_x_camada')::integer, 0) <= 0 or coalesce((d->>'cant_camada')::integer, 0) <= 0
       or coalesce((d->>'cajas_x_paleta')::integer, 0) <= 0 or coalesce((d->>'litros_x_caja')::numeric, 0) <= 0
       or coalesce((d->>'envases_x_caja')::integer, 0) <= 0 then
      raise exception 'Completa todos los números de la presentación (mayores que 0).';
    end if;
    if p_id is null then
      if coalesce((d->>'volumen_ml')::integer, 0) <= 0 then raise exception 'Escribe el volumen en ml.'; end if;
      insert into presentaciones (volumen_ml, cajas_x_camada, cant_camada, cajas_x_paleta, litros_x_caja, envases_x_caja,
                                  codigos_presentacion, editado_por, editado_en)
      values ((d->>'volumen_ml')::integer, (d->>'cajas_x_camada')::integer, (d->>'cant_camada')::integer,
              (d->>'cajas_x_paleta')::integer, (d->>'litros_x_caja')::numeric, (d->>'envases_x_caja')::integer,
              nullif(btrim(coalesce(d->>'codigos_presentacion', '')), ''), v, now())
      returning id into v_id;
    else
      -- El volumen (ml) no se cambia: lo usa el resto de la app como código.
      update presentaciones
      set cajas_x_camada = (d->>'cajas_x_camada')::integer, cant_camada = (d->>'cant_camada')::integer,
          cajas_x_paleta = (d->>'cajas_x_paleta')::integer, litros_x_caja = (d->>'litros_x_caja')::numeric,
          envases_x_caja = (d->>'envases_x_caja')::integer,
          codigos_presentacion = case when d ? 'codigos_presentacion'
                                      then nullif(btrim(coalesce(d->>'codigos_presentacion', '')), '')
                                      else codigos_presentacion end,
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'velocidades' then
    if nullif(d->>'linea_id', '') is null or nullif(d->>'presentacion_id', '') is null then
      raise exception 'Elige la línea y la presentación.';
    end if;
    if nullif(trim(d->>'maquina'), '') is null then raise exception 'Escribe la máquina.'; end if;
    if coalesce((d->>'envases_hora')::integer, 0) <= 0 or coalesce((d->>'litros_hora')::numeric, 0) <= 0 then
      raise exception 'Escribe envases por hora y litros por hora (mayores que 0).';
    end if;
    if p_id is null then
      insert into velocidades_llenadora (linea_id, presentacion_id, maquina, envases_hora, litros_hora, editado_por, editado_en)
      values ((d->>'linea_id')::uuid, (d->>'presentacion_id')::uuid, trim(d->>'maquina'),
              (d->>'envases_hora')::integer, (d->>'litros_hora')::numeric, v, now())
      returning id into v_id;
    else
      update velocidades_llenadora
      set linea_id = (d->>'linea_id')::uuid, presentacion_id = (d->>'presentacion_id')::uuid, maquina = trim(d->>'maquina'),
          envases_hora = (d->>'envases_hora')::integer, litros_hora = (d->>'litros_hora')::numeric,
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'lineas' then
    if p_id is null then raise exception 'Las líneas no se crean desde Edición de Datos.'; end if;
    if v_nombre is null then raise exception 'Escribe el nombre de la línea.'; end if;
    update lineas set nombre = v_nombre, editado_por = v, editado_en = now()
    where id = p_id
    returning id into v_id;

  elsif p_catalogo = 'bobinas' then
    if v_nombre is null then raise exception 'Escribe el nombre del tipo de bobina.'; end if;
    if coalesce((d->>'diametro_core_cm')::numeric, 0) <= 0 or coalesce((d->>'espesor_cm')::numeric, 0) <= 0
       or coalesce((d->>'largo_envase_cm')::numeric, 0) <= 0 then
      raise exception 'Escribe el diámetro del core, el espesor y el largo del envase (mayores que 0).';
    end if;
    if p_id is null then
      insert into tipos_bobina (nombre, diametro_core_cm, espesor_cm, largo_envase_cm, redondear_hacia_arriba, editado_por, editado_en)
      values (v_nombre, (d->>'diametro_core_cm')::numeric, (d->>'espesor_cm')::numeric, (d->>'largo_envase_cm')::numeric,
              coalesce((d->>'redondear_hacia_arriba')::boolean, true), v, now())
      returning id into v_id;
    else
      update tipos_bobina
      set nombre = v_nombre, diametro_core_cm = (d->>'diametro_core_cm')::numeric, espesor_cm = (d->>'espesor_cm')::numeric,
          largo_envase_cm = (d->>'largo_envase_cm')::numeric,
          redondear_hacia_arriba = coalesce((d->>'redondear_hacia_arriba')::boolean, redondear_hacia_arriba),
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'conteo' then
    if v_nombre is null then raise exception 'Escribe el nombre del tipo.'; end if;
    if (d->>'peso_vacio_kg') is null or (d->>'peso_vacio_kg')::numeric < 0 or coalesce((d->>'peso_unidad_g')::numeric, 0) <= 0 then
      raise exception 'Escribe el peso vacío y el peso por unidad (mayor que 0).';
    end if;
    if coalesce(d->>'redondeo', '') not in ('ARRIBA', 'ABAJO') then
      raise exception 'Elige el redondeo.';
    end if;
    if p_id is null then
      insert into tipos_conteo_peso (nombre, peso_vacio_kg, peso_unidad_g, redondeo, editado_por, editado_en)
      values (v_nombre, (d->>'peso_vacio_kg')::numeric, (d->>'peso_unidad_g')::numeric, d->>'redondeo', v, now())
      returning id into v_id;
    else
      update tipos_conteo_peso
      set nombre = v_nombre, peso_vacio_kg = (d->>'peso_vacio_kg')::numeric, peso_unidad_g = (d->>'peso_unidad_g')::numeric,
          redondeo = d->>'redondeo', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'formulas' then
    if v_nombre is null then raise exception 'Escribe el sabor de la fórmula.'; end if;
    if coalesce(d->>'familia', '') not in ('CLASICOS', 'PREMIUM', 'TE') then raise exception 'Elige la familia.'; end if;
    if coalesce(d->>'unidad_base', '') not in ('tambor', 'kit') then raise exception 'Elige si la fórmula es por tambor o por kit.'; end if;
    if p_id is null then
      insert into formula_variantes (familia, nombre, unidad_base, editado_por, editado_en)
      values (d->>'familia', v_nombre, d->>'unidad_base', v, now())
      returning id into v_id;
    else
      update formula_variantes
      set familia = d->>'familia', nombre = v_nombre, unidad_base = d->>'unidad_base', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'insumos' then
    if nullif(d->>'variante_id', '') is null then raise exception 'Elige la fórmula.'; end if;
    if nullif(trim(d->>'insumo'), '') is null then raise exception 'Escribe el insumo.'; end if;
    if coalesce((d->>'cantidad')::numeric, 0) <= 0 then raise exception 'Escribe la cantidad (mayor que 0).'; end if;
    if coalesce(d->>'unidad', '') not in ('kg', 'L') then raise exception 'Elige la unidad (kg o L).'; end if;
    if p_id is null then
      insert into formula_insumos (variante_id, insumo, cantidad, unidad, editado_por, editado_en)
      values ((d->>'variante_id')::uuid, trim(d->>'insumo'), (d->>'cantidad')::numeric, d->>'unidad', v, now())
      returning id into v_id;
    else
      update formula_insumos
      set variante_id = (d->>'variante_id')::uuid, insumo = trim(d->>'insumo'), cantidad = (d->>'cantidad')::numeric,
          unidad = d->>'unidad', editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  elsif p_catalogo = 'empaque' then
    if v_nombre is null then raise exception 'Escribe el nombre del material.'; end if;
    if nullif(trim(d->>'unidad'), '') is null then raise exception 'Escribe la unidad (ej. cajas, unidades, rollos).'; end if;
    if p_id is null then
      -- El código lo usan los conteos guardados: se arma solo con el nombre y no cambia más.
      v_codigo := coalesce(nullif(btrim(upper(regexp_replace(
        translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '_', 'g')), '_'), ''), 'EMPAQUE');
      v_n := 1;
      while exists (select 1 from inventario_empaque where codigo = v_codigo || case when v_n = 1 then '' else '_' || v_n end) loop
        v_n := v_n + 1;
      end loop;
      v_codigo := v_codigo || case when v_n = 1 then '' else '_' || v_n end;
      insert into inventario_empaque (codigo, nombre, unidad, orden, editado_por, editado_en)
      values (v_codigo, v_nombre, trim(d->>'unidad'),
              coalesce(nullif(d->>'orden', '')::integer, (select coalesce(max(orden), 0) + 10 from inventario_empaque)), v, now())
      returning id into v_id;
    else
      update inventario_empaque
      set nombre = v_nombre, unidad = trim(d->>'unidad'), orden = coalesce(nullif(d->>'orden', '')::integer, orden),
          editado_por = v, editado_en = now()
      where id = p_id
      returning id into v_id;
    end if;

  else
    raise exception 'Catálogo desconocido: %', p_catalogo;
  end if;

  if v_id is null then
    raise exception 'Ese registro ya no existe. Recarga la página.';
  end if;
  return v_id;
end;
$$;
grant execute on function guardar_catalogo(text, text, uuid, jsonb, text) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
