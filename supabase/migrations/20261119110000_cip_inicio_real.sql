alter table paradas
  add column cip_inicio_real timestamptz,
  add column cip_motivo text,
  add column cip_registrado_en timestamptz,
  add column cip_confirmado_en timestamptz,
  add column cip_reparacion_fin timestamptz;

create function proteger_linea_durante_cip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.condicion = 'CIP'
     and (new.condicion is distinct from old.condicion or new.parada_id is distinct from old.parada_id)
     and exists (select 1 from paradas p where p.id = old.parada_id
                 and p.cip_inicio_real is not null and p.cip_confirmado_en is null) then
    raise exception 'Confirma el fin del lavado antes de cambiar el estado de la línea.';
  end if;
  if old.condicion <> 'CIP'
     and (new.condicion is distinct from old.condicion or new.parada_id is distinct from old.parada_id)
     and exists (select 1 from paradas p where p.id = old.parada_id
                 and p.cip_inicio_real is not null and p.cip_confirmado_en is not null and p.fin is null) then
    raise exception 'Mantenimiento debe registrar el fin de la reparación.';
  end if;
  return new;
end;
$$;
create trigger proteger_linea_durante_cip
before update of condicion, parada_id on lineas_estado
for each row execute function proteger_linea_durante_cip();
revoke execute on function proteger_linea_durante_cip() from public, anon, authenticated;

create function exigir_linea_liberada_del_cip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.activa and new.pausada_en is null
     and exists (
       select 1 from lineas_estado le join paradas p on p.id = le.parada_id
       where le.turno_id = new.turno_id and le.linea_id = new.linea_id
         and p.cip_inicio_real is not null
         and (p.cip_confirmado_en is null or p.fin is null)
     ) then
    raise exception 'La línea sigue en lavado o reparación. Confirma su liberación antes de arrancar.';
  end if;
  return new;
end;
$$;
create trigger exigir_linea_liberada_del_cip
before insert or update of pausada_en, activa on turno_lineas
for each row execute function exigir_linea_liberada_del_cip();
revoke execute on function exigir_linea_liberada_del_cip() from public, anon, authenticated;

drop function poner_linea_en_cip(text, uuid, text, text, text, uuid, boolean);

create or replace function poner_linea_en_cip(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_motivo text,
  p_descripcion text default null,
  p_turno_linea_id uuid default null,
  p_lote_sigue boolean default null,
  p_inicio_real text default null,
  p_falla_id uuid default null,
  p_parada_id uuid default null,
  p_operacion_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo text;
  v_etiqueta text;
  v_desc text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_c turno_lineas;
  v_parada_id uuid;
  v_parada paradas;
  v_catalogo paradas_tipos;
  v_inicio timestamptz := coalesce(hora_planta_a_timestamptz(p_inicio_real, 'inicio'), now());
  v_nombre text;
  v_clase text;
  v_repetida jsonb;
begin
  perform exigir_usuario('poner_linea_en_cip', p_usuario);
  if not tiene_permiso(p_usuario, 'TURNO_CARGAR') then
    raise exception 'No tienes permiso para iniciar el CIP de la línea.';
  end if;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_repetida := reclamar_operacion_parada(p_operacion_id, v_usuario_id, 'poner_linea_en_cip',
    jsonb_build_array(p_turno_id, p_linea_codigo, p_motivo, p_descripcion, p_turno_linea_id,
                      p_lote_sigue, p_inicio_real, p_falla_id, p_parada_id));
  if v_repetida is not null then return turno_json(p_turno_id); end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select l.id, l.nombre into v_linea_id, v_linea_nombre
  from lineas l join turnos t on t.area_id = l.area_id and t.id = p_turno_id
  where l.codigo = p_linea_codigo and l.activo
  for update of l;
  if exists (select 1 from lineas_estado where turno_id = p_turno_id and linea_id = v_linea_id and condicion = 'CIP') then
    raise exception 'La línea ya tiene un CIP en curso.';
  end if;
  if v_inicio > now() or v_inicio < (select desde from ventana_paradas_turno(p_turno_id)) then
    raise exception 'Pon la hora real de inicio dentro del turno en curso.';
  end if;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  v_tipo := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'FALLA_SUMINISTRO_ELECTRICO'
    when 'HORAS_36' then 'LIMPIEZA_INTERMEDIA'
    when 'FALLA_MECANICA' then 'FALLA_EQUIPO'
  end;
  v_etiqueta := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'Falla en Suministro Eléctrico'
    when 'HORAS_36' then '36 h de trabajo'
    when 'FALLA_MECANICA' then 'Falla mecánica prolongada'
  end;
  if v_tipo is null then
    raise exception 'Elige el motivo del CIP.';
  end if;

  if p_turno_linea_id is not null then
    select * into v_c from turno_lineas
    where id = p_turno_linea_id and turno_id = p_turno_id and linea_id = v_linea_id and activa
    for update;
    if not found then
      raise exception 'Esa corrida no está activa.';
    end if;
    if p_lote_sigue is null then
      raise exception 'Indica si el lote sigue después del CIP.';
    end if;
  else
    if exists (select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_linea_id and activa) then
      raise exception '% tiene una corrida activa: ponla en CIP desde esa corrida.', coalesce(v_linea_nombre, 'La línea');
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and linea_id = v_linea_id and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida en % sin su Producto Terminado. Continúa el lote o carga su PT antes de ponerla en CIP.',
        coalesce(v_linea_nombre, 'la línea');
    end if;
  end if;

  if v_c.id is not null and v_inicio < v_c.activada_en then
    raise exception 'El lavado no puede empezar antes de la corrida.';
  end if;
  if p_parada_id is not null then
    select p.* into v_parada from paradas p join paradas_tipos pt on pt.id = p.tipo_id
    where p.id = p_parada_id and p.linea_id = v_linea_id and p.fin is null and not p.pendiente
      and p.cip_inicio_real is null and p.inicio <= v_inicio
      and ((p_motivo = 'FALLA_MECANICA' and coalesce(p.falla_final_id, p.falla_produccion_id) = p_falla_id)
           or (p_motivo = 'SUMINISTRO_ELECTRICO' and pt.codigo = v_tipo))
    for update of p;
    if not found then
      raise exception 'La parada elegida cambió o no corresponde al motivo del CIP.';
    end if;
    v_parada_id := v_parada.id;
  else
    if p_motivo = 'FALLA_MECANICA' and p_falla_id is null then
      raise exception 'Elige la falla mecánica del catálogo.';
    end if;
    select * into strict v_catalogo from paradas_tipos where codigo = v_tipo;
    v_nombre := nombre_tipo_en_linea(v_catalogo, v_linea_id, (select area_id from lineas where id = v_linea_id));
    v_clase := case when p_motivo = 'HORAS_36' then 'PROGRAMADA' else v_catalogo.clase end;
    if p_motivo = 'FALLA_MECANICA' then
      select nombre, clase into v_nombre, v_clase
      from falla_para_registrar_parada(p_usuario, v_linea_id, v_tipo, p_falla_id);
    end if;
    -- Una parada ya ligada debe resolverse o reutilizarse de forma expresa.
    if exists (select 1 from lineas_estado le join paradas p on p.id = le.parada_id
               where le.turno_id = p_turno_id and le.linea_id = v_linea_id and p.fin is null) then
      raise exception 'La línea tiene una parada abierta. Vincúlala al CIP o resuélvela antes de continuar.';
    end if;
    insert into paradas (linea_id, tipo_id, clase, origen, tipo_nombre, nota, inicio, fin,
                         pendiente, creado_por, responsable, falla_produccion_id, lote, sabor)
    values (v_linea_id, v_catalogo.id, v_clase, 'MANUAL', v_nombre, v_desc, v_inicio, null,
            false, v_usuario_id, case when p_motivo = 'FALLA_MECANICA' then 'MANTENIMIENTO' else 'OPERACIONAL' end,
            case when p_motivo = 'FALLA_MECANICA' then p_falla_id end, v_c.lote,
            (select nombre from sabores where id = v_c.sabor_id))
    returning id into v_parada_id;
  end if;
  update paradas set cip_inicio_real = v_inicio, cip_motivo = p_motivo, cip_registrado_en = now()
  where id = v_parada_id;

  if p_turno_linea_id is not null then
    if p_lote_sigue then
      -- El lote sigue: la corrida queda en pausa (sigue activa, sin PT).
      update turno_lineas
      set pausada_en = coalesce(pausada_en, v_inicio), pausa_motivo = 'CIP', actualizada_por = v_usuario_id
      where id = v_c.id;
    else
      -- El lote termina aquí: Esperando PT, como con Detener línea.
      update turno_lineas
      set activa = false, pausada_en = null, actualizada_por = v_usuario_id
      where id = v_c.id;
    end if;
  end if;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, parada_id, actualizada_por)
  values (p_turno_id, v_linea_id, 'CIP', v_inicio, v_inicio, null, left(v_etiqueta || coalesce(' · ' || v_desc, ''), 140), v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'CIP',
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = null,
        observacion = excluded.observacion,
        parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  perform registrar_auditoria(p_usuario, case when v_parada.id is null then 'CREAR' else 'EDITAR' end,
    'paradas', v_parada_id::text, 'Líneas (CIP)', 'Registró el inicio real del CIP',
    case when v_parada.id is not null then to_jsonb(v_parada) end,
    jsonb_build_object('motivo', p_motivo, 'inicio_lavado', v_inicio, 'falla_id', p_falla_id));
  if p_operacion_id is not null then
    update paradas_operaciones set resultado = to_jsonb(v_parada_id) where id = p_operacion_id;
  end if;
  return turno_json(p_turno_id);
end;
$$;

grant execute on function poner_linea_en_cip(text, uuid, text, text, text, uuid, boolean, text, uuid, uuid, uuid) to anon, authenticated;

drop function terminar_cip(text, uuid, text);
create function terminar_cip(p_usuario text, p_turno_id uuid, p_linea_codigo text,
  p_reinicio_real text default null, p_motivo_espera text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_le lineas_estado;
  v_p paradas;
  v_fin_cip timestamptz;
  v_lista timestamptz;
  v_reinicio timestamptz := hora_planta_a_timestamptz(p_reinicio_real, 'reinicio');
  v_espera uuid;
  v_en_reparacion boolean := false;
begin
  perform exigir_usuario('terminar_cip', p_usuario);
  if not tiene_permiso(p_usuario, 'TURNO_CARGAR') then
    raise exception 'No tienes permiso para terminar el CIP de la línea.';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select l.id into v_linea_id from lineas l join turnos t on t.area_id = l.area_id and t.id = p_turno_id
  where l.codigo = p_linea_codigo
  for update of l;
  select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_linea_id for update;
  if not found then raise exception 'No se encontró la línea.'; end if;
  if v_le.condicion <> 'CIP' then
    if v_le.cip_finalizado_en is not null then return turno_json(p_turno_id); end if;
    raise exception 'La línea no está en CIP.';
  end if;
  select * into v_p from paradas where id = v_le.parada_id for update;
  if v_p.pendiente then
    raise exception 'Completa la parada pendiente en Modo Paradas antes de terminar el CIP.';
  end if;
  if v_p.cip_inicio_real is not null then
    v_fin_cip := v_p.cip_inicio_real + interval '180 minutes';
    if now() < v_fin_cip then raise exception 'El lavado todavía no cumple los 180 minutos.'; end if;
    v_en_reparacion := v_p.responsable in ('MANTENIMIENTO', 'POR_DEFINIR') and v_p.cip_reparacion_fin is null;
    if v_en_reparacion and v_reinicio is not null then
      raise exception 'Registra primero el fin de la reparación.';
    end if;
    v_lista := greatest(v_fin_cip, v_p.cip_reparacion_fin);
    if v_reinicio is not null and (v_reinicio < date_trunc('minute', v_lista) or v_reinicio > now()) then
      raise exception 'Pon una hora de arranque entre la liberación de la línea y ahora.';
    end if;
    if v_reinicio >= v_lista + interval '1 minute' then
      if nullif(btrim(p_motivo_espera), '') is null then
        raise exception 'Escribe el motivo de la espera antes de arrancar.';
      end if;
      -- El tiempo de espera empieza cuando la línea ya está disponible.
      insert into paradas (linea_id, clase, origen, tipo_nombre, nota, inicio, fin,
                           pendiente, creado_por, responsable)
      values (v_linea_id, 'NO_PROGRAMADA', 'MANUAL', 'Espera después de CIP', left(btrim(p_motivo_espera), 140),
              v_lista, v_reinicio, false, v_usuario_id, 'OPERACIONAL')
      returning id into v_espera;
      perform registrar_auditoria(p_usuario, 'CREAR', 'paradas', v_espera::text, 'Líneas (CIP)',
        'Registró la espera después del CIP', null,
        jsonb_build_object('inicio', v_lista, 'fin', v_reinicio, 'parada_cip', v_p.id));
    end if;
    update paradas
    set cip_confirmado_en = now(),
        fin = case when v_en_reparacion then null else v_lista end,
        terminada_por = case when v_en_reparacion then terminada_por else coalesce(terminada_por, v_usuario_id) end,
        terminada_en = case when v_en_reparacion then terminada_en else coalesce(terminada_en, now()) end
    where id = v_p.id;
  else
    v_fin_cip := now(); -- Conserva el flujo de los CIP iniciados con un pendiente.
  end if;

  update lineas_estado
  set condicion = 'LISTA', activada_en = coalesce(v_reinicio, now()), cip_finalizado_en = v_fin_cip,
      observacion = null, parada_id = case when v_en_reparacion then v_p.id end, actualizada_por = v_usuario_id
  where id = v_le.id;

  update turno_lineas
  set pausada_en = case when v_en_reparacion then pausada_en end,
      pausa_motivo = case when v_en_reparacion then v_p.tipo_nombre end, actualizada_por = v_usuario_id
  where turno_id = p_turno_id and linea_id = v_linea_id and activa and pausada_en is not null;

  perform registrar_auditoria(p_usuario, 'EDITAR', 'lineas_estado', v_le.id::text, 'Líneas (CIP)',
    'Confirmó el fin del CIP', to_jsonb(v_le),
    jsonb_build_object('fin_lavado', v_fin_cip, 'confirmado_en', now(), 'reinicio', v_reinicio, 'en_reparacion', v_en_reparacion));
  return turno_json(p_turno_id);
end;
$$;
grant execute on function terminar_cip(text, uuid, text, text, text) to anon, authenticated;

drop function terminar_parada(text, uuid, text, text, text, text, text, text, text, integer);
create function terminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_fin text default null,
  p_inicio text default null,
  p_pagina text default 'Reportes de paradas',
  p_mtto_equipo_codigo text default null,
  p_reparacion_min integer default null,
  p_falla_final_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  -- Flujo nuevo: por definir, solo Mantenimiento la termina (y al hacerlo queda suya);
  -- el supervisor primero la marca Operacional.
  if v_p.responsable = 'POR_DEFINIR' and not es_de_mantenimiento(p_usuario) and not es_dueno(p_usuario)
     then
    raise exception 'Marca la parada como Operacional antes de terminarla.';
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
  if p_falla_final_id is not null then
    if v_p.cip_inicio_real is null or not (v_de_mtto or es_dueno(p_usuario)) then
      raise exception 'El diagnóstico final corresponde al cierre de una reparación del CIP.';
    end if;
    select f.nombre into v_nombre
    from falla_para_registrar_parada(p_usuario, v_p.linea_id, v_tipo.codigo, p_falla_final_id) f;
  end if;
  if v_p.cip_inicio_real is not null then
    if v_reparacion is null then
      raise exception 'Registra los minutos que duró la reparación.';
    end if;
    if v_p.cip_reparacion_fin is not null then
      raise exception 'La reparación ya está registrada.';
    end if;
    v_ini := v_p.inicio;
    v_fin := coalesce(hora_planta_a_timestamptz(p_fin, 'fin'), now());
  elsif v_cierre is not null then
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
      clase = case when v_p.cip_inicio_real is not null then v_p.clase else v_tipo.clase end,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      subsistema_codigo = left(v_sub, 40),
      subsistema_nombre = v_sub_nombre,
      mtto_equipo_codigo = v_mtto_eq.codigo,
      mtto_equipo_nombre = v_mtto_eq.nombre,
      solucion = left(v_solucion, 300),
      reparacion_min = v_reparacion,
      responsable = case when responsable = 'POR_DEFINIR' and v_de_mtto then 'MANTENIMIENTO' when responsable = 'POR_DEFINIR' then 'OPERACIONAL' else responsable end,
      inicio = v_ini,
      cip_reparacion_fin = case when v_p.cip_inicio_real is not null then v_fin end,
      falla_final_id = coalesce(p_falla_final_id, falla_final_id),
      fin = case when v_p.cip_inicio_real is null then v_fin
                 when v_p.cip_confirmado_en is not null then greatest(v_fin, v_p.cip_inicio_real + interval '180 minutes') end,
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
                       'minutos', v_min, 'fin_reparacion', case when v_p.cip_inicio_real is not null then v_fin end,
                       'falla_final_id', p_falla_final_id, 'solucion', v_solucion, 'reparacion_min', v_reparacion)
  );
end;
$$;
grant execute on function terminar_parada(text, uuid, text, text, text, text, text, text, text, integer, uuid) to anon, authenticated;

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
    -- Nitrógeno (20261116290000): bombonas llenas al recibir, las que llegaron y al entregar.
    'nitrogeno_aplica', t.nitrogeno_aplica,
    'nitrogeno', (
      select jsonb_build_object('inicio', n.inicio, 'llegaron', n.llegaron, 'fin', n.fin)
      from turno_nitrogeno n where n.turno_id = t.id
    ),
    -- Lo que entregó el turno anterior del área (para comparar con lo que se recibe).
    'nitrogeno_turno_anterior', (
      select n.fin
      from (
        select p.id from turnos p
        where p.area_id = t.area_id and p.id <> t.id and (p.fecha + p.hora_inicio) < (t.fecha + t.hora_inicio)
        order by p.fecha + p.hora_inicio desc
        limit 1
      ) anterior
      join turno_nitrogeno n on n.turno_id = anterior.id
    ),
    'turno_tipo_codigo', tt.codigo,
    'grupo_codigo', case when t.grupo_pendiente then 'SIN_GRUPO' else g.codigo end,
    'supervisor_usuario', u.usuario,
    'supervisor_nombre', u.nombre,
    'sin_responsable', u.usuario = 'sistema',
    'grupo_pendiente', t.grupo_pendiente,
    'apertura_automatica', t.apertura_automatica,
    'esquema', t.esquema,
    'correcciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', cu.nombre,
        'motivo', c.motivo,
        'creada_en', c.creada_en
      ) order by c.creada_en)
      from turno_correcciones c
      join usuarios cu on cu.id = c.usuario_id
      where c.turno_id = t.id
    ), '[]'::jsonb),
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
        'cip_fin_previsto', (select p.cip_inicio_real + interval '180 minutes' from paradas p where p.id = le.parada_id),
        'cip_en_reparacion', (select p.responsable in ('MANTENIMIENTO', 'POR_DEFINIR') and p.cip_reparacion_fin is null
                            from paradas p where p.id = le.parada_id and p.cip_inicio_real is not null),
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
        'cip_finalizado_en', rt.cip_finalizado_en,
        -- VACÍO (20261109490000)
        'para_vacio', coalesce(prep_t.para_vacio, false)
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
        'cerrado_en', prep.cerrado_en,
        -- VACÍO (20261109490000)
        'para_vacio', prep.para_vacio
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
         -- VACÍO (20261109490000): los lotes de los que salió algo a Vacío en este turno.
         or prep.id in (
           select sv.lote_id from salidas_vacio sv
           where sv.turno_id = t.id and sv.lote_id is not null
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
    -- VACÍO (20261109490000)
    'salidas_vacio', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id,
        'numero_tanque', sv.numero_tanque,
        'lote_id', sv.lote_id,
        'lote', sv.lote,
        'sabor_nombre', sabor_display(svs.nombre, svf.nombre),
        'litros', sv.litros,
        'de_lote_vacio', sv.de_lote_vacio,
        'usuario_nombre', svu.nombre,
        'creado_en', sv.creado_en
      ) order by sv.creado_en)
      from salidas_vacio sv
      left join sabores svs on svs.id = sv.sabor_id
      left join familias_producto svf on svf.id = svs.familia_id
      left join usuarios svu on svu.id = sv.usuario_id
      where sv.turno_id = t.id
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

drop function if exists paradas_que_detienen_lineas(uuid);
create function paradas_que_detienen_lineas(p_turno_id uuid)
returns table (
  linea_codigo text,
  parada_id uuid,
  pendiente boolean,
  tipo_nombre text,
  clase text,
  tiempo_guia_min numeric,
  nota text,
  inicio text,
  fin text,
  de_mantenimiento boolean,
  la_termina_mantenimiento boolean,
  responsable text,
  cip_inicio_real timestamptz,
  cip_reparacion_fin timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.codigo, p.id, p.pendiente, p.tipo_nombre, p.clase, p.tiempo_guia_min, p.nota,
         to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         p.responsable = 'MANTENIMIENTO',
         la_termina_mantenimiento(p.id),
         p.responsable, p.cip_inicio_real, p.cip_reparacion_fin
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join paradas p on p.id = le.parada_id
  where le.turno_id = p_turno_id;
$$;
grant execute on function paradas_que_detienen_lineas(uuid) to anon, authenticated;
