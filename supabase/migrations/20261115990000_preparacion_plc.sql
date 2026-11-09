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
-- Final: control de usuario en las funciones con p_usuario
-- ------------------------------------------------------------
select * from asegurar_control_usuario();
