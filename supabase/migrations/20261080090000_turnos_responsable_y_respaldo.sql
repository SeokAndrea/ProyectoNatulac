-- ============================================================
-- TURNOS: responsable, relevo, respaldo automático y esquema 12x12
-- ============================================================
-- Rework 2026-09-27. La normalidad sigue igual: el supervisor finaliza y
-- el siguiente inicia ("asume") su turno. Lo nuevo:
--
--   * RESPONSABLE Y RELEVO: turno_responsables guarda quién estuvo a cargo
--     del turno y de qué hora a qué hora. En 12x12, el turno 2 tiene relevo
--     a las 19:00 (A → B). turnos.supervisor_id pasa a ser el responsable
--     ACTUAL (el último).
--   * RESPALDO: si a la hora de inicio de un turno + 30 min nadie hizo el
--     relevo, el cron cierra el turno viejo y abre el nuevo "Sin
--     responsable", listo para que cualquiera con TURNO_ASUMIR lo asuma.
--     Solo en áreas con areas.turnos_automaticos (lo prende el dueño).
--   * ENTREGA AUTOMÁTICA: cuando un turno se cierra porque se abre otro,
--     las corridas activas sin entregar se ENTREGAN solas (siguen activas
--     en el turno nuevo) en vez de sellarse. El PT del tramo que faltaba
--     se carga en la gracia o por corrección; el acta lo marca.
--   * GRUPO: el turno automático nace sin grupo (código sin G) y el grupo
--     se elige al asumirlo.
--   * ESQUEMA 3x8 / 12x12 por área (permiso ESQUEMA_TURNOS), con historial.
--     Se guarda como 3 turnos normales; cada turno guarda su esquema al
--     abrirse. El tipo 12X12 ya no se inicia.
--
-- "Sin responsable" es un usuario interno (usuario 'sistema', inactivo, no
-- puede entrar) para no tocar las consultas que unen turnos.supervisor_id
-- con usuarios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Esquema
-- ------------------------------------------------------------
alter table areas add column esquema_turnos text not null default '3x8' check (esquema_turnos in ('3x8', '12x12'));
alter table areas add column turnos_automaticos boolean not null default false;

alter table turnos add column esquema text not null default '3x8' check (esquema in ('3x8', '12x12'));
alter table turnos add column apertura_automatica boolean not null default false;
alter table turnos add column grupo_pendiente boolean not null default false;

alter table turno_lineas add column entrega_automatica boolean not null default false;

create table turno_responsables (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  usuario_id uuid not null references usuarios (id),
  motivo text not null check (motivo in ('INICIO', 'ASUMIR', 'RELEVO')),
  desde timestamptz not null default now(),
  hasta timestamptz
);

create index turno_responsables_turno_idx on turno_responsables (turno_id, desde);
alter table turno_responsables enable row level security;

create table esquema_turnos_historial (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id),
  esquema text not null,
  cambiado_por uuid references usuarios (id),
  cambiado_en timestamptz not null default now()
);

alter table esquema_turnos_historial enable row level security;

insert into usuarios (usuario, password_hash, nombre, activo, debe_completar_perfil)
values ('sistema', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), 'Sin responsable', false, false)
on conflict (usuario) do nothing;

insert into usuario_roles (usuario_id, rol_id)
select u.id, r.id from usuarios u, roles r
where u.usuario = 'sistema' and r.codigo = 'SUPERVISOR'
  and not exists (select 1 from usuario_roles ur where ur.usuario_id = u.id);

create or replace function usuario_sistema_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from usuarios where usuario = 'sistema';
$$;

-- Responsable inicial de los turnos que ya están abiertos hoy.
insert into turno_responsables (turno_id, usuario_id, motivo, desde)
select t.id, t.supervisor_id, 'INICIO', (t.fecha + t.hora_inicio) at time zone 'America/Caracas'
from turnos t
where t.estado = 'ABIERTO';

-- ------------------------------------------------------------
-- 2. Horario: qué turno corresponde a una hora de planta.
-- ------------------------------------------------------------
create or replace function turno_de_hora(p_ahora timestamp, out tipo_codigo text, out fecha date, out inicio timestamp)
language plpgsql
stable
set search_path = public
as $$
declare
  v_h time := p_ahora::time;
begin
  if v_h >= '07:00' and v_h < '15:00' then
    tipo_codigo := 'TURNO_1';
    fecha := p_ahora::date;
    inicio := p_ahora::date + time '07:00';
  elsif v_h >= '15:00' and v_h < '22:30' then
    tipo_codigo := 'TURNO_2';
    fecha := p_ahora::date;
    inicio := p_ahora::date + time '15:00';
  elsif v_h >= '22:30' then
    tipo_codigo := 'TURNO_3';
    fecha := p_ahora::date;
    inicio := p_ahora::date + time '22:30';
  else
    -- Madrugada: el turno 3 empezó el día anterior.
    tipo_codigo := 'TURNO_3';
    fecha := p_ahora::date - 1;
    inicio := (p_ahora::date - 1) + time '22:30';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Entrega automática de las corridas activas de un turno que se
--    cierra porque se abre otro.
-- ------------------------------------------------------------
create or replace function entregar_corridas_automatico(p_turno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set entregada_en = now(), entregada_por = usuario_sistema_id(),
      confirmado_fin_en = coalesce(confirmado_fin_en, now()), confirmado_fin_por = coalesce(confirmado_fin_por, usuario_sistema_id()),
      entrega_automatica = true
  where turno_id = p_turno_id and activa and entregada_en is null;
end;
$$;

-- Código de turno libre: agrega _2, _3... si ya existe (ej. dos turnos automáticos en la misma franja).
create or replace function codigo_turno_libre(p_base text, p_excluir uuid default null)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_codigo text := p_base;
  v_n integer := 1;
begin
  while exists (select 1 from turnos where codigo = v_codigo and id is distinct from p_excluir) loop
    v_n := v_n + 1;
    v_codigo := p_base || '_' || v_n;
  end loop;
  return v_codigo;
end;
$$;

-- ------------------------------------------------------------
-- 4. abrir_turno(): el cuerpo de iniciar_turno (20261055) separado del
--    login, para que lo usen el inicio manual y el respaldo del cron.
--    Cambios: entrega automática antes del cierre forzado del anterior,
--    esquema del área, responsable inicial y turno sin grupo si es
--    automático.
-- ------------------------------------------------------------
create or replace function abrir_turno(
  p_supervisor_id uuid,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text,
  p_automatico boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid := p_supervisor_id;
  v_area_id uuid;
  v_esquema text;
  v_turno_tipo_id uuid;
  v_grupo_id uuid;
  v_turno_id uuid;
  v_codigo text;
  v_turno_anterior_id uuid;
  v_i integer;
  v_hora_inicio_nominal time;
  v_hora_fin_nominal time;
  v_ahora_planta timestamp := now() at time zone 'America/Caracas';
  v_fecha date := v_ahora_planta::date;
  v_hora_inicio time := v_ahora_planta::time;
begin
  select id, esquema_turnos into v_area_id, v_esquema from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  select id, hora_inicio, hora_fin
    into v_turno_tipo_id, v_hora_inicio_nominal, v_hora_fin_nominal
  from turno_tipos where codigo = p_turno_tipo_codigo;
  if v_turno_tipo_id is null or v_hora_inicio_nominal is null then
    raise exception 'Turno % no válido. El 12x12 se trabaja como turnos 1, 2 y 3 con relevo.', p_turno_tipo_codigo;
  end if;
  select id into v_grupo_id from grupos where codigo = p_grupo_codigo;
  if v_grupo_id is null then
    raise exception 'Grupo % no existe', p_grupo_codigo;
  end if;

  -- Turno que cruza medianoche + activado en la cola de la madrugada
  -- => la fecha operativa es la del día anterior.
  if v_hora_fin_nominal < v_hora_inicio_nominal and v_hora_inicio < v_hora_fin_nominal then
    v_fecha := v_fecha - 1;
  end if;

  v_codigo := left(p_area_codigo, 1) || to_char(v_fecha, 'YYYYMMDD') || '_T' || replace(p_turno_tipo_codigo, 'TURNO_', '');
  if not p_automatico then
    v_codigo := v_codigo || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');
  end if;
  v_codigo := codigo_turno_libre(v_codigo);

  insert into turnos (
    codigo, area_id, supervisor_id, turno_tipo_id, grupo_id, fecha, hora_inicio, esquema, apertura_automatica, grupo_pendiente
  )
  values (
    v_codigo, v_area_id, v_supervisor_id, v_turno_tipo_id, v_grupo_id, v_fecha, v_hora_inicio, v_esquema, p_automatico, p_automatico
  )
  returning id into v_turno_id;

  if v_supervisor_id is distinct from usuario_sistema_id() then
    insert into turno_responsables (turno_id, usuario_id, motivo) values (v_turno_id, v_supervisor_id, 'INICIO');
  end if;

  select t2.id into v_turno_anterior_id
  from turnos t2
  where t2.area_id = v_area_id and t2.id <> v_turno_id
  order by t2.fecha desc, t2.hora_inicio desc, t2.created_at desc
  limit 1;

  -- Relevo sin finalizar: si el turno anterior del área sigue ABIERTO, se
  -- cierra solo. Antes, sus corridas activas se ENTREGAN (no se sellan):
  -- la línea sigue corriendo en la planta y el turno nuevo la hereda.
  if v_turno_anterior_id is not null then
    if exists (select 1 from turnos where id = v_turno_anterior_id and estado = 'ABIERTO') then
      perform entregar_corridas_automatico(v_turno_anterior_id);
      update turno_responsables set hasta = now() where turno_id = v_turno_anterior_id and hasta is null;
    end if;
    perform cerrar_turno_forzado(v_turno_anterior_id, v_ahora_planta);
  end if;

  if v_turno_anterior_id is not null then
    insert into turno_lineas (
      turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
      pausada_en, lote_terminado_en
    )
    select v_turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, true, activada_en, activada_por, actualizada_por,
      pausada_en, lote_terminado_en
    from turno_lineas
    where turno_id = v_turno_anterior_id and activa;

    insert into recepcion_tanques (
      turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    )
    select v_turno_id, numero_tanque, sabor_id, condicion, volumen_l, lote, lote_id, activada_en, ultimo_sabor_id, ultimo_lote, actualizada_por,
      cip_iniciado_en, cip_finalizado_en
    from recepcion_tanques
    where turno_id = v_turno_anterior_id;

    insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por)
    select v_turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, actualizada_por
    from lineas_estado
    where turno_id = v_turno_anterior_id;
  else
    for v_i in 1..3 loop
      insert into recepcion_tanques (turno_id, numero_tanque, condicion)
      values (v_turno_id, v_i, 'LIMPIO');
    end loop;

    insert into lineas_estado (turno_id, linea_id)
    select v_turno_id, id from lineas where area_id = v_area_id and activo;
  end if;

  -- Área de Pruebas: sin ceremonia (ver 20261055).
  if p_area_codigo = 'PRUEBAS' then
    update recepcion_tanques
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and confirmado_inicio_en is null;

    update turno_lineas
    set confirmado_inicio_en = now(), confirmado_inicio_por = v_supervisor_id
    where turno_id = v_turno_id and activa and confirmado_inicio_en is null;
  end if;

  return v_turno_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. iniciar_turno(): inicio manual (día normal). Misma firma de siempre.
-- ------------------------------------------------------------
create or replace function iniciar_turno(
  p_usuario text,
  p_area_codigo text,
  p_turno_tipo_codigo text,
  p_grupo_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor_id uuid;
begin
  select id into v_supervisor_id from usuarios where usuario = lower(p_usuario);
  if v_supervisor_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;
  if not tiene_permiso(p_usuario, 'TURNO_ASUMIR') then
    raise exception 'No tienes permiso para iniciar turnos.';
  end if;

  -- Si el respaldo ya abrió el turno de esta franja, se asume ese (no se abre otro).
  if exists (
    select 1 from turnos t join areas a on a.id = t.area_id
    where a.codigo = p_area_codigo and t.estado = 'ABIERTO' and t.supervisor_id = usuario_sistema_id()
  ) then
    raise exception 'Ya hay un turno abierto sin responsable. Asúmelo en vez de iniciar otro.';
  end if;

  return turno_json(abrir_turno(v_supervisor_id, p_area_codigo, p_turno_tipo_codigo, p_grupo_codigo, false));
end;
$$;

grant execute on function iniciar_turno(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. asumir_turno(): tomar un turno ABIERTO del área. Si no tenía
--    responsable, lo asume (y elige el grupo si falta); si tenía otro
--    responsable, es un relevo (ej. 12x12 a las 19:00).
-- ------------------------------------------------------------
create or replace function asumir_turno(p_usuario text, p_turno_id uuid, p_grupo_codigo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area text;
  v_turno turnos;
  v_turno_area text;
  v_grupo_id uuid;
  v_base text;
  v_motivo text;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  if v_usuario_id is null then
    raise exception 'Usuario % no existe', p_usuario;
  end if;
  if not tiene_permiso(p_usuario, 'TURNO_ASUMIR') then
    raise exception 'No tienes permiso para asumir turnos.';
  end if;

  select * into v_turno from turnos where id = p_turno_id for update;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'ABIERTO' then
    raise exception 'El turno ya está cerrado.';
  end if;

  select a.codigo into v_turno_area from areas a where a.id = v_turno.area_id;
  select area_codigo into v_area from rol_y_area_de(p_usuario);
  if v_area is not null and v_area <> v_turno_area and v_area <> 'PRUEBAS' then
    raise exception 'Ese turno es de otra área.';
  end if;

  if v_turno.grupo_pendiente then
    select id into v_grupo_id from grupos where codigo = p_grupo_codigo;
    if v_grupo_id is null then
      raise exception 'Elige el grupo del turno.';
    end if;
    v_base := left(v_turno_area, 1) || to_char(v_turno.fecha, 'YYYYMMDD') || '_T'
      || replace((select codigo from turno_tipos where id = v_turno.turno_tipo_id), 'TURNO_', '')
      || 'G' || replace(p_grupo_codigo, 'GRUPO_', '');
    update turnos
    set grupo_id = v_grupo_id, grupo_pendiente = false, codigo = codigo_turno_libre(v_base, v_turno.id)
    where id = v_turno.id;
  end if;

  if v_turno.supervisor_id is distinct from v_usuario_id then
    v_motivo := case when v_turno.supervisor_id = usuario_sistema_id() then 'ASUMIR' else 'RELEVO' end;
    update turno_responsables set hasta = now() where turno_id = v_turno.id and hasta is null;
    insert into turno_responsables (turno_id, usuario_id, motivo) values (v_turno.id, v_usuario_id, v_motivo);
    update turnos set supervisor_id = v_usuario_id where id = v_turno.id;

    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'turno', v_turno.id::text, 'Comenzar Turno',
      case when v_motivo = 'ASUMIR' then 'Asumió el turno ' else 'Tomó el relevo del turno ' end
        || (select codigo from turnos where id = v_turno.id),
      null, null
    );
  end if;

  return turno_json(v_turno.id);
end;
$$;

grant execute on function asumir_turno(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Respaldo del cron: turno de la franja actual sin abrir 30 min
--    después de su inicio => se abre solo, sin responsable.
-- ------------------------------------------------------------
create or replace function relevo_de_respaldo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := now() at time zone 'America/Caracas';
  v_franja record;
  v_area record;
  v_abierto turnos;
  v_grupo text;
begin
  select * into v_franja from turno_de_hora(v_ahora);
  if v_ahora < v_franja.inicio + interval '30 minutes' then
    return;
  end if;

  for v_area in select id, codigo from areas where turnos_automaticos and codigo <> 'PRUEBAS' loop
    select t.* into v_abierto from turnos t
    where t.area_id = v_area.id and t.estado = 'ABIERTO'
    order by t.created_at desc limit 1;

    -- Ya hay un turno abierto de esta franja: nada que hacer.
    if v_abierto.id is not null
       and v_abierto.fecha = v_franja.fecha
       and (select codigo from turno_tipos where id = v_abierto.turno_tipo_id) = v_franja.tipo_codigo then
      continue;
    end if;

    -- Un turno de esta franja ya se abrió y se finalizó: no se reabre.
    if v_abierto.id is null and exists (
      select 1 from turnos t join turno_tipos tt on tt.id = t.turno_tipo_id
      where t.area_id = v_area.id and t.fecha = v_franja.fecha and tt.codigo = v_franja.tipo_codigo
    ) then
      continue;
    end if;

    -- Grupo provisorio (el real se elige al asumir): el del último turno.
    select g.codigo into v_grupo from turnos t join grupos g on g.id = t.grupo_id
    where t.area_id = v_area.id order by t.created_at desc limit 1;

    perform abrir_turno(usuario_sistema_id(), v_area.codigo, v_franja.tipo_codigo, coalesce(v_grupo, 'GRUPO_1'), true);
  end loop;
end;
$$;

-- El cierre por vencimiento de siempre deja de tocar las áreas con respaldo:
-- ahí el turno viejo se cierra cuando se abre el nuevo (con entrega automática).
create or replace function cerrar_turnos_vencidos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ahora timestamp := (now() at time zone 'America/Caracas');
  v_turno_id uuid;
begin
  for v_turno_id in
    select t.id
    from turnos t
    join turno_tipos tt on tt.id = t.turno_tipo_id
    join areas a on a.id = t.area_id
    where t.estado = 'ABIERTO'
      and a.codigo <> 'PRUEBAS'
      and not a.turnos_automaticos
      and tt.hora_inicio is not null
      and tt.hora_fin is not null
      and ((t.fecha + (case when tt.hora_fin <= tt.hora_inicio then 1 else 0 end)) + tt.hora_fin + interval '30 minutes') < v_ahora
  loop
    perform cerrar_turno_forzado(v_turno_id, v_ahora);
  end loop;
end;
$$;

select cron.schedule('relevo-de-respaldo', '*/5 * * * *', $$select relevo_de_respaldo();$$);

-- ------------------------------------------------------------
-- 8. Ajustes de turnos por área.
-- ------------------------------------------------------------
create or replace function ajustes_turnos(p_area_codigo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('esquema', esquema_turnos, 'turnos_automaticos', turnos_automaticos)
  from areas where codigo = p_area_codigo;
$$;

grant execute on function ajustes_turnos(text) to anon, authenticated;

create or replace function guardar_esquema_turnos(p_usuario text, p_area_codigo text, p_esquema text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes text;
begin
  if not tiene_permiso(p_usuario, 'ESQUEMA_TURNOS') then
    raise exception 'No tienes permiso para cambiar el esquema de turnos.';
  end if;
  if p_esquema not in ('3x8', '12x12') then
    raise exception 'Esquema no válido.';
  end if;
  select id, esquema_turnos into v_area_id, v_antes from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  if v_antes = p_esquema then
    return;
  end if;

  update areas set esquema_turnos = p_esquema where id = v_area_id;
  insert into esquema_turnos_historial (area_id, esquema, cambiado_por)
  values (v_area_id, p_esquema, (select id from usuarios where usuario = lower(p_usuario)));

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'esquema_turnos', v_area_id::text, 'Comenzar Turno',
    'Cambió el esquema de turnos de ' || p_area_codigo || ' a ' || p_esquema || ' (aplica desde el próximo turno)',
    jsonb_build_object('esquema', v_antes), jsonb_build_object('esquema', p_esquema)
  );
end;
$$;

grant execute on function guardar_esquema_turnos(text, text, text) to anon, authenticated;

create or replace function guardar_turnos_automaticos(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
begin
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  select id into v_area_id from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Área % no existe', p_area_codigo;
  end if;
  update areas set turnos_automaticos = p_activo where id = v_area_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turnos_automaticos', v_area_id::text, 'Comenzar Turno',
    case when p_activo then 'Prendió' else 'Apagó' end || ' el respaldo automático de turnos de ' || p_area_codigo,
    null, jsonb_build_object('turnos_automaticos', p_activo)
  );
end;
$$;

grant execute on function guardar_turnos_automaticos(text, text, boolean) to anon, authenticated;

-- Aséptico arranca con el respaldo prendido (decisión 2026-09-27).
update areas set turnos_automaticos = true where codigo = 'ASEPTICO';

-- ------------------------------------------------------------
-- 9. Al cerrarse un turno (finalizar, cierre forzado o cron), se cierra
--    el tramo del responsable que estaba a cargo.
-- ------------------------------------------------------------
create or replace function fn_turno_cerrado_cierra_responsable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'CERRADO' and old.estado = 'ABIERTO' then
    update turno_responsables set hasta = now() where turno_id = new.id and hasta is null;
  end if;
  return new;
end;
$$;

create trigger trg_turno_cerrado_cierra_responsable
after update of estado on turnos
for each row execute function fn_turno_cerrado_cierra_responsable();

-- ------------------------------------------------------------
-- 10. turno_json(): suma responsable, relevos, grupo pendiente, esquema
--     y entrega automática de cada corrida.
-- ------------------------------------------------------------
-- Última versión: 20261049090000_ajustes_volumen_turno_correcto_y_en_acta.sql
create or replace function turno_json(p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'estado', t.estado,
    'fecha_fin', t.fecha_fin,
    'hora_fin', t.hora_fin,
    'cierre_automatico', t.cierre_automatico,
    'volumenes_lote_cierre', t.volumenes_lote_cierre,
    'tanques_encontrados', t.tanques_encontrados,
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', g.codigo,
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
    'sin_responsable', u.usuario = 'sistema',
    'grupo_pendiente', t.grupo_pendiente,
    'apertura_automatica', t.apertura_automatica,
    'esquema', t.esquema,
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario', ru.usuario,
        'nombre', ru.nombre,
        'motivo', tr.motivo,
        'desde', tr.desde,
        'hasta', tr.hasta
      ) order by tr.desde)
      from turno_responsables tr
      join usuarios ru on ru.id = tr.usuario_id
      where tr.turno_id = t.id
    ), '[]'::jsonb),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tl.id,
        'linea_codigo', l.codigo,
        'presentacion_volumen_ml', p.volumen_ml,
        'envases_hora', tl.envases_hora,
        'litros_hora', tl.litros_hora,
        'sabor_id', tl.sabor_id,
        'sabor_nombre', sabor_display(sl.nombre, fsl.nombre),
        'lote', tl.lote,
        'lote_id', tl.lote_id,
        'activa', tl.activa,
        'activada_en', tl.activada_en,
        'pausada_en', tl.pausada_en,
        'lote_terminado_en', tl.lote_terminado_en,
        'entregada_en', tl.entregada_en,
        'entrega_automatica', tl.entrega_automatica,
        'finalizada_en', tl.finalizada_en,
        'confirmado_inicio_en', tl.confirmado_inicio_en
      ) order by tl.activada_en)
      from turno_lineas tl
      join lineas l on l.id = tl.linea_id
      left join presentaciones p on p.id = tl.presentacion_id
      left join sabores sl on sl.id = tl.sabor_id
      left join familias_producto fsl on fsl.id = sl.familia_id
      where tl.turno_id = t.id
    ), '[]'::jsonb),
    'lineas_estado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'linea_codigo', l4.codigo,
        'condicion', le.condicion,
        'activada_en', le.activada_en,
        'cip_iniciado_en', le.cip_iniciado_en,
        'cip_finalizado_en', le.cip_finalizado_en,
        'observacion', le.observacion
      ) order by l4.codigo)
      from lineas_estado le
      join lineas l4 on l4.id = le.linea_id
      where le.turno_id = t.id
    ), '[]'::jsonb),
    'tanques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero_tanque', rt.numero_tanque,
        'sabor_id', rt.sabor_id,
        'sabor_nombre', sabor_display(s.nombre, fs.nombre),
        'condicion', rt.condicion,
        'volumen_l', volumen_vivo_tanque(t.id, rt.numero_tanque),
        'volumen_inicial_l', prep_t.volumen_inicial_l,
        'lote', rt.lote,
        'activada_en', rt.activada_en,
        'ultimo_sabor_id', rt.ultimo_sabor_id,
        'ultimo_sabor_nombre', sabor_display(us.nombre, fus.nombre),
        'ultimo_lote', rt.ultimo_lote,
        'confirmado_inicio_en', rt.confirmado_inicio_en,
        'confirmado_fin_en', rt.confirmado_fin_en,
        'cip_iniciado_en', rt.cip_iniciado_en,
        'cip_finalizado_en', rt.cip_finalizado_en
      ) order by rt.numero_tanque)
      from recepcion_tanques rt
      left join sabores s on s.id = rt.sabor_id
      left join familias_producto fs on fs.id = s.familia_id
      left join sabores us on us.id = rt.ultimo_sabor_id
      left join familias_producto fus on fus.id = us.familia_id
      left join preparaciones prep_t on prep_t.id = rt.lote_id
      where rt.turno_id = t.id
    ), '[]'::jsonb),
    'contadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'linea_codigo', l2.codigo,
        'turno_linea_id', c.turno_linea_id,
        'envases_llenadora', c.envases_llenadora,
        'envases_buenos', c.envases_buenos,
        'justificacion', c.justificacion,
        'creado_en', c.created_at
      ) order by c.created_at desc)
      from contadores c
      join lineas l2 on l2.id = c.linea_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
    'producto_terminado', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id,
        'linea_codigo', l3.codigo,
        'turno_linea_id', pt.turno_linea_id,
        'sabor_id', pt.sabor_id,
        'sabor_nombre', sabor_display(s2.nombre, fs2.nombre),
        'presentacion_volumen_ml', p3.volumen_ml,
        'paletas', pt.paletas,
        'cajas_sueltas', pt.cajas_sueltas,
        'litros_producidos', pt.litros_producidos,
        'creado_en', pt.updated_at,
        'registrado_por_nombre', ru.nombre
      ) order by pt.updated_at desc)
      from producto_terminado pt
      join lineas l3 on l3.id = pt.linea_id
      join presentaciones p3 on p3.id = pt.presentacion_id
      left join sabores s2 on s2.id = pt.sabor_id
      left join familias_producto fs2 on fs2.id = s2.familia_id
      left join usuarios ru on ru.id = pt.usuario_id
      where pt.turno_id = t.id
    ), '[]'::jsonb),
    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prep.id,
        'turno_id', prep.turno_id,
        'numero_tanque', prep.numero_tanque,
        'sabor_id', prep.sabor_id,
        'sabor_nombre', sabor_display(s3.nombre, fs3.nombre),
        'lote', prep.lote,
        'volumen_l', case
          when t.estado = 'CERRADO' and jsonb_exists(t.volumenes_lote_cierre, prep.id::text)
          then (t.volumenes_lote_cierre ->> prep.id::text)::numeric
          else prep.volumen_l
        end,
        'volumen_inicial_l', prep.volumen_inicial_l,
        'volumen_l_inicio', case
          when prep.turno_id = t.id then prep.volumen_inicial_l
          when t.volumenes_lote_inicio is not null and jsonb_exists(t.volumenes_lote_inicio, prep.id::text)
            then (t.volumenes_lote_inicio ->> prep.id::text)::numeric
          else coalesce((
            select (tc.volumenes_lote_cierre ->> prep.id::text)::numeric
            from turnos tc
            where tc.area_id = t.area_id
              and tc.id <> t.id
              and tc.estado = 'CERRADO'
              and tc.volumenes_lote_cierre is not null
              and jsonb_exists(tc.volumenes_lote_cierre, prep.id::text)
              and (tc.fecha < t.fecha
                   or (tc.fecha = t.fecha and coalesce(tc.hora_fin, tc.hora_inicio) <= t.hora_inicio))
            order by tc.fecha desc, coalesce(tc.hora_fin, tc.hora_inicio) desc, tc.created_at desc
            limit 1
          ), prep.volumen_inicial_l)
        end,
        'tambores', prep.tambores,
        'agua', prep.agua,
        'azucar', prep.azucar,
        'acido_citrico', prep.acido_citrico,
        'creado_en', prep.created_at,
        'liberado_en', prep.liberado_en,
        'cerrado_en', prep.cerrado_en
      ) order by prep.created_at desc)
      from preparaciones prep
      left join sabores s3 on s3.id = prep.sabor_id
      left join familias_producto fs3 on fs3.id = s3.familia_id
      where prep.turno_id = t.id
         or (
           prep.cerrado_en is null
           and exists (
             select 1 from turnos t_prep
             where t_prep.id = prep.turno_id and t_prep.area_id = t.area_id
           )
         )
         or prep.id in (
           select tl.lote_id from turno_lineas tl
           where tl.turno_id = t.id and tl.lote_id is not null
         )
    ), '[]'::jsonb),
    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'litros', tr.litros,
        'modo', tr.modo,
        'lote_id_origen', tr.lote_id_origen,
        'lote_id_destino', tr.lote_id_destino,
        'creado_en', tr.creado_en
      ) order by tr.creado_en)
      from transferencias tr
      where tr.turno_id = t.id
    ), '[]'::jsonb),
    'desvases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'litros', d.litros,
        'lote_id_origen', d.lote_id_origen,
        'creado_en', d.creado_en
      ) order by d.creado_en)
      from desvases d
      where d.turno_id_origen = t.id
    ), '[]'::jsonb),
    'novedades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'texto', n.texto,
        'creado_en', n.creado_en,
        'creado_por_nombre', nu.nombre
      ) order by n.creado_en)
      from turno_novedades n
      left join usuarios nu on nu.id = n.usuario_id
      where n.turno_id = t.id
    ), '[]'::jsonb),
    'ajustes_volumen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', av.id,
        'lote_id', av.lote_id,
        'numero_tanque', avp.numero_tanque,
        'lote', avp.lote,
        'sabor_nombre', sabor_display(avs.nombre, avfs.nombre),
        'litros', av.litros,
        'detalle', av.detalle,
        'creado_en', av.creado_en,
        'usuario_nombre', avu.nombre
      ) order by av.creado_en)
      from preparaciones_ajuste_volumen av
      join preparaciones avp on avp.id = av.lote_id
      left join sabores avs on avs.id = avp.sabor_id
      left join familias_producto avfs on avfs.id = avs.familia_id
      left join usuarios avu on avu.id = av.usuario_id
      where av.turno_id = t.id
    ), '[]'::jsonb)
  ) into v_result
  from turnos t
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join grupos g on g.id = t.grupo_id
  join usuarios u on u.id = t.supervisor_id
  where t.id = p_turno_id;

  return v_result;
end;
$$;

-- listar_personal(): el usuario interno 'sistema' no se muestra.
-- Última versión: 20261078090000_roles_y_permisos.sql
create or replace function listar_personal(p_usuario text)
returns table (
  usuario_id uuid,
  usuario text,
  nombre text,
  cedula text,
  rol_codigo text,
  area_codigo text,
  area_origen_codigo text,
  cargo text,
  activo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);

  if not tiene_permiso(p_usuario, 'PERSONAL_GESTIONAR') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select u.id, u.usuario, u.nombre, u.cedula, r.codigo, a.codigo, ao.codigo, u.cargo, u.activo, u.created_at
  from usuarios u
  join usuario_roles ur on ur.usuario_id = u.id
  join roles r on r.id = ur.rol_id
  left join areas a on a.id = ur.area_id
  left join areas ao on ao.id = u.area_origen_id
  where u.usuario <> 'sistema'
  order by u.created_at desc;
end;
$$;

-- Funciones internas: solo el servidor (cron y otras funciones) las llama.
revoke execute on function abrir_turno(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function entregar_corridas_automatico(uuid) from public, anon, authenticated;
revoke execute on function relevo_de_respaldo() from public, anon, authenticated;
revoke execute on function codigo_turno_libre(text, uuid) from public, anon, authenticated;
