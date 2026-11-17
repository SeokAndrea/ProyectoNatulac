-- ============================================================
-- Ticket de paleta impreso por el sistema, con QR (Alexander, 2026-11-17)
-- ============================================================
-- Plan: docs/ticket-paletas/plan-tickets-paletas.md. Va después de
-- 20261116490000_familia_bebida_te_negro.sql (usa es_familia_te()).
--
--   * Interruptor general por área «Tickets por sistema» (robot_tavil_config)
--     y copias por paleta (1 por defecto, hasta 4). Lo cambia quien tenga el
--     permiso nuevo ROBOT_TAVIL_TICKETS; queda en Auditoría.
--   * Encendido, el «+» no pide ticket: el servidor pone P-000001,
--     P-000002… (secuencia robot_tavil_ticket_seq) y marca ticket_sistema.
--     Apagado, todo sigue como hoy (ticket a mano, aviso de repetido).
--   * Vida útil del sabor en meses (sabores.vida_util_meses, Edición de
--     Datos). El vencimiento = fecha de producción + vida útil y se guarda
--     en la paleta al crearla (robot_tavil_paletas.vence). Sin vida útil
--     queda vacío y el ticket sale con «VENCE: —».
--   * Impresiones: robot_tavil_registrar_impresion() las cuenta; la
--     reimpresión queda en Auditoría.
--   * Trazabilidad: trazabilidad_paletizado_buscar() encuentra la paleta
--     por el código del ticket (lo que se pega desde el QR).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vida útil del sabor (meses)
-- ------------------------------------------------------------
alter table sabores add column if not exists vida_util_meses integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sabores_vida_util_check') then
    alter table sabores add constraint sabores_vida_util_check check (vida_util_meses is null or vida_util_meses between 1 and 120);
  end if;
end;
$$;
comment on column sabores.vida_util_meses is 'Vida útil del sabor en meses: vencimiento = fecha de producción + vida útil (20261116590000). Editable en Edición de Datos.';

-- Tabla de Alexander (2026-11-17). Igual para todas las presentaciones. Solo
-- llena los que están vacíos; un sabor que no encaje por familia y nombre
-- queda vacío y se completa en Edición de Datos.
with v (fam, nombre, meses) as (
  values ('clasico', 'coctel', 10), ('clasico', 'durazno', 12), ('clasico', 'mango', 12),
         ('clasico', 'manzana', 12), ('clasico', 'naranjada', 8), ('clasico', 'pera', 12),
         ('te', 'te de durazno', 12), ('te', 'te de limon', 12),
         ('jucosa', 'durazno', 12), ('jucosa', 'manzana', 12), ('jucosa', 'naranja', 7), ('jucosa', 'pera', 12),
         ('premium', 'agua de coco', 10), ('premium', 'manzana clarificado', 12), ('premium', 'naranja 100%', 7),
         ('selecto', 'durazno', 12), ('selecto', 'mango', 12), ('selecto', 'manzana', 12), ('selecto', 'pera', 12)
),
s as (
  select sa.id,
         btrim(regexp_replace(regexp_replace(lower(translate(sa.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')), '\s*35\s*%\s*$', ''), '\s+', ' ', 'g')) as n,
         case when es_familia_clasica(f.nombre) then 'clasico'
              when es_familia_te(f.nombre) then 'te'
              else lower(translate(coalesce(f.nombre, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) end as fam
  from sabores sa
  left join familias_producto f on f.id = sa.familia_id
  where sa.vida_util_meses is null
)
update sabores sa
set vida_util_meses = v.meses
from s
join v on v.fam = s.fam and v.nombre = s.n
where sa.id = s.id;

-- ------------------------------------------------------------
-- 2. Paleta: vencimiento, ticket del sistema e impresiones
-- ------------------------------------------------------------
alter table robot_tavil_paletas add column if not exists vence date;
alter table robot_tavil_paletas add column if not exists ticket_sistema boolean not null default false;
alter table robot_tavil_paletas add column if not exists impresiones integer not null default 0;
alter table robot_tavil_paletas add column if not exists impresa_en timestamptz;
alter table robot_tavil_paletas add column if not exists impresa_por uuid references usuarios (id);
comment on column robot_tavil_paletas.vence is 'Vencimiento: fecha de producción + vida útil del sabor, guardado al crear la paleta (20261116590000). Null = el sabor no tenía vida útil.';
comment on column robot_tavil_paletas.ticket_sistema is 'El ticket lo puso el sistema (P-000001…) con «Tickets por sistema» encendido; no se cambia a mano.';
comment on column robot_tavil_paletas.impresiones is 'Veces que se mandó a imprimir su ticket (la primera al crearla).';
comment on column robot_tavil_paletas.ticket is 'Código del ticket: a mano (se puede repetir con doble confirmación, 20261116190000) o del sistema (P-000001…, 20261116590000).';

create sequence if not exists robot_tavil_ticket_seq;

-- Interruptor general por área.
create table if not exists robot_tavil_config (
  area_id uuid primary key references areas (id),
  tickets_sistema boolean not null default false,
  copias integer not null default 1 check (copias between 1 and 4),
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid references usuarios (id)
);
alter table robot_tavil_config enable row level security;
comment on table robot_tavil_config is 'Robot Tavil por área: «Tickets por sistema» y copias por paleta (20261116590000).';

insert into permisos (codigo, nombre, tema)
values ('ROBOT_TAVIL_TICKETS', 'Activar los tickets por sistema del Robot Tavil', 'TURNOS')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- 3. Ayudas
-- ------------------------------------------------------------
create or replace function robot_tavil_vence(p_fecha date, p_sabor_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (p_fecha + make_interval(months => s.vida_util_meses))::date
  from sabores s
  where s.id = p_sabor_id and p_fecha is not null and s.vida_util_meses is not null;
$$;
revoke execute on function robot_tavil_vence(date, uuid) from public, anon, authenticated;

-- Las paletas que ya están (solo Pruebas) toman su vencimiento.
update robot_tavil_paletas
set vence = robot_tavil_vence(fecha_produccion, sabor_id)
where vence is null and anulada_en is null;

create or replace function robot_tavil_config_json(p_area_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activo', coalesce(c.tickets_sistema, false),
    'copias', coalesce(c.copias, 1),
    'cambiado_en', c.cambiado_en,
    'cambiado_por', nullif(trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), '')
  )
  from (select 1) x
  left join robot_tavil_config c on c.area_id = p_area_id
  left join usuarios u on u.id = c.cambiado_por;
$$;
revoke execute on function robot_tavil_config_json(uuid) from public, anon, authenticated;

-- Una paleta para mostrar — última versión: 20261115290000. Agrega vencimiento,
-- ticket del sistema, impresiones, anulada, el nombre del sabor a secas y quién la creó.
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
    'sabor_nombre_base', s.nombre,
    'presentacion_volumen_ml', p.volumen_ml,
    'presentacion_codigo', p.codigos_presentacion,
    'editada_en', rp.editada_en,
    'editada_por', nullif(trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), ''),
    'creada_por', nullif(trim(coalesce(uc.nombre, '') || ' ' || coalesce(uc.apellido, '')), ''),
    'vence', rp.vence,
    'ticket_sistema', rp.ticket_sistema,
    'impresiones', rp.impresiones,
    'impresa_en', rp.impresa_en,
    'anulada_en', rp.anulada_en
  )
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id
  left join turno_lineas tl on tl.id = rp.turno_linea_id
  left join sabores s on s.id = rp.sabor_id
  left join familias_producto f on f.id = s.familia_id
  left join presentaciones p on p.id = rp.presentacion_id
  left join usuarios u on u.id = rp.editada_por
  left join usuarios uc on uc.id = rp.creada_por
  where rp.id = p_id;
$$;
revoke execute on function robot_tavil_paleta_json(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Pantalla del operador — última versión: 20261115290000. Agrega 'tickets'.
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
  return jsonb_build_object('lineas', v_lineas, 'tickets', robot_tavil_config_json(p_area_id));
end;
$$;
revoke execute on function robot_tavil_pantalla(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. «+» — última versión: 20261116190000. Con «Tickets por sistema» el
--    ticket lo pone el servidor; devuelve además la paleta creada ('creada').
-- ------------------------------------------------------------
create or replace function robot_tavil_sumar(
  p_usuario text,
  p_linea_codigo text,
  p_ticket text,
  p_conforme boolean default true,
  p_observacion_codigos integer[] default '{}',
  p_observacion_otros text default null,
  p_accion_correccion text default null,
  p_confirmar_repetido boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_sumar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_sistema boolean := coalesce((select c.tickets_sistema from robot_tavil_config c where c.area_id = v_area), false);
  v_e record;
  v_ctx record;
  v_obs record;
  v_ticket text := nullif(btrim(coalesce(p_ticket, '')), '');
  v_aviso text;
  v_id uuid;
  v_numero integer;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  if not v_sistema and v_ticket is null then
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
  if v_sistema then
    v_ticket := 'P-' || lpad(nextval('robot_tavil_ticket_seq')::text, 6, '0');
  else
    v_aviso := robot_tavil_aviso_ticket(v_ticket, null);
    if v_aviso is not null and not coalesce(p_confirmar_repetido, false) then
      raise exception '%', v_aviso;
    end if;
  end if;

  insert into robot_tavil_paletas (
    linea_id, turno_linea_id, creada_por, fecha_produccion, turno_tipo, sabor_id, presentacion_id,
    numero, tipo_paletizado, cajas, ticket, conforme, observacion_codigos, observacion_otros, accion_correccion,
    ticket_sistema, vence
  )
  values (
    v_linea, v_ctx.turno_linea_id, v_usuario, v_ctx.fecha, v_ctx.turno_tipo, v_ctx.sabor_id, v_ctx.presentacion_id,
    robot_tavil_siguiente_numero(v_linea, v_ctx.fecha, v_ctx.sabor_id, v_ctx.presentacion_id),
    case when coalesce((select m.manual from robot_tavil_linea_manual m where m.linea_id = v_linea), false)
         then 'MANUAL' else 'AUTOMATICO' end,
    (select p.cajas_x_paleta from presentaciones p where p.id = v_ctx.presentacion_id),
    v_ticket, coalesce(p_conforme, true), v_obs.codigos, v_obs.otros, v_obs.accion,
    v_sistema, robot_tavil_vence(v_ctx.fecha, v_ctx.sabor_id)
  )
  returning id, numero into v_id, v_numero;

  if v_aviso is not null then
    perform registrar_auditoria(
      p_usuario, 'CREAR', 'robot_tavil_paletas', v_id::text, 'Robot Tavil',
      'Creó la paleta Nº ' || coalesce(v_numero::text, '?') || ' con el ticket repetido ' || v_ticket
        || ' (' || split_part(v_aviso, '|', 2) || ')',
      null,
      jsonb_build_object('ticket', v_ticket, 'ticket_repetido', true)
    );
  end if;
  return robot_tavil_pantalla(v_area) || jsonb_build_object('creada', robot_tavil_paleta_json(v_id));
end;
$$;
grant execute on function robot_tavil_sumar(text, text, text, boolean, integer[], text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Corregir — última versión: 20261116190000. El ticket del sistema no se
--    cambia; devuelve además la paleta corregida ('editada').
-- ------------------------------------------------------------
create or replace function robot_tavil_editar_paleta(
  p_usuario text,
  p_paleta_id uuid,
  p_ticket text,
  p_tipo_paletizado text,
  p_cajas integer,
  p_conforme boolean,
  p_observacion_codigos integer[],
  p_observacion_otros text,
  p_accion_correccion text,
  p_confirmar_repetido boolean default false
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
  if v_antes.ticket_sistema then
    -- El ticket que puso el sistema es el que está impreso: no se cambia.
    v_ticket := v_antes.ticket;
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
  -- Solo se avisa si el ticket cambió: corregir otra cosa de una paleta que ya tenía el ticket repetido no vuelve a preguntar.
  if upper(btrim(coalesce(v_antes.ticket, ''))) <> upper(v_ticket) then
    v_aviso := robot_tavil_aviso_ticket(v_ticket, p_paleta_id);
    if v_aviso is not null and not coalesce(p_confirmar_repetido, false) then
      raise exception '%', v_aviso;
    end if;
  end if;

  update robot_tavil_paletas
  set ticket = v_ticket, tipo_paletizado = p_tipo_paletizado, cajas = p_cajas,
      conforme = coalesce(p_conforme, true), observacion_codigos = v_obs.codigos,
      observacion_otros = v_obs.otros, accion_correccion = v_obs.accion,
      editada_en = now(), editada_por = v_usuario
  where id = p_paleta_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'robot_tavil_paletas', p_paleta_id::text, 'Robot Tavil',
    'Corrigió la paleta Nº ' || coalesce(v_antes.numero::text, '?') || ' (ticket ' || coalesce(v_antes.ticket, '—') || ')'
      || case when v_aviso is not null then ' con el ticket repetido ' || v_ticket || ' (' || split_part(v_aviso, '|', 2) || ')' else '' end,
    jsonb_build_object('ticket', v_antes.ticket, 'tipo_paletizado', v_antes.tipo_paletizado, 'cajas', v_antes.cajas,
                       'conforme', v_antes.conforme, 'observacion_codigos', v_antes.observacion_codigos,
                       'observacion_otros', v_antes.observacion_otros, 'accion_correccion', v_antes.accion_correccion),
    jsonb_build_object('ticket', v_ticket, 'tipo_paletizado', p_tipo_paletizado, 'cajas', p_cajas,
                       'conforme', coalesce(p_conforme, true), 'observacion_codigos', v_obs.codigos,
                       'observacion_otros', v_obs.otros, 'accion_correccion', v_obs.accion,
                       'ticket_repetido', v_aviso is not null)
  );
  return robot_tavil_pantalla(v_area) || jsonb_build_object('editada', robot_tavil_paleta_json(p_paleta_id));
end;
$$;
grant execute on function robot_tavil_editar_paleta(text, uuid, text, text, integer, boolean, integer[], text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. «−» — última versión: 20261114690000. Devuelve además la paleta anulada
--    ('anulada'), para avisar que se retire su ticket.
-- ------------------------------------------------------------
create or replace function robot_tavil_restar(p_usuario text, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_restar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
  v_paleta uuid;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  select * into v_e from robot_tavil_estado_linea(v_linea);
  if v_e.estado = 'ENTREGADA' then
    select rp.id into v_paleta from robot_tavil_paletas rp
    where rp.linea_id = v_linea and rp.turno_linea_id is null and rp.anulada_en is null
    order by rp.creada_en desc limit 1;
  elsif v_e.estado = 'EN_CURSO' or (v_e.estado = 'LOTE_NUEVO' and v_e.seguida_abierta) then
    select rp.id into v_paleta from robot_tavil_paletas rp
    where rp.turno_linea_id = v_e.seguida and rp.anulada_en is null
    order by rp.creada_en desc limit 1;
  else
    raise exception 'Esta corrida ya se cerró: ya no se pueden quitar paletas.';
  end if;
  if v_paleta is null then
    raise exception 'No hay paletas para quitar.';
  end if;
  update robot_tavil_paletas set anulada_en = now(), anulada_por = v_usuario where id = v_paleta;
  return robot_tavil_pantalla(v_area) || jsonb_build_object('anulada', robot_tavil_paleta_json(v_paleta));
end;
$$;
grant execute on function robot_tavil_restar(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Interruptor «Tickets por sistema» y copias (permiso ROBOT_TAVIL_TICKETS)
-- ------------------------------------------------------------
create or replace function robot_tavil_configurar_tickets(p_usuario text, p_activo boolean, p_copias integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
  v_antes jsonb;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
  v_cambia_activo boolean;
begin
  perform public.exigir_usuario('robot_tavil_configurar_tickets', p_usuario);
  if not tiene_permiso(p_usuario, 'ROBOT_TAVIL_TICKETS') then
    raise exception 'No tienes permiso para cambiar los tickets por sistema.';
  end if;
  if p_activo is null then
    raise exception 'Indica si los tickets por sistema quedan encendidos o apagados.';
  end if;
  if p_copias is null or p_copias not between 1 and 4 then
    raise exception 'Las copias por paleta van de 1 a 4.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  if v_area is null then
    raise exception 'No se encontró el área de planta.';
  end if;

  v_antes := robot_tavil_config_json(v_area);
  insert into robot_tavil_config (area_id, tickets_sistema, copias, cambiado_en, cambiado_por)
  values (v_area, p_activo, p_copias, now(), v_usuario)
  on conflict (area_id) do update
    set tickets_sistema = excluded.tickets_sistema, copias = excluded.copias,
        cambiado_en = now(), cambiado_por = v_usuario;

  v_cambia_activo := (v_antes ->> 'activo')::boolean is distinct from p_activo;
  if v_cambia_activo or (v_antes ->> 'copias')::integer is distinct from p_copias then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'robot_tavil_config', v_area::text, 'Robot Tavil',
      case when v_cambia_activo then case when p_activo then 'Encendió' else 'Apagó' end || ' los tickets por sistema'
           else 'Cambió las copias por paleta' end
        || ' (' || p_copias || ' ' || case when p_copias = 1 then 'copia' else 'copias' end || ' por paleta)',
      jsonb_build_object('tickets_sistema', v_antes -> 'activo', 'copias', v_antes -> 'copias'),
      jsonb_build_object('tickets_sistema', p_activo, 'copias', p_copias)
    );
  end if;
  return robot_tavil_config_json(v_area);
end;
$$;
grant execute on function robot_tavil_configurar_tickets(text, boolean, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Impresión: cuenta las veces; la reimpresión queda en Auditoría.
-- ------------------------------------------------------------
create or replace function robot_tavil_registrar_impresion(
  p_usuario text,
  p_paleta_id uuid,
  p_copias integer default 1,
  p_pagina text default 'Robot Tavil'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
  v_p robot_tavil_paletas;
  v_copias integer := greatest(coalesce(p_copias, 1), 1);
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  perform public.exigir_usuario('robot_tavil_registrar_impresion', p_usuario);
  if not (tiene_permiso(p_usuario, 'ROBOT_TAVIL_CARGAR') or tiene_permiso(p_usuario, 'TRAZABILIDAD_EDITAR')) then
    raise exception 'No tienes permiso para imprimir tickets de paletas.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  select rp.* into v_p
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id and l.area_id = v_area
  where rp.id = p_paleta_id
  for update of rp;
  if not found then
    raise exception 'Esa paleta no existe. Recarga la página.';
  end if;
  if v_p.anulada_en is not null then
    raise exception 'Esa paleta fue anulada: su ticket ya no vale.';
  end if;
  if not v_p.ticket_sistema then
    raise exception 'Esa paleta tiene un ticket escrito a mano: no se imprime desde el sistema.';
  end if;

  update robot_tavil_paletas
  set impresiones = impresiones + 1, impresa_en = now(), impresa_por = v_usuario
  where id = p_paleta_id;

  if v_p.impresiones > 0 then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'robot_tavil_paletas', p_paleta_id::text, coalesce(p_pagina, 'Robot Tavil'),
      'Reimprimió el ticket ' || v_p.ticket || ' de la paleta Nº ' || coalesce(v_p.numero::text, '?')
        || ' (' || v_copias || ' ' || case when v_copias = 1 then 'copia' else 'copias' end || ')',
      jsonb_build_object('impresiones', v_p.impresiones),
      jsonb_build_object('impresiones', v_p.impresiones + 1)
    );
  end if;
  return robot_tavil_paleta_json(p_paleta_id);
end;
$$;
grant execute on function robot_tavil_registrar_impresion(text, uuid, integer, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 10. Trazabilidad: buscar por ticket (lo que se pega desde el QR)
-- ------------------------------------------------------------
create or replace function trazabilidad_paletizado_buscar(p_usuario text, p_ticket text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area uuid;
  v_ticket text := upper(btrim(coalesce(p_ticket, '')));
begin
  perform public.exigir_usuario('trazabilidad_paletizado_buscar', p_usuario);
  if not (tiene_permiso(p_usuario, 'TRAZABILIDAD_VER') or tiene_permiso(p_usuario, 'TRAZABILIDAD_EDITAR')) then
    raise exception 'No tienes permiso para ver la Trazabilidad del paletizado.';
  end if;
  if v_ticket = '' then
    raise exception 'Escribe o pega el ticket de la paleta.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  -- Las vivas primero y la más nueva arriba; las anuladas también salen (marcadas).
  return coalesce((
    select jsonb_agg(robot_tavil_paleta_json(x.id) order by x.anulada_en is not null, x.creada_en desc)
    from (
      select rp.id, rp.anulada_en, rp.creada_en
      from robot_tavil_paletas rp
      join lineas l on l.id = rp.linea_id and l.area_id = v_area
      where rp.ticket is not null and upper(btrim(rp.ticket)) = v_ticket
      order by rp.creada_en desc
      limit 20
    ) x
  ), '[]'::jsonb);
end;
$$;
grant execute on function trazabilidad_paletizado_buscar(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 11. Edición de Datos — última versión: 20261115290000. Agrega la vida útil del sabor.
-- ------------------------------------------------------------
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
  v_vida integer;
begin
  perform set_config('app.audit_pagina', coalesce(p_pagina, 'Edición de Datos'), true);

  if p_catalogo = 'sabores' then
    if v_nombre is null then raise exception 'Escribe el nombre del sabor.'; end if;
    if nullif(d->>'familia_id', '') is null then raise exception 'Elige la familia.'; end if;
    -- Vida útil en meses (20261116590000): vacía o un entero de 1 a 120.
    if nullif(btrim(coalesce(d->>'vida_util_meses', '')), '') is not null then
      if btrim(d->>'vida_util_meses') !~ '^[0-9]+$' or (d->>'vida_util_meses')::numeric not between 1 and 120 then
        raise exception 'La vida útil va en meses enteros, de 1 a 120.';
      end if;
      v_vida := (d->>'vida_util_meses')::integer;
    end if;
    if p_id is null then
      insert into sabores (familia_id, nombre, volumen, codigo, vida_util_meses, editado_por, editado_en)
      values ((d->>'familia_id')::uuid, v_nombre, nullif(d->>'volumen', '')::numeric,
              nullif(upper(btrim(coalesce(d->>'codigo', ''))), ''), v_vida, v, now())
      returning id into v_id;
    else
      update sabores
      set familia_id = (d->>'familia_id')::uuid, nombre = v_nombre, volumen = nullif(d->>'volumen', '')::numeric,
          codigo = case when d ? 'codigo' then nullif(upper(btrim(coalesce(d->>'codigo', ''))), '') else codigo end,
          vida_util_meses = case when d ? 'vida_util_meses' then v_vida else vida_util_meses end,
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

select * from asegurar_control_usuario();
