-- ============================================================
-- PREPARACIÓN CON DATOS DEL PLC: kits y ajustes de agua
-- ============================================================
-- Alexander, 2026-11-09. Diseño y decisiones:
-- docs/superpowers/specs/2026-11-06-preparacion-plc-design.md.
--
-- El operador carga en la HMI del PLC el agua, los kits (fase 2) y los
-- ajustes de agua que pide Calidad (fase 3). Hasta ahora el supervisor
-- volvía a escribir los kits en la app. Desde esta migración:
--
--   * El plc-bridge reporta lo que ve (registrar_carga_plc) con un usuario
--     de servicio, plc-bridge, que solo tiene el permiso PLC_CARGAR. La base
--     guarda una CARGA por preparación hecha en la HMI (plc_cargas_tanque) y
--     sus ajustes (plc_cargas_ajustes): lo que queda precargado.
--   * El supervisor ve la carga en la tarjeta del tanque, elige sabor y lote
--     y la registra (confirmar_carga_plc): el lote nace con los kits del PLC
--     (preparaciones.tambores) y los ajustes sumados al volumen.
--   * Los ajustes que terminan con el lote ya registrado y sin liberar se
--     suman solos, como el botón Ajustar (preparaciones_ajuste_volumen, origen
--     PLC). Después de liberar, el PLC ya no suma agua al lote.
--   * Interruptor por área (areas.preparacion_plc), como el del Robot Tavil:
--     apagado, nada de esto corre y Preparación funciona como antes.
--
-- Para usarlo en planta, Sistemas le pone la clave al usuario del bridge:
--   update usuarios set password_hash = extensions.crypt('<clave>', extensions.gen_salt('bf'))
--    where usuario = 'plc-bridge';
-- y la misma clave va en PLC_BRIDGE_CLAVE (.env.local del servidor).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Interruptor por área
-- ------------------------------------------------------------
-- Como «Calidad libera» y el Robot Tavil: solo la dueña lo cambia (Edición de
-- Datos → Ajustes de planta). Pruebas arranca encendido para ensayar.
alter table areas add column if not exists preparacion_plc boolean not null default false;
alter table areas add column if not exists preparacion_plc_desde timestamptz;
update areas set preparacion_plc = true, preparacion_plc_desde = now() where codigo = 'PRUEBAS' and not preparacion_plc;
comment on column areas.preparacion_plc is 'Encendido: Preparación toma del PLC los kits y los ajustes de agua (20261115990000).';
comment on column areas.preparacion_plc_desde is 'Desde cuándo está encendida la preparación con PLC.';

-- Sin área (dueña / Super Admin): Aséptico, como robot_tavil_area_activo().
create or replace function preparacion_plc_area_activo(p_area_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select preparacion_plc from areas where codigo = coalesce(p_area_codigo, 'ASEPTICO')), false);
$$;
grant execute on function preparacion_plc_area_activo(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Permiso, puesto y usuario del bridge
-- ------------------------------------------------------------
-- Tema Administración: un puesto con «todos los permisos» (el Probador) no lo
-- recibe; solo el puesto del bridge y el de Super Administrador.
insert into permisos (codigo, nombre, tema)
values ('PLC_CARGAR', 'Registrar las cargas del PLC de Preparación (usuario del bridge)', 'ADMINISTRACION')
on conflict (codigo) do nothing;

insert into puestos (codigo, nombre, area_id, nivel, rol_equivalente_id)
select 'INTEGRACION_PLC', 'Integración PLC', a.id, 4, r.id
  from areas a, roles r
 where a.codigo = 'ASEPTICO' and r.codigo = 'VISTA'
on conflict (codigo) do nothing;

insert into puesto_permisos (puesto_id, permiso_codigo)
select p.id, 'PLC_CARGAR' from puestos p where p.codigo = 'INTEGRACION_PLC'
on conflict do nothing;

-- Clave al azar: nadie entra con este usuario hasta que Sistemas le pone una.
insert into usuarios (usuario, password_hash, nombre, puesto_id, activo, debe_completar_perfil)
select 'plc-bridge', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), 'Bridge del PLC', p.id, true, false
  from puestos p
 where p.codigo = 'INTEGRACION_PLC'
on conflict (usuario) do nothing;

-- ------------------------------------------------------------
-- 3. Tablas
-- ------------------------------------------------------------
create table if not exists plc_cargas_tanque (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  numero_tanque smallint not null check (numero_tanque between 1 and 3),
  estado text not null default 'EN_CURSO' check (estado in ('EN_CURSO', 'PENDIENTE', 'CONFIRMADA', 'DESCARTADA')),
  agua_formula_l numeric,
  kits numeric check (kits is null or kits >= 0),
  kits_listos_en timestamptz,
  fase_2_vista boolean not null default false,
  iniciada_en timestamptz not null,
  terminada_en timestamptz,
  ultima_lectura_en timestamptz not null,
  preparacion_id uuid references preparaciones (id) on delete set null,
  kits_usados numeric,
  confirmada_en timestamptz,
  confirmada_por uuid references usuarios (id),
  descartada_en timestamptz,
  descartada_por uuid references usuarios (id),
  motivo_descarte text,
  creada_en timestamptz not null default now()
);
-- El PLC prepara un tanque a la vez: una sola carga abierta en el PLC por área
-- (aunque esté descartada, para que la misma preparación no abra otra).
create unique index if not exists plc_cargas_una_abierta on plc_cargas_tanque (area_id) where terminada_en is null;
create index if not exists plc_cargas_cola on plc_cargas_tanque (area_id, numero_tanque, iniciada_en)
  where estado in ('EN_CURSO', 'PENDIENTE');
create index if not exists plc_cargas_preparacion on plc_cargas_tanque (preparacion_id);
alter table plc_cargas_tanque enable row level security;

comment on table plc_cargas_tanque is 'Una fila por preparación hecha en la HMI del PLC: lo que el supervisor registra después con sabor y lote (20261115990000).';
comment on column plc_cargas_tanque.estado is 'EN_CURSO (el PLC prepara) → PENDIENTE (el PLC terminó) → CONFIRMADA (se unió a un lote), o DESCARTADA.';
comment on column plc_cargas_tanque.agua_formula_l is 'PLC_SetPoint_Litros al iniciar: el agua de la fórmula. Solo para mostrar; nunca suma al volumen.';
comment on column plc_cargas_tanque.kits is 'PLC_Nro_Kits: último valor distinto de cero (admite medios).';
comment on column plc_cargas_tanque.kits_listos_en is 'Cuándo los kits quedaron definitivos (bajó la fase 2, el PLC pasó a la fase 3 o terminó la preparación).';
comment on column plc_cargas_tanque.fase_2_vista is 'El bridge vio la fase 2 en curso: al bajar, los kits quedan listos.';
comment on column plc_cargas_tanque.iniciada_en is 'Cuándo subió PREPARACION (o la primera lectura que la vio).';
comment on column plc_cargas_tanque.terminada_en is 'Cuándo bajó PREPARACION: la hora en que terminó el operador. Null = el PLC sigue con esta preparación.';
comment on column plc_cargas_tanque.ultima_lectura_en is 'Hora de la última lectura del bridge que tocó esta carga.';
comment on column plc_cargas_tanque.preparacion_id is 'El lote al que se unió al registrarla.';
comment on column plc_cargas_tanque.kits_usados is 'Los kits con que se registró el lote. Si difieren de kits, el supervisor los corrigió.';
comment on column plc_cargas_tanque.motivo_descarte is 'Por qué se descartó (carga de prueba, mal hecha, o se apagó la preparación con PLC).';

create table if not exists plc_cargas_ajustes (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references plc_cargas_tanque (id) on delete cascade,
  litros numeric not null check (litros > 0),
  iniciado_en timestamptz not null,
  hecho_en timestamptz,
  ajuste_volumen_id uuid references preparaciones_ajuste_volumen (id) on delete set null,
  no_sumado_motivo text
);
create unique index if not exists plc_ajustes_uno_abierto on plc_cargas_ajustes (carga_id) where hecho_en is null;
create index if not exists plc_ajustes_carga on plc_cargas_ajustes (carga_id);
alter table plc_cargas_ajustes enable row level security;

comment on table plc_cargas_ajustes is 'Ajustes de agua de la fase 3 (PLC_Ajuste_Agua): uno por cada vez que el valor vuelve a cero (20261115990000).';
comment on column plc_cargas_ajustes.litros is 'Último valor distinto de cero de PLC_Ajuste_Agua mientras duró el ajuste.';
comment on column plc_cargas_ajustes.hecho_en is 'Cuándo volvió a cero. Null = ajuste en curso.';
comment on column plc_cargas_ajustes.ajuste_volumen_id is 'La línea que se sumó al lote (preparaciones_ajuste_volumen, origen PLC).';
comment on column plc_cargas_ajustes.no_sumado_motivo is 'Por qué no se sumó (el lote ya estaba liberado).';

alter table preparaciones_ajuste_volumen add column if not exists origen text not null default 'MANUAL';
do $$ begin
  alter table preparaciones_ajuste_volumen add constraint preparaciones_ajuste_volumen_origen_check check (origen in ('MANUAL', 'PLC'));
exception when duplicate_object then null; end $$;
comment on column preparaciones_ajuste_volumen.origen is 'MANUAL (botón Ajustar) o PLC (ajuste de agua de la fase 3, 20261115990000).';

-- ------------------------------------------------------------
-- 4. Prender y apagar
-- ------------------------------------------------------------
-- Al apagar, las cargas que no se registraron se descartan y se dan por
-- terminadas: no reaparecen viejas al volver a encender, y si el PLC sigue con
-- una preparación, la próxima lectura después de encender abre una carga nueva.
create or replace function guardar_preparacion_plc(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area areas;
  v_usuario_id uuid;
  v_descartadas integer := 0;
begin
  perform public.exigir_usuario('guardar_preparacion_plc', p_usuario);
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  if p_activo is null then
    raise exception 'Falta indicar si se enciende o se apaga.';
  end if;
  select * into v_area from areas where codigo = p_area_codigo for update;
  if not found then
    raise exception 'Esa área no existe.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update areas
  set preparacion_plc = p_activo,
      preparacion_plc_desde = case when p_activo and not v_area.preparacion_plc then now() else preparacion_plc_desde end
  where id = v_area.id;

  if not p_activo then
    update plc_cargas_tanque
    set estado = 'DESCARTADA',
        descartada_en = now(),
        descartada_por = v_usuario_id,
        motivo_descarte = 'Se apagó la preparación con PLC.',
        terminada_en = coalesce(terminada_en, now())
    where area_id = v_area.id and estado in ('EN_CURSO', 'PENDIENTE');
    get diagnostics v_descartadas = row_count;
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparacion_plc', v_area.id::text, 'Edición de Datos',
    case when p_activo then 'Prendió' else 'Apagó' end || ' la preparación con PLC en ' || v_area.codigo,
    jsonb_build_object('preparacion_plc', v_area.preparacion_plc, 'desde', v_area.preparacion_plc_desde),
    jsonb_build_object('preparacion_plc', p_activo, 'cargas_descartadas', v_descartadas)
  );
end;
$$;
grant execute on function guardar_preparacion_plc(text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Lo que reporta el bridge
-- ------------------------------------------------------------
create or replace function plc_usuario_bridge_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from usuarios where usuario = 'plc-bridge';
$$;
revoke execute on function plc_usuario_bridge_id() from public, anon, authenticated;

/*
 * Suma un ajuste cerrado al lote de su carga, como el botón Ajustar
 * (ajustar_preparacion): volumen_l y volumen_inicial_l += litros, con una
 * línea en preparaciones_ajuste_volumen (origen PLC, a nombre del Bridge del
 * PLC) para el desglose y el Acta de Entrega.
 *   * Sin lote todavía: espera (se suma al registrar la carga).
 *   * Lote ya liberado o cerrado: no se suma, queda anotado. Salvo al
 *     registrar (p_al_confirmar): esos ajustes son parte de la preparación,
 *     aunque el lote nazca Listo (Vacío).
 *   * p_turno_id: el turno donde cae el ajuste. Null = el turno abierto del
 *     área, o el del lote si no hay ninguno abierto.
 */
create or replace function plc_aplicar_ajuste(p_ajuste_id uuid, p_turno_id uuid, p_al_confirmar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ajuste plc_cargas_ajustes;
  v_carga plc_cargas_tanque;
  v_lote preparaciones;
  v_turno uuid;
  v_linea uuid;
begin
  select * into v_ajuste from plc_cargas_ajustes where id = p_ajuste_id for update;
  if not found or v_ajuste.hecho_en is null or v_ajuste.ajuste_volumen_id is not null or v_ajuste.no_sumado_motivo is not null then
    return;
  end if;
  select * into v_carga from plc_cargas_tanque where id = v_ajuste.carga_id;
  if v_carga.preparacion_id is null then
    return;
  end if;
  select * into v_lote from preparaciones where id = v_carga.preparacion_id for update;
  if not found then
    return;
  end if;
  if (v_lote.liberado_en is not null or v_lote.cerrado_en is not null) and not coalesce(p_al_confirmar, false) then
    update plc_cargas_ajustes set no_sumado_motivo = 'El lote ya estaba liberado cuando terminó el ajuste.' where id = v_ajuste.id;
    return;
  end if;

  v_turno := coalesce(
    p_turno_id,
    (select t.id from turnos t where t.area_id = v_carga.area_id and t.estado = 'ABIERTO' order by t.created_at desc limit 1),
    v_lote.turno_id
  );

  update preparaciones
  set volumen_l = coalesce(volumen_l, 0) + v_ajuste.litros,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_ajuste.litros
  where id = v_lote.id;

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id, creado_en, origen)
  values (v_lote.id, v_turno, v_ajuste.litros, 'Ajuste de agua del PLC', plc_usuario_bridge_id(), v_ajuste.hecho_en, 'PLC')
  returning id into v_linea;
  update plc_cargas_ajustes set ajuste_volumen_id = v_linea where id = v_ajuste.id;

  perform registrar_auditoria(
    'plc-bridge', 'EDITAR', 'preparaciones', v_lote.id::text, 'Preparación (PLC)',
    format('Ajuste de agua del PLC · Tanque %s%s · +%s L', v_lote.numero_tanque, coalesce(' · Lote ' || v_lote.lote, ''), v_ajuste.litros),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', coalesce(v_lote.volumen_l, 0) + v_ajuste.litros,
                       'volumen_inicial_l', coalesce(v_lote.volumen_inicial_l, 0) + v_ajuste.litros)
  );
end;
$$;
revoke execute on function plc_aplicar_ajuste(uuid, uuid, boolean) from public, anon, authenticated;

-- Cierra el ajuste abierto de una carga (si hay) y lo suma si ya tiene lote.
create or replace function plc_cerrar_ajuste(p_carga_id uuid, p_momento timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update plc_cargas_ajustes set hecho_en = p_momento
  where carga_id = p_carga_id and hecho_en is null
  returning id into v_id;
  if v_id is not null then
    perform plc_aplicar_ajuste(v_id, null, false);
  end if;
end;
$$;
revoke execute on function plc_cerrar_ajuste(uuid, timestamptz) from public, anon, authenticated;

-- PREPARACION bajó (o el PLC pasó a otro tanque): la carga queda terminada.
create or replace function plc_terminar_carga(p_carga_id uuid, p_momento timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform plc_cerrar_ajuste(p_carga_id, p_momento);
  update plc_cargas_tanque
  set terminada_en = p_momento,
      estado = case when estado = 'EN_CURSO' then 'PENDIENTE' else estado end,
      kits_listos_en = case when kits is not null and kits_listos_en is null then p_momento else kits_listos_en end,
      ultima_lectura_en = greatest(ultima_lectura_en, p_momento)
  where id = p_carga_id;
end;
$$;
revoke execute on function plc_terminar_carga(uuid, timestamptz) from public, anon, authenticated;

/*
 * El bridge reporta una LECTURA completa del PLC cada vez que algo cambia, y
 * una por minuto (plc-bridge/src/cargas.js):
 *   {momento, tanque, preparacion, fase_1, fase_2, fase_3, kits, ajuste_l, setpoint_l}
 * Esta función decide. Repetir una lectura no cambia nada: dos bridges
 * leyendo el mismo PLC no duplican cargas ni ajustes.
 *   * PREPARACION sube: abre la carga del tanque (una sola abierta por área).
 *     Si llega otro tanque sin que haya bajado, termina la anterior.
 *   * Kits (admite medios): se anotan mientras no estén listos; quedan listos
 *     al bajar la fase 2, con el PLC ya en la fase 3, o al terminar.
 *     PLC_Nro_Kits vuelve a cero al terminar: un 0 nunca pisa los kits.
 *   * Ajuste: mayor que 0 abre (o actualiza) el ajuste en curso; 0 lo cierra
 *     y, si la carga ya tiene lote, lo suma. Null = sin dato: no cierra nada.
 *   * PREPARACION baja: la carga queda PENDIENTE con la hora del operador.
 * Un momento en el futuro (reloj adelantado) se guarda como ahora.
 */
create or replace function registrar_carga_plc(p_usuario text, p_area_codigo text, p_lectura jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area areas;
  v_momento timestamptz;
  v_tanque smallint;
  v_prep boolean;
  v_f2 boolean;
  v_f3 boolean;
  v_kits numeric;
  v_ajuste numeric;
  v_setpoint numeric;
  v_carga plc_cargas_tanque;
  v_abierto plc_cargas_ajustes;
begin
  perform public.exigir_usuario('registrar_carga_plc', p_usuario);
  if not tiene_permiso(p_usuario, 'PLC_CARGAR') then
    raise exception 'No tienes permiso para registrar cargas del PLC.';
  end if;
  select * into v_area from areas where codigo = p_area_codigo;
  if not found then
    raise exception 'Esa área no existe.';
  end if;
  if not v_area.preparacion_plc then
    return jsonb_build_object('habilitado', false, 'carga_id', null, 'estado', null);
  end if;
  if p_lectura is null or jsonb_typeof(p_lectura -> 'preparacion') is distinct from 'boolean' then
    raise exception 'La lectura del PLC no trae PREPARACION.';
  end if;

  -- Una lectura a la vez por área (dos bridges, o reintentos que se cruzan).
  perform pg_advisory_xact_lock(hashtextextended('plc_cargas|' || v_area.id::text, 0));

  v_momento := least(coalesce((p_lectura ->> 'momento')::timestamptz, now()), now());
  v_tanque := case when (p_lectura ->> 'tanque') ~ '^[123]$' then (p_lectura ->> 'tanque')::smallint end;
  v_prep := (p_lectura ->> 'preparacion')::boolean;
  v_f2 := coalesce((p_lectura ->> 'fase_2')::boolean, false);
  v_f3 := coalesce((p_lectura ->> 'fase_3')::boolean, false);
  -- Kits o ajuste negativos son basura del PLC: sin dato.
  v_kits := case when (p_lectura ->> 'kits')::numeric > 0 then (p_lectura ->> 'kits')::numeric end;
  v_ajuste := case when (p_lectura ->> 'ajuste_l')::numeric >= 0 then (p_lectura ->> 'ajuste_l')::numeric end;
  v_setpoint := case when (p_lectura ->> 'setpoint_l')::numeric > 0 then (p_lectura ->> 'setpoint_l')::numeric end;

  select * into v_carga from plc_cargas_tanque where area_id = v_area.id and terminada_en is null for update;

  if v_prep and v_tanque is not null then
    if v_carga.id is not null and v_carga.numero_tanque <> v_tanque then
      perform plc_terminar_carga(v_carga.id, v_momento);
      v_carga := null;
    end if;
    if v_carga.id is null then
      insert into plc_cargas_tanque (area_id, numero_tanque, agua_formula_l, iniciada_en, ultima_lectura_en)
      values (v_area.id, v_tanque, v_setpoint, v_momento, v_momento)
      returning * into v_carga;
    end if;

    update plc_cargas_tanque c
    set agua_formula_l = coalesce(c.agua_formula_l, v_setpoint),
        kits = case when c.kits_listos_en is null and v_kits is not null then v_kits else c.kits end,
        fase_2_vista = c.fase_2_vista or v_f2,
        ultima_lectura_en = greatest(c.ultima_lectura_en, v_momento)
    where c.id = v_carga.id
    returning * into v_carga;

    if v_carga.kits is not null and v_carga.kits_listos_en is null and not v_f2 and (v_carga.fase_2_vista or v_f3) then
      update plc_cargas_tanque set kits_listos_en = v_momento where id = v_carga.id
      returning * into v_carga;
    end if;

    if v_ajuste is not null then
      select * into v_abierto from plc_cargas_ajustes where carga_id = v_carga.id and hecho_en is null for update;
      if v_ajuste > 0 then
        if v_abierto.id is null then
          insert into plc_cargas_ajustes (carga_id, litros, iniciado_en) values (v_carga.id, v_ajuste, v_momento);
        elsif v_abierto.litros <> v_ajuste then
          update plc_cargas_ajustes set litros = v_ajuste where id = v_abierto.id;
        end if;
      elsif v_abierto.id is not null then
        perform plc_cerrar_ajuste(v_carga.id, v_momento);
      end if;
    end if;
  elsif not v_prep and v_carga.id is not null then
    perform plc_terminar_carga(v_carga.id, v_momento);
    select * into v_carga from plc_cargas_tanque where id = v_carga.id;
  end if;

  return jsonb_build_object('habilitado', true, 'carga_id', v_carga.id, 'estado', v_carga.estado);
end;
$$;
grant execute on function registrar_carga_plc(text, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- Final: control de usuario en las funciones con p_usuario
-- ------------------------------------------------------------
select * from asegurar_control_usuario();
