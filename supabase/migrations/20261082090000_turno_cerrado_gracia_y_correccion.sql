-- ============================================================
-- TURNO CERRADO: bloqueo, gracia de 30 min y corrección controlada
-- ============================================================
-- Rework 2026-09-27. Causa raíz de lo que se rompió esa semana: NINGUNA de
-- las funciones que usa la app (Preparación, Líneas, PT) revisaba si el
-- turno seguía abierto. Cargar tarde sobre un turno cerrado cambiaba el
-- estado que el turno siguiente ya había heredado.
--
--   * exigir_turno_escribible(): se llama al inicio de cada función.
--       - Cambios de ESTADO (tanques, líneas, preparaciones, confirmaciones):
--         solo con el turno ABIERTO.
--       - DATOS (Producto Terminado, contador, novedades, paradas): ABIERTO,
--         o hasta 30 min después del cierre (gracia), o en una corrección.
--   * Corrección: quien tenga TURNO_CORREGIR abre una corrección con motivo
--     sobre el turno inmediatamente anterior del área (o el último, si
--     todavía no se abrió otro). Dura 2 horas. Solo datos, y además puede
--     agregar una corrida olvidada (ya terminada) con su sabor y presentación.
--     Todo queda en Auditoría y en el acta ("Correcciones posteriores").
--   * registrar_parada(): permiso PARADAS_REGISTRAR (cualquiera con él, no
--     solo el supervisor del turno) y misma regla de datos.
--   * Gracia de PT: 30 min, por área (antes 15 min y solo el supervisor).
-- ============================================================

create table turno_correcciones (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  usuario_id uuid not null references usuarios (id),
  motivo text not null,
  creada_en timestamptz not null default now()
);

create index turno_correcciones_turno_idx on turno_correcciones (turno_id, creada_en);
alter table turno_correcciones enable row level security;

-- Instante de cierre de un turno (hora de planta → timestamptz).
create or replace function fin_de_turno(p_turno turnos)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p_turno.fecha_fin is null or p_turno.hora_fin is null then null
    else (p_turno.fecha_fin + p_turno.hora_fin) at time zone 'America/Caracas'
  end;
$$;

-- ¿Este usuario tiene una corrección abierta (menos de 2 h) sobre este turno?
create or replace function correccion_activa(p_usuario text, p_turno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from turno_correcciones c
    join usuarios u on u.id = c.usuario_id
    where c.turno_id = p_turno_id
      and u.usuario = lower(p_usuario)
      and c.creada_en > now() - interval '2 hours'
  );
$$;

-- ------------------------------------------------------------
-- El chequeo. p_solo_datos = true para PT, contador, novedades y paradas.
-- ------------------------------------------------------------
create or replace function exigir_turno_escribible(p_usuario text, p_turno_id uuid, p_solo_datos boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
begin
  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado = 'ABIERTO' then
    return;
  end if;

  if not p_solo_datos then
    raise exception 'Este turno ya está cerrado: no se pueden cambiar tanques ni líneas. Recarga la página para ver el turno en curso.';
  end if;

  if fin_de_turno(v_turno) >= now() - interval '30 minutes' then
    return;
  end if;
  if correccion_activa(p_usuario, p_turno_id) then
    return;
  end if;

  raise exception 'Este turno se cerró hace más de 30 minutos. Para cargar datos tarde, alguien con permiso de corrección debe abrirlo desde Auditoría.';
end;
$$;

-- ------------------------------------------------------------
-- ¿Qué turno se puede corregir? El inmediatamente anterior al último del
-- área, o el último si ya cerró y todavía no hay otro.
-- ------------------------------------------------------------
create or replace function turno_corregible(p_turno_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_turno turnos;
begin
  select * into v_turno from turnos where id = p_turno_id;
  if not found or v_turno.estado <> 'CERRADO' then
    return false;
  end if;
  return p_turno_id in (
    select t.id from turnos t
    where t.area_id = v_turno.area_id
    order by t.fecha desc, t.hora_inicio desc, t.created_at desc
    limit 2
  );
end;
$$;

-- Cabecera del turno para el modo corrección (la usa src/lib/turnoCorreccion.tsx).
create or replace function turno_para_correccion(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not tiene_permiso(p_usuario, 'TURNO_CORREGIR') then
    raise exception 'No tienes permiso para corregir turnos.';
  end if;
  if not turno_corregible(p_turno_id) then
    raise exception 'Ese turno no se puede corregir: solo el turno anterior al actual de su área.';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'codigo', t.codigo,
    'fecha', t.fecha,
    'hora_inicio', t.hora_inicio,
    'fecha_fin', t.fecha_fin,
    'hora_fin', t.hora_fin,
    'supervisor_nombre', u.nombre,
    'correccion_activa', correccion_activa(p_usuario, t.id),
    'motivo', (
      select c.motivo from turno_correcciones c
      join usuarios cu on cu.id = c.usuario_id
      where c.turno_id = t.id and cu.usuario = lower(p_usuario) and c.creada_en > now() - interval '2 hours'
      order by c.creada_en desc limit 1
    )
  )
  into v_resultado
  from turnos t
  join usuarios u on u.id = t.supervisor_id
  where t.id = p_turno_id;

  return v_resultado;
end;
$$;

grant execute on function turno_para_correccion(text, uuid) to anon, authenticated;

create or replace function iniciar_correccion(p_usuario text, p_turno_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not tiene_permiso(p_usuario, 'TURNO_CORREGIR') then
    raise exception 'No tienes permiso para corregir turnos.';
  end if;
  if not turno_corregible(p_turno_id) then
    raise exception 'Ese turno no se puede corregir: solo el turno anterior al actual de su área.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;

  insert into turno_correcciones (turno_id, usuario_id, motivo)
  values (p_turno_id, (select id from usuarios where usuario = lower(p_usuario)), trim(p_motivo));

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno', p_turno_id::text, 'Corregir turno',
    'Abrió una corrección del turno ' || (select codigo from turnos where id = p_turno_id) || ': ' || trim(p_motivo),
    null, jsonb_build_object('motivo', trim(p_motivo))
  );

  return turno_para_correccion(p_usuario, p_turno_id);
end;
$$;

grant execute on function iniciar_correccion(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Corrida olvidada: se agrega ya terminada dentro de la ventana del turno
-- corregido. No toca el estado heredado (no queda activa). Después se le
-- carga el PT como a cualquier corrida cerrada.
-- ------------------------------------------------------------
create or replace function agregar_corrida_retroactiva(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_lote text,
  p_desde timestamptz,
  p_hasta timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_presentacion_id uuid;
  v_lote_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_id uuid;
begin
  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado <> 'CERRADO' or not correccion_activa(p_usuario, p_turno_id) then
    raise exception 'Solo se agregan corridas en una corrección abierta de un turno cerrado.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo and area_id = v_turno.area_id;
  if v_linea_id is null then
    raise exception 'Esa línea no es del área del turno.';
  end if;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;
  if v_presentacion_id is null then
    raise exception 'Elige la presentación.';
  end if;
  if p_sabor_id is null or not exists (select 1 from sabores where id = p_sabor_id) then
    raise exception 'Elige el sabor.';
  end if;

  v_inicio := (v_turno.fecha + v_turno.hora_inicio) at time zone 'America/Caracas';
  v_fin := fin_de_turno(v_turno);
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'La hora de fin tiene que ser después de la de inicio.';
  end if;
  if p_desde < v_inicio or p_hasta > v_fin then
    raise exception 'La corrida tiene que estar dentro del horario del turno.';
  end if;

  if exists (
    select 1 from turno_lineas tl
    where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id
      and tl.activada_en < p_hasta
      and coalesce(tl.finalizada_en, tl.entregada_en, v_fin) > p_desde
  ) then
    raise exception '% ya tiene una corrida en ese horario.', coalesce(v_linea_nombre, p_linea_codigo);
  end if;

  -- Lote del tanque, si existe con ese número y sabor en el área (opcional).
  if nullif(trim(coalesce(p_lote, '')), '') is not null then
    select p.id into v_lote_id
    from preparaciones p join turnos tp on tp.id = p.turno_id
    where tp.area_id = v_turno.area_id and p.sabor_id = p_sabor_id
      and normalizar_lote(p.lote) = normalizar_lote(p_lote)
    order by p.created_at desc limit 1;
  end if;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id,
    activa, activada_en, activada_por, actualizada_por, finalizada_en,
    confirmado_inicio_en, confirmado_inicio_por, confirmado_fin_en, confirmado_fin_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, p_sabor_id, nullif(trim(coalesce(p_lote, '')), ''), v_lote_id,
    false, p_desde, v_usuario_id, v_usuario_id, p_hasta,
    now(), v_usuario_id, now(), v_usuario_id
  )
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'turno_linea', v_id::text, 'Corregir turno',
    format('Agregó una corrida olvidada en %s al turno %s (%s a %s)',
           coalesce(v_linea_nombre, p_linea_codigo), v_turno.codigo,
           to_char(p_desde at time zone 'America/Caracas', 'HH24:MI'), to_char(p_hasta at time zone 'America/Caracas', 'HH24:MI')),
    null,
    jsonb_build_object('linea', p_linea_codigo, 'sabor_id', p_sabor_id, 'presentacion_ml', p_presentacion_volumen_ml, 'lote', p_lote)
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function agregar_corrida_retroactiva(text, uuid, text, uuid, integer, integer, numeric, text, timestamptz, timestamptz) to anon, authenticated;

-- ------------------------------------------------------------
-- Gracia de PT: 30 min, el último turno cerrado del ÁREA del usuario
-- (antes 15 min y solo si él era el supervisor). Ver 20261044.
-- ------------------------------------------------------------
create or replace function turno_pt_gracia_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
  v_turno_id uuid;
begin
  select area_codigo into v_area from rol_y_area_de(p_usuario);
  v_area := coalesce(v_area, 'ASEPTICO');

  select t.id into v_turno_id
  from turnos t
  join areas a on a.id = t.area_id
  where a.codigo = v_area
    and t.estado = 'CERRADO'
    and fin_de_turno(t) >= now() - interval '30 minutes'
  order by t.updated_at desc
  limit 1;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

-- Internas.
revoke execute on function exigir_turno_escribible(text, uuid, boolean) from public, anon, authenticated;


-- ------------------------------------------------------------
-- Cambios de ESTADO: solo con el turno abierto.
-- ------------------------------------------------------------

-- Última versión: 20261043090000_transferencias_desvases_lote_id_y_turno_json.sql
create or replace function transferir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_numero_tanque_destino smallint,
  p_modo text default 'LIQUIDO',
  p_motivo text default 'CONSOLIDAR_RESTOS'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_origen recepcion_tanques%rowtype;
  v_destino recepcion_tanques%rowtype;
  v_origen_prep preparaciones%rowtype;
  v_nuevo_lote_id uuid;
  v_ultimo_lote_texto text;
  v_litros_movidos numeric;
  v_destino_era_limpio boolean;
  v_origen_litros numeric;
  v_destino_litros numeric;
  v_lote_id_pierde uuid;
  v_lote_id_gana uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_numero_tanque_origen = p_numero_tanque_destino then
    raise exception 'Elige dos tanques distintos.';
  end if;
  if p_modo not in ('LIQUIDO', 'LOTE') then
    raise exception 'Modo de transferencia inválido: % (debe ser LIQUIDO o LOTE)', p_modo;
  end if;
  if p_motivo not in ('CONSOLIDAR_RESTOS', 'ENRUTAR_MANIFOLD') then
    raise exception 'Motivo de transferencia inválido: % (debe ser CONSOLIDAR_RESTOS o ENRUTAR_MANIFOLD)', p_motivo;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_origen from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;
  select * into v_destino from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

  if v_origen.condicion not in ('LISTO', 'STANDBY') or v_origen.lote_id is null then
    raise exception 'El tanque origen no está Liberado con un lote activo.';
  end if;
  if v_destino.condicion not in ('LISTO', 'STANDBY', 'LIMPIO') then
    raise exception 'El tanque destino debe estar Limpio, o Liberado (Listo o Con Restos).';
  end if;
  if v_destino.condicion in ('LISTO', 'STANDBY') and v_origen.sabor_id is distinct from v_destino.sabor_id then
    raise exception 'Los dos tanques deben tener el mismo sabor.';
  end if;

  select * into v_origen_prep from preparaciones where id = v_origen.lote_id;

  -- Litros REALES en cada tanque = volumen VIVO del lote (una sola
  -- definición). NO recepcion_tanques.volumen_l, que quedó congelado
  -- desde costura 2.
  v_origen_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_origen), v_origen.volumen_l, 0);
  v_destino_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque_destino), v_destino.volumen_l, 0);

  v_litros_movidos := v_origen_litros;
  v_destino_era_limpio := v_destino.condicion = 'LIMPIO';

  if v_destino.condicion = 'LIMPIO' then
    -- Nada que absorber en el destino: los dos modos dan lo mismo — el
    -- origen se muda tal cual, con su propia identidad.
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en)
    values (p_turno_id, p_numero_tanque_destino, v_origen_prep.sabor_id, v_origen_prep.lote, v_origen_litros, v_origen_litros, 0, v_usuario_id, v_usuario_id, now())
    returning id into v_nuevo_lote_id;

    update recepcion_tanques
    set condicion = 'LISTO', sabor_id = v_origen.sabor_id, volumen_l = v_origen_litros, lote = v_origen.lote,
        lote_id = v_nuevo_lote_id, activada_en = now(), actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas set lote_id = v_nuevo_lote_id, actualizada_por = v_usuario_id where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se mudó al lote nuevo del destino).
    -- Su volumen_inicial_l NO se toca: sigue siendo lo que se preparó, y
    -- volumen_l (= v_origen_litros) es el "fin" correcto del tramo.
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');
    v_lote_id_pierde := v_origen.lote_id;
    v_lote_id_gana := v_nuevo_lote_id;

  elsif p_modo = 'LIQUIDO' then
    -- El destino conserva su identidad: absorbe el volumen del origen.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_origen_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_origen_litros,
        actualizada_por = v_usuario_id
    where id = v_destino.lote_id;

    update recepcion_tanques
    set volumen_l = (select volumen_l from preparaciones where id = v_destino.lote_id)
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_destino.lote_id, lote = v_destino.lote, sabor_id = v_destino.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_origen.lote_id and activa;

    -- El lote origen quedó vacío (todo se absorbió en el lote destino).
    -- volumen_inicial_l intacto; volumen_l (= v_origen_litros) es el "fin".
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_origen.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Transferido (líquido) al Tanque ' || p_numero_tanque_destino || coalesce(' · Lote ' || v_origen.lote, '');
    v_lote_id_pierde := v_origen.lote_id;
    v_lote_id_gana := v_destino.lote_id;

  else
    -- p_modo = 'LOTE': el origen conserva su identidad — absorbe lo
    -- que ya tenía el destino, y se muda físicamente al tanque destino.
    -- OJO: acá el que "gana" es el lote de ORIGEN (sobrevive, absorbe),
    -- y el que "pierde" (se cierra) es el lote VIEJO del DESTINO — al
    -- revés de los otros dos modos.
    update preparaciones
    set volumen_l = coalesce(volumen_l, 0) + v_destino_litros,
        volumen_inicial_l = coalesce(volumen_inicial_l, 0) + v_destino_litros,
        numero_tanque = p_numero_tanque_destino,
        actualizada_por = v_usuario_id
    where id = v_origen.lote_id;

    update recepcion_tanques
    set condicion = 'LISTO',
        sabor_id = v_origen.sabor_id,
        volumen_l = (select volumen_l from preparaciones where id = v_origen.lote_id),
        lote = v_origen.lote,
        lote_id = v_origen.lote_id,
        activada_en = now(),
        actualizada_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque_destino;

    update turno_lineas
    set lote_id = v_origen.lote_id, lote = v_origen.lote, sabor_id = v_origen.sabor_id, actualizada_por = v_usuario_id
    where lote_id = v_destino.lote_id and activa;

    -- Se cierra el lote VIEJO del destino: el que sobrevive es el del
    -- origen, que se muda al tanque destino y queda abierto.
    update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_destino.lote_id and cerrado_en is null;

    v_ultimo_lote_texto := 'Lote ' || coalesce(v_origen.lote, '') || ' trasladado al Tanque ' || p_numero_tanque_destino;
    v_lote_id_pierde := v_destino.lote_id;
    v_lote_id_gana := v_origen.lote_id;
  end if;

  -- El tanque origen siempre queda sin lote propio al final — o se
  -- cerró (LIQUIDO/LIMPIO) o se mudó físicamente al destino (LOTE).
  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_origen.sabor_id,
      ultimo_lote = v_ultimo_lote_texto,
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  insert into transferencias (turno_id, tanque_origen, tanque_destino, litros, modo, motivo, usuario_id, lote_id_origen, lote_id_destino)
  values (
    p_turno_id,
    p_numero_tanque_origen,
    p_numero_tanque_destino,
    v_litros_movidos,
    case when v_destino_era_limpio then null else p_modo end,
    p_motivo::motivo_transferencia,
    v_usuario_id,
    v_lote_id_pierde,
    v_lote_id_gana
  );

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function terminar_sabor_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function terminar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- activa=false, finalizada_en sigue NULL => ESPERANDO_PT.
  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set pausada_en = now(),
      pausa_motivo = nullif(btrim(p_motivo), ''),
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function liberar_lote(p_usuario text, p_turno_id uuid, p_lote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  update preparaciones set liberado_en = now(), actualizada_por = v_usuario_id where id = p_lote_id and liberado_en is null;

  update recepcion_tanques
  set condicion = 'LISTO',
      sabor_id = v_lote.sabor_id,
      volumen_l = v_lote.volumen_l,
      lote = v_lote.lote,
      lote_id = p_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_lote.numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function iniciar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_sabor_id uuid,
  p_lote text,
  p_tambores integer,
  p_agua numeric,
  p_azucar numeric,
  p_acido_citrico numeric,
  p_desvase_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_volumen_l numeric;
  v_tanque_actual recepcion_tanques%rowtype;
  v_desvase desvases%rowtype;
  v_nuevo_lote_id uuid;
  v_area_id uuid;
  v_lote_norm text;
  v_resto numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;
  select p_tambores * volumen into v_volumen_l from sabores where id = p_sabor_id;

  v_volumen_l := coalesce(v_volumen_l, 0) + coalesce(p_agua, 0);

  select * into v_tanque_actual from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_lote_norm := normalizar_lote(p_lote);

  -- Serializa por (área, sabor, nº de lote): dos preparaciones
  -- concurrentes del mismo lote esperan una a la otra y la segunda ve la
  -- fila de la primera en el `exists` de abajo. El lock se libera solo al
  -- terminar la transacción.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_area_id::text, '') || '|' || coalesce(p_sabor_id::text, '') || '|' || v_lote_norm, 0)
  );

  -- Guarda: número de lote repetido para el mismo sabor, abierto en
  -- otro tanque de la misma área.
  if exists (
    select 1
    from preparaciones prep
    join turnos t on t.id = prep.turno_id
    where prep.cerrado_en is null
      and prep.id is distinct from v_tanque_actual.lote_id
      and prep.sabor_id = p_sabor_id
      and normalizar_lote(prep.lote) = v_lote_norm
      and t.area_id = v_area_id
  ) then
    raise exception 'Ya hay un lote % de ese sabor abierto en otro tanque. Ciérralo primero o usa otro número.', v_lote_norm;
  end if;

  if v_tanque_actual.condicion in ('LISTO', 'STANDBY') and v_tanque_actual.lote_id is not null then
    -- Resto que ya había en el tanque = volumen VIVO del lote (no el
    -- congelado de recepcion_tanques).
    v_resto := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque_actual.volumen_l, 0);
    v_volumen_l := v_volumen_l + v_resto;

    -- El lote anterior se cierra. Su volumen_inicial_l NO se toca: el
    -- resto se MUDA al lote nuevo (no es merma), y volumen_l — que ya
    -- vale v_resto — es el "fin" correcto de su tramo de consumo.
    update preparaciones
    set cerrado_en = now(),
        actualizada_por = v_usuario_id
    where id = v_tanque_actual.lote_id and cerrado_en is null;

    update turno_lineas
    set lote_terminado_en = now(),
        actualizada_por = v_usuario_id
    where lote_id = v_tanque_actual.lote_id and activa;
  end if;

  if p_desvase_id is not null then
    select * into v_desvase from desvases where id = p_desvase_id and consumido_en is null;
    if v_desvase.id is null then
      raise exception 'Eso guardado ya no está disponible.';
    end if;
    if v_desvase.sabor_id is distinct from p_sabor_id then
      raise exception 'Lo guardado es de otro sabor.';
    end if;
    v_volumen_l := v_volumen_l + v_desvase.litros;
  end if;

  insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, agua, azucar, acido_citrico, usuario_id, actualizada_por)
  values (p_turno_id, p_numero_tanque, p_sabor_id, v_lote_norm, v_volumen_l, v_volumen_l, p_tambores, p_agua, p_azucar, p_acido_citrico, v_usuario_id, v_usuario_id)
  returning id into v_nuevo_lote_id;

  if p_desvase_id is not null then
    update desvases
    set consumido_en = now(), turno_id_consumo = p_turno_id, usado_en_lote_id = v_nuevo_lote_id
    where id = p_desvase_id;
  end if;

  update recepcion_tanques set condicion = 'EN_PREPARACION', sabor_id = null, volumen_l = null,
    lote = v_lote_norm, lote_id = v_nuevo_lote_id,
    activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261040090000_confirmar_turno_fuente_de_verdad.sql
create or replace function entregar_corrida(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set entregada_en = now(), entregada_por = v_usuario_id,
      confirmado_fin_en = now(), confirmado_fin_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function detener_linea_por_falla(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select linea_id into v_linea_id
  from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_linea_id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  -- Para la corrida (queda ESPERANDO_PT). El tanque no se toca.
  update turno_lineas
  set activa = false, pausada_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id;

  -- Y en la MISMA transacción, deja la línea en Detenida con el motivo.
  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, 'DETENIDA', now(), nullif(btrim(p_motivo), ''), v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'DETENIDA',
        activada_en = excluded.activada_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261040090000_confirmar_turno_fuente_de_verdad.sql
create or replace function continuar_siguiente_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_numero_tanque smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual turno_lineas%rowtype;
  v_ancho integer;
  v_lote_siguiente text;
  v_tanque recepcion_tanques%rowtype;
  v_candidatos integer;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if p_numero_tanque is not null then
    -- ---- Camino manual: el supervisor eligió el tanque ----
    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

    if v_tanque.numero_tanque is null then
      raise exception 'No existe el tanque % en este turno.', p_numero_tanque;
    end if;
    if v_tanque.condicion is distinct from 'LISTO' then
      raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
    end if;
    if v_tanque.lote_id is null then
      raise exception 'El tanque % no tiene un lote asignado.', p_numero_tanque;
    end if;

    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa and id <> v_actual.id
    ) then
      raise exception 'El Lote % del tanque % ya lo está tomando otra corrida.', v_tanque.lote, p_numero_tanque;
    end if;
    if exists (
      select 1 from turno_lineas
      where turno_id = p_turno_id and lote_id = v_tanque.lote_id
        and activa = false and finalizada_en is null
    ) then
      raise exception 'Hay una corrida detenida sobre el Lote % sin su Producto Terminado. Cárgalo antes de continuar.', v_tanque.lote;
    end if;
  else
    -- ---- Camino automático: lote consecutivo, mismo sabor, un solo tanque ----
    if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
      raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente. Elige el tanque manualmente.', v_actual.lote;
    end if;

    v_ancho := length(v_actual.lote);
    v_lote_siguiente := lpad((v_actual.lote::bigint + 1)::text, greatest(v_ancho, 4), '0');

    select count(*) into v_candidatos
    from recepcion_tanques
    where turno_id = p_turno_id
      and condicion = 'LISTO'
      and lote = v_lote_siguiente
      and sabor_id is not distinct from v_actual.sabor_id;

    if v_candidatos = 0 then
      raise exception 'No hay ningún tanque Listo con el Lote % del mismo sabor. Elige el tanque manualmente.', v_lote_siguiente;
    end if;
    if v_candidatos > 1 then
      raise exception 'Hay más de un tanque Listo con el Lote % de ese sabor — elige el tanque manualmente.', v_lote_siguiente;
    end if;

    select * into v_tanque
    from recepcion_tanques
    where turno_id = p_turno_id
      and condicion = 'LISTO'
      and lote = v_lote_siguiente
      and sabor_id is not distinct from v_actual.sabor_id
    limit 1;
  end if;

  -- Guarda antiduplicados: esta linea ya tiene OTRA corrida de este
  -- lote + sabor este turno que YA produjo.
  if exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_actual.linea_id
      and tl2.id <> v_actual.id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and (
        tl2.lote_terminado_en is not null
        or tl2.entregada_en is not null
        or exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl2.id)
      )
  ) then
    raise exception 'Esta línea ya corrió el Lote % este turno. Corrige el Producto Terminado de esa corrida en lugar de volver a activarla.', v_tanque.lote;
  end if;

  -- La corrida actual pasa a ESPERANDO_PT (no se finaliza sin su PT).
  update turno_lineas
  set activa = false, actualizada_por = v_usuario_id
  where id = v_actual.id;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id,
    now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function continuar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261047090000_log_errores_y_auditoria_confirmar_medir.sql
create or replace function confirmar_estado_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_momento text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if p_momento = 'INICIO' then
    update recepcion_tanques
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  else
    update recepcion_tanques
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  end if;

  -- Fuente real del inicio/fin de este turno para ese lote — ya no
  -- una foto automática ni lo que congeló otro turno.
  if v_tanque.condicion in ('LISTO', 'STANDBY') and v_tanque.lote_id is not null then
    v_volumen := volumen_vivo_tanque(p_turno_id, p_numero_tanque);
    if v_volumen is not null then
      if p_momento = 'INICIO' then
        update turnos
        set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      else
        update turnos
        set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_tanque.lote_id::text], to_jsonb(v_volumen))
        where id = p_turno_id;
      end if;
    end if;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'recepcion_tanques', p_turno_id::text || '-' || p_numero_tanque::text, 'Status',
    format('Confirmar %s · Tanque %s', case when p_momento = 'INICIO' then 'inicio' else 'fin' end, p_numero_tanque),
    null,
    jsonb_build_object('momento', p_momento, 'numero_tanque', p_numero_tanque)
  );

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261047090000_log_errores_y_auditoria_confirmar_medir.sql
create or replace function confirmar_estado_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_momento text default 'INICIO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_codigo text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select l.codigo into v_linea_codigo from turno_lineas tl join lineas l on l.id = tl.linea_id where tl.id = p_turno_linea_id;

  if p_momento = 'INICIO' then
    update turno_lineas
    set confirmado_inicio_en = now(),
        confirmado_inicio_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id and activa;
  else
    update turno_lineas
    set confirmado_fin_en = now(),
        confirmado_fin_por = v_usuario_id
    where id = p_turno_linea_id and turno_id = p_turno_id;
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno_lineas', p_turno_linea_id::text, 'Status',
    format('Confirmar %s · %s', case when p_momento = 'INICIO' then 'inicio' else 'fin' end, coalesce(v_linea_codigo, p_turno_linea_id::text)),
    null,
    jsonb_build_object('momento', p_momento)
  );

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261040090000_confirmar_turno_fuente_de_verdad.sql
create or replace function cambiar_condicion_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_condicion text,
  p_sabor_id uuid,
  p_volumen_l numeric,
  p_lote text,
  p_momento text default null,
  p_tambores integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual recepcion_tanques%rowtype;
  v_ultimo_sabor_id uuid;
  v_ultimo_lote text;
  v_lote_id uuid;
  v_mismo_lote boolean;
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
  v_area_id uuid;
  v_prep_con_datos boolean;
  v_volumen_prep numeric;
  v_volumen_l_viejo numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_momento is not null and p_momento not in ('INICIO', 'FIN') then
    raise exception 'p_momento inválido: %', p_momento;
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_actual from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  v_ultimo_sabor_id := v_actual.ultimo_sabor_id;
  v_ultimo_lote := v_actual.ultimo_lote;

  if p_condicion in ('SUCIO', 'CIP', 'LIMPIO') and v_actual.condicion in ('LISTO', 'STANDBY') and v_actual.sabor_id is not null then
    v_ultimo_sabor_id := v_actual.sabor_id;
    v_ultimo_lote := v_actual.lote;
  end if;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LIMPIO' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_prep_con_datos := p_condicion = 'EN_PREPARACION'
    and p_sabor_id is not null
    and coalesce(trim(p_lote), '') <> '';

  v_mismo_lote :=
    v_actual.condicion in ('LISTO', 'STANDBY')
    and p_condicion in ('LISTO', 'STANDBY')
    and v_actual.sabor_id is not distinct from p_sabor_id
    and coalesce(v_actual.lote, '') = coalesce(normalizar_lote(p_lote), '');

  if v_mismo_lote then
    v_lote_id := v_actual.lote_id;

  elsif p_condicion in ('LISTO', 'STANDBY') then
    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por, liberado_en)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), p_volumen_l, p_volumen_l, 0, v_usuario_id, v_usuario_id, now())
    returning id into v_lote_id;

  elsif v_prep_con_datos then
    -- Cierra cualquier preparación abierta de este tanque en el área
    -- (incluye lotes "colgados" arrastrados de turnos viejos).
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id in (select id from turnos where area_id = v_area_id);

    select coalesce(p_tambores, 0) * volumen into v_volumen_prep from sabores where id = p_sabor_id;

    insert into preparaciones (turno_id, numero_tanque, sabor_id, lote, volumen_l, volumen_inicial_l, tambores, usuario_id, actualizada_por)
    values (p_turno_id, p_numero_tanque, p_sabor_id, normalizar_lote(p_lote), v_volumen_prep, v_volumen_prep, coalesce(p_tambores, 0), v_usuario_id, v_usuario_id)
    returning id into v_lote_id;

  else
    -- EN_PREPARACION sin datos, o SUCIO/CIP/LIMPIO: cierra los lotes
    -- abiertos de este tanque que vienen de OTROS turnos.
    update preparaciones pr
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where pr.cerrado_en is null
      and pr.numero_tanque = p_numero_tanque
      and pr.turno_id <> p_turno_id
      and pr.turno_id in (select id from turnos where area_id = v_area_id);
    v_lote_id := null;
  end if;

  update recepcion_tanques
  set condicion = p_condicion,
      sabor_id = case when p_condicion in ('LISTO', 'STANDBY') then p_sabor_id else null end,
      volumen_l = case when p_condicion in ('LISTO', 'STANDBY') then p_volumen_l else null end,
      lote = case
               when p_condicion in ('LISTO', 'STANDBY') then normalizar_lote(p_lote)
               when v_prep_con_datos then normalizar_lote(p_lote)
               else null
             end,
      lote_id = v_lote_id,
      activada_en = now(),
      actualizada_por = v_usuario_id,
      ultimo_sabor_id = v_ultimo_sabor_id,
      ultimo_lote = v_ultimo_lote,
      cip_iniciado_en = v_cip_iniciado_en,
      cip_finalizado_en = v_cip_finalizado_en,
      confirmado_inicio_en = case when p_momento = 'INICIO' then now() else confirmado_inicio_en end,
      confirmado_inicio_por = case when p_momento = 'INICIO' then v_usuario_id else confirmado_inicio_por end,
      confirmado_fin_en = case when p_momento = 'FIN' then now() else confirmado_fin_en end,
      confirmado_fin_por = case when p_momento = 'FIN' then v_usuario_id else confirmado_fin_por end
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  -- Fuente real del inicio/fin de este turno para ese lote (ver
  -- confirmar_estado_tanque más arriba, mismo criterio). Acá el valor
  -- ya es p_volumen_l — lo que el supervisor acaba de declarar.
  if p_momento is not null and p_condicion in ('LISTO', 'STANDBY') and v_lote_id is not null then
    if p_momento = 'INICIO' then
      update turnos
      set volumenes_lote_inicio = jsonb_set(coalesce(volumenes_lote_inicio, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    else
      update turnos
      set volumenes_lote_cierre = jsonb_set(coalesce(volumenes_lote_cierre, '{}'::jsonb), array[v_lote_id::text], to_jsonb(p_volumen_l))
      where id = p_turno_id;
    end if;
  end if;

  if v_mismo_lote and v_lote_id is not null then
    -- RELECTURA FÍSICA DEL TANQUE — NO mueve volumen_inicial_l.
    select volumen_l into v_volumen_l_viejo
    from preparaciones where id = v_lote_id and cerrado_en is null;

    update preparaciones
    set volumen_l = p_volumen_l, actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;

    if v_volumen_l_viejo is not null and p_volumen_l is distinct from v_volumen_l_viejo then
      insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
      values (
        v_lote_id,
        p_turno_id,
        v_volumen_l_viejo,
        p_volumen_l,
        coalesce(p_volumen_l, 0) - coalesce(v_volumen_l_viejo, 0),
        v_usuario_id
      );
    end if;

  elsif v_actual.lote_id is not null then
    update turno_lineas
    set lote_terminado_en = now(), actualizada_por = v_usuario_id
    where lote_id = v_actual.lote_id and activa;

    update preparaciones
    set cerrado_en = now(), actualizada_por = v_usuario_id
    where id = v_actual.lote_id and cerrado_en is null;
  end if;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261027090000_cambiar_condicion_linea_bloquea_esperando_pt.sql
create or replace function cambiar_condicion_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_condicion text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_linea_id uuid;
  v_actual lineas_estado%rowtype;
  v_tiene_corrida_activa boolean;
  v_lote_esperando_pt text;
  v_cip_iniciado_en timestamptz;
  v_cip_finalizado_en timestamptz;
  v_observacion text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;

  select exists(
    select 1 from turno_lineas where turno_id = p_turno_id and linea_id = v_linea_id and activa
  ) into v_tiene_corrida_activa;

  if v_tiene_corrida_activa then
    raise exception 'La línea tiene una corrida activa — detén o termina el sabor antes de cambiar su estado.';
  end if;

  -- Corrida detenida sin su Producto Terminado (ESPERANDO_PT).
  select tl.lote into v_lote_esperando_pt
  from turno_lineas tl
  where tl.turno_id = p_turno_id and tl.linea_id = v_linea_id
    and tl.activa = false and tl.finalizada_en is null
  order by tl.activada_en desc
  limit 1;

  if v_lote_esperando_pt is not null then
    raise exception 'Hay una corrida detenida sobre esta línea (Lote %) sin su Producto Terminado. Cárgalo antes de cambiar el estado de la línea.',
      v_lote_esperando_pt;
  end if;

  select * into v_actual from lineas_estado where turno_id = p_turno_id and linea_id = v_linea_id;

  v_cip_iniciado_en := v_actual.cip_iniciado_en;
  v_cip_finalizado_en := v_actual.cip_finalizado_en;
  if p_condicion = 'CIP' then
    v_cip_iniciado_en := now();
    v_cip_finalizado_en := null;
  elsif p_condicion = 'LISTA' and v_actual.condicion = 'CIP' then
    v_cip_finalizado_en := now();
  end if;

  v_observacion := case when p_condicion = 'DETENIDA' then nullif(btrim(p_observacion), '') else null end;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, actualizada_por)
  values (p_turno_id, v_linea_id, p_condicion, now(), v_cip_iniciado_en, v_cip_finalizado_en, v_observacion, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = excluded.condicion,
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = excluded.cip_finalizado_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261049090000_ajustes_volumen_turno_correcto_y_en_acta.sql
create or replace function ajustar_preparacion(
  p_usuario text,
  p_turno_id uuid,
  p_lote_id uuid,
  p_litros numeric,
  p_detalle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote preparaciones%rowtype;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  if p_litros is null or p_litros <= 0 then
    raise exception 'El ajuste tiene que ser un número de litros mayor a 0.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_lote from preparaciones where id = p_lote_id;

  if v_lote.id is null then
    raise exception 'Esa preparación no existe.';
  end if;
  if v_lote.liberado_en is not null then
    raise exception 'El lote ya está liberado — no se le pueden sumar ajustes.';
  end if;
  if v_lote.cerrado_en is not null then
    raise exception 'El lote ya está cerrado.';
  end if;

  update preparaciones
  set volumen_l = coalesce(volumen_l, 0) + p_litros,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros
  where id = p_lote_id;

  insert into preparaciones_ajuste_volumen (lote_id, turno_id, litros, detalle, usuario_id)
  values (p_lote_id, p_turno_id, p_litros, nullif(trim(coalesce(p_detalle, '')), ''), v_usuario_id);

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'preparaciones', p_lote_id::text, 'Preparación',
    format('Ajuste de volumen · Tanque %s%s · +%s L%s',
           v_lote.numero_tanque,
           coalesce(' · Lote ' || v_lote.lote, ''),
           p_litros,
           coalesce(' (' || nullif(trim(coalesce(p_detalle, '')), '') || ')', '')),
    jsonb_build_object('volumen_l', v_lote.volumen_l, 'volumen_inicial_l', v_lote.volumen_inicial_l),
    jsonb_build_object('volumen_l', coalesce(v_lote.volumen_l, 0) + p_litros, 'volumen_inicial_l', coalesce(v_lote.volumen_inicial_l, 0) + p_litros)
  );

  return turno_json(v_lote.turno_id);
end;
$$;

-- Última versión: 20261042090000_fix_voseo_mensajes_confirmar.sql
create or replace function activar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_presentacion_volumen_ml integer,
  p_envases_hora integer,
  p_litros_hora numeric,
  p_numero_tanque smallint,
  p_confirmar_inicio boolean default false
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
  v_presentacion_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  select id into v_presentacion_id from presentaciones where volumen_ml = p_presentacion_volumen_ml;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;
  if v_tanque.condicion is distinct from 'LISTO' then
    raise exception 'El tanque % no está Listo (liberado) — no se puede tomar todavía.', p_numero_tanque;
  end if;

  -- Guard: si el lote es HEREDADO (nació en otro turno) y todavía no
  -- se confirmó su inicio en ESTE turno, no se puede tomar. Un lote
  -- que nació en ESTE MISMO turno no necesita esto.
  if v_tanque.lote_id is not null
     and v_tanque.confirmado_inicio_en is null
     and exists (select 1 from preparaciones p where p.id = v_tanque.lote_id and p.turno_id <> p_turno_id)
  then
    raise exception 'Confirma el estado del Tanque % antes de activarlo (Preparación → Status → Confirmar).', p_numero_tanque;
  end if;

  -- Guarda antiduplicados: esta linea ya tiene una corrida de ESTE
  -- lote + sabor este turno que YA produjo. Volver a activarla
  -- duplica el Producto Terminado.
  if v_tanque.lote is not null and exists (
    select 1
    from turno_lineas tl2
    where tl2.turno_id = p_turno_id
      and tl2.linea_id = v_linea_id
      and normalizar_lote(tl2.lote) = normalizar_lote(v_tanque.lote)
      and tl2.sabor_id is not distinct from v_tanque.sabor_id
      and (
        tl2.lote_terminado_en is not null
        or tl2.entregada_en is not null
        or exists (select 1 from producto_terminado pt where pt.turno_linea_id = tl2.id)
      )
  ) then
    raise exception '% ya corrió el Lote % este turno. Para corregir cantidades, edita el Producto Terminado de esa corrida.',
      coalesce(v_linea_nombre, p_linea_codigo), v_tanque.lote;
  end if;

  -- Guarda: desde la página de Líneas (p_confirmar_inicio = false) no se
  -- puede activar sobre una corrida en curso — hay que Detener línea y
  -- cargar su PT primero. Desde Recepción (p_confirmar_inicio = true) sí
  -- se reemplaza.
  if not coalesce(p_confirmar_inicio, false) and exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and linea_id = v_linea_id and activa
  ) then
    raise exception '% ya tiene una corrida en curso. Detén la línea y carga su Producto Terminado antes de activar otra.',
      coalesce(v_linea_nombre, p_linea_codigo);
  end if;

  -- Guarda: el lote de ese tanque tiene una corrida detenida sin PT
  -- (ESPERANDO_PT). Cerrar ese ciclo primero.
  if v_tanque.lote_id is not null and exists (
    select 1 from turno_lineas
    where turno_id = p_turno_id and lote_id = v_tanque.lote_id
      and activa = false and finalizada_en is null
  ) then
    raise exception 'Hay una corrida detenida sobre el Lote % sin su Producto Terminado. Cárgalo antes de volver a activar.',
      v_tanque.lote;
  end if;

  -- Recepción reemplaza la corrida heredada; desde Líneas nunca se llega
  -- acá con una corrida activa (la guarda de arriba ya cortó).
  update turno_lineas
  set activa = false, finalizada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and linea_id = v_linea_id and activa;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por, actualizada_por,
    confirmado_inicio_en, confirmado_inicio_por
  )
  values (
    p_turno_id, v_linea_id, v_presentacion_id, p_envases_hora, p_litros_hora, v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id, v_usuario_id,
    now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function seguir_mismo_lote(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_lote_id uuid;
  v_activa boolean;
  v_lote_terminado_en timestamptz;
  v_cerrado_en timestamptz;
  v_volumen numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select tl.lote_id, tl.activa, tl.lote_terminado_en
  into v_lote_id, v_activa, v_lote_terminado_en
  from turno_lineas tl
  where tl.id = p_turno_linea_id and tl.turno_id = p_turno_id;

  if not found then
    raise exception 'Esa corrida no existe en este turno.';
  end if;

  if v_activa is not true then
    raise exception 'Esa corrida ya no está activa — no se puede seguir con el mismo lote. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  -- Ya está corriendo normal (sin marca de "terminó"): nada que deshacer.
  if v_lote_terminado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- El lote tiene que seguir abierto y con volumen: si ya se cerró (un
  -- PT viejo lo vació y limpió el tanque) no hay nada que "seguir".
  select cerrado_en, volumen_l
  into v_cerrado_en, v_volumen
  from preparaciones
  where id = v_lote_id;

  if v_cerrado_en is not null then
    raise exception 'El Lote de esa corrida ya está cerrado — no se puede seguir. Activa una corrida nueva si el tanque tiene producto.';
  end if;

  if coalesce(v_volumen, 0) <= 0 then
    raise exception 'El Lote de esa corrida no tiene volumen registrado. Revísalo en Preparación (Medir tanque) antes de seguir.';
  end if;

  -- Único efecto: deshace la marca de "terminó el lote".
  update turno_lineas
  set lote_terminado_en = null, actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id
    and activa and lote_terminado_en is not null;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function reactivar_lote(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion <> 'STANDBY' or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote cerrado para reactivar.';
  end if;

  update preparaciones set cerrado_en = null, actualizada_por = v_usuario_id where id = v_tanque.lote_id;

  update turno_lineas
  set lote_terminado_en = null, actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'LISTO', activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261047090000_log_errores_y_auditoria_confirmar_medir.sql
create or replace function medir_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_volumen_real numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_volumen_viejo numeric;
  v_turno_previo_id uuid;
  v_ya_produjo boolean;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Solo se puede medir un tanque Liberado con un lote activo (Listo o Con Restos).';
  end if;
  if p_volumen_real is null or p_volumen_real < 0 then
    raise exception 'El volumen medido no es válido.';
  end if;

  select volumen_l into v_volumen_viejo
  from preparaciones where id = v_tanque.lote_id and cerrado_en is null;

  -- Relevo sin finalizar: ¿el lote de este tanque quedó congelado por
  -- un cierre FORZADO de un turno anterior (no el actual)? Si todavía
  -- no se produjo nada con él en ESTE turno, la medición de ahora es
  -- el cierre real de ese turno anterior, no el punto de partida de
  -- este — se corrige ahí en vez de dejarla como "inicio" de acá.
  select t.id into v_turno_previo_id
  from turnos t
  where t.estado = 'CERRADO'
    and t.cierre_automatico
    and t.id <> p_turno_id
    and jsonb_exists(t.volumenes_lote_cierre, v_tanque.lote_id::text)
  order by t.fecha desc, t.hora_fin desc nulls last, t.created_at desc
  limit 1;

  if v_turno_previo_id is not null then
    select exists(
      select 1
      from producto_terminado pt
      join turno_lineas tl on tl.id = pt.turno_linea_id
      where pt.turno_id = p_turno_id and tl.lote_id = v_tanque.lote_id
    ) into v_ya_produjo;

    if not v_ya_produjo then
      update turnos
      set volumenes_lote_cierre = jsonb_set(volumenes_lote_cierre, array[v_tanque.lote_id::text], to_jsonb(p_volumen_real)),
          actualizada_por = v_usuario_id
      where id = v_turno_previo_id;
    end if;
  end if;

  -- Relectura física: solo `volumen_l`. NO se toca `volumen_inicial_l`.
  update preparaciones set volumen_l = p_volumen_real, actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set volumen_l = p_volumen_real, activada_en = now(), actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_volumen_viejo is not null and p_volumen_real is distinct from v_volumen_viejo then
    insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
    values (
      v_tanque.lote_id,
      p_turno_id,
      v_volumen_viejo,
      p_volumen_real,
      coalesce(p_volumen_real, 0) - coalesce(v_volumen_viejo, 0),
      v_usuario_id
    );
  end if;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'recepcion_tanques', p_turno_id::text || '-' || p_numero_tanque::text, 'Preparación',
    format('Medir Tanque %s · %s L%s', p_numero_tanque, p_volumen_real,
           case when v_volumen_viejo is not null then format(' (antes %s L)', v_volumen_viejo) else '' end),
    case when v_volumen_viejo is not null then jsonb_build_object('volumen_l', v_volumen_viejo) else null end,
    jsonb_build_object('volumen_l', p_volumen_real)
  );

  -- Si lo medido dejó el lote en ~0 y ninguna corrida activa lo usa,
  -- se cierra el lote y el tanque pasa a SUCIO (mismo cierre que usa
  -- Producción). Idempotente y con guardas propias.
  perform revisar_cierre_de_lote(v_tanque.lote_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261043090000_transferencias_desvases_lote_id_y_turno_json.sql
create or replace function desvasar_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_area_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_litros numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select area_id into v_area_id from turnos where id = p_turno_id;

  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para desvasar.';
  end if;

  -- Volumen VIVO del lote (no el congelado de recepcion_tanques).
  v_litros := coalesce(volumen_vivo_tanque(p_turno_id, p_numero_tanque), v_tanque.volumen_l, 0);
  if v_litros <= 0 then
    raise exception 'No queda nada en este tanque para desvasar.';
  end if;

  insert into desvases (area_id, sabor_id, litros, lote_origen, turno_id_origen, usuario_id, lote_id_origen)
  values (v_area_id, v_tanque.sabor_id, v_litros, v_tanque.lote, p_turno_id, v_usuario_id, v_tanque.lote_id);

  update turno_lineas
  set lote_terminado_en = now(), actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update preparaciones set cerrado_en = now(), actualizada_por = v_usuario_id where id = v_tanque.lote_id and cerrado_en is null;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Desvasado (guardado)' || coalesce(' · Lote ' || v_tanque.lote, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function descartar_resto_tanque(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque smallint,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tanque recepcion_tanques%rowtype;
  v_motivo text;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_tanque from recepcion_tanques where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  if v_tanque.condicion not in ('LISTO', 'STANDBY') or v_tanque.lote_id is null then
    raise exception 'Este tanque no tiene un lote activo para descartar.';
  end if;

  v_motivo := nullif(btrim(p_motivo), '');

  update preparaciones
  set observacion = v_motivo, cerrado_en = now(), actualizada_por = v_usuario_id
  where id = v_tanque.lote_id and cerrado_en is null;

  update turno_lineas
  set lote_terminado_en = now(), actualizada_por = v_usuario_id
  where lote_id = v_tanque.lote_id and activa;

  update recepcion_tanques
  set condicion = 'SUCIO',
      sabor_id = null,
      volumen_l = null,
      lote = null,
      lote_id = null,
      activada_en = now(),
      ultimo_sabor_id = v_tanque.sabor_id,
      ultimo_lote = 'Descartado' || coalesce(' · Lote ' || v_tanque.lote, '') || coalesce(' · ' || v_motivo, ''),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque;

  perform capturar_tanques_encontrados_si_completo(p_turno_id);

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261038090000_actualizada_por_preparaciones_y_turno_lineas.sql
create or replace function capturar_resto_origen_transferencia(
  p_usuario text,
  p_turno_id uuid,
  p_numero_tanque_origen smallint,
  p_litros_resto numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_transf transferencias%rowtype;
  v_origen_lote preparaciones%rowtype;
  v_destino_tanque recepcion_tanques%rowtype;
  v_destino_lote_id uuid;
  v_destino_vol_antes numeric;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_litros_resto is null or p_litros_resto < 0 then
    raise exception 'Los litros que quedaron en el tanque no son un número válido.';
  end if;

  -- La transferencia recién hecha desde ese tanque.
  select * into v_transf
  from transferencias
  where turno_id = p_turno_id and tanque_origen = p_numero_tanque_origen
  order by creado_en desc
  limit 1;

  if v_transf.id is null then
    raise exception 'No hay una transferencia reciente desde el Tanque %.', p_numero_tanque_origen;
  end if;
  if v_transf.creado_en < now() - interval '2 hours' then
    raise exception 'La última transferencia desde el Tanque % ya no es reciente — el resto se corrige desde Medir tanque.', p_numero_tanque_origen;
  end if;
  if v_transf.modo = 'LOTE' then
    raise exception 'Esa transferencia movió el lote entero al tanque destino — no aplica capturar un resto en el origen.';
  end if;
  if p_litros_resto >= v_transf.litros then
    raise exception 'El resto (% L) no puede ser mayor o igual a lo que se transfirió (% L).', p_litros_resto, v_transf.litros;
  end if;

  -- Lote que transferir_tanque cerró en el tanque origen (mismo instante).
  select * into v_origen_lote
  from preparaciones
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen and cerrado_en is not null
  order by cerrado_en desc
  limit 1;

  if v_origen_lote.id is null
     or abs(extract(epoch from (v_origen_lote.cerrado_en - v_transf.creado_en))) > 5 then
    raise exception 'No se encontró el lote que cerró esa transferencia en el Tanque %.', p_numero_tanque_origen;
  end if;

  -- Idempotencia: si ya se reabrió, no repetir.
  if v_origen_lote.cerrado_en is null then
    return turno_json(p_turno_id);
  end if;

  -- Nada que capturar.
  if p_litros_resto = 0 then
    return turno_json(p_turno_id);
  end if;

  -- Lote que absorbió la transferencia en el destino.
  select * into v_destino_tanque
  from recepcion_tanques
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;
  v_destino_lote_id := v_destino_tanque.lote_id;

  if v_destino_lote_id is null then
    raise exception 'El Tanque destino % ya no tiene un lote — no se puede ajustar.', v_transf.tanque_destino;
  end if;

  -- ---- Origen: reabrir con el resto, devolver el crédito ----
  update preparaciones
  set cerrado_en = null,
      volumen_l = p_litros_resto,
      volumen_inicial_l = coalesce(volumen_inicial_l, 0) + p_litros_resto,
      actualizada_por = v_usuario_id
  where id = v_origen_lote.id;

  update recepcion_tanques
  set condicion = 'STANDBY',
      sabor_id = v_origen_lote.sabor_id,
      volumen_l = p_litros_resto,
      lote = v_origen_lote.lote,
      lote_id = v_origen_lote.id,
      activada_en = now(),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = p_numero_tanque_origen;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (v_origen_lote.id, p_turno_id, 0, p_litros_resto, p_litros_resto, v_usuario_id);

  -- ---- Destino: llegó de menos ----
  select volumen_l into v_destino_vol_antes from preparaciones where id = v_destino_lote_id;

  update preparaciones
  set volumen_l = greatest(coalesce(volumen_l, 0) - p_litros_resto, 0),
      volumen_inicial_l = greatest(coalesce(volumen_inicial_l, 0) - p_litros_resto, 0),
      actualizada_por = v_usuario_id
  where id = v_destino_lote_id;

  update recepcion_tanques
  set volumen_l = (select volumen_l from preparaciones where id = v_destino_lote_id),
      actualizada_por = v_usuario_id
  where turno_id = p_turno_id and numero_tanque = v_transf.tanque_destino;

  insert into preparaciones_ajuste (lote_id, turno_id, volumen_teorico, volumen_real, diferencia, usuario_id)
  values (
    v_destino_lote_id,
    p_turno_id,
    coalesce(v_destino_vol_antes, 0),
    greatest(coalesce(v_destino_vol_antes, 0) - p_litros_resto, 0),
    -p_litros_resto,
    v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

-- transferir_tanque de 4 argumentos (20260962/20260990): versión vieja que la app
-- ya no usa (llama a la de 6). Se borra para que no quede una puerta sin chequeo.
drop function if exists transferir_tanque(text, uuid, smallint, smallint);

-- ------------------------------------------------------------
-- DATOS: abierto, gracia de 30 min o corrección.
-- ------------------------------------------------------------

-- Última versión: 20261053090000_confirmar_linea_esperando_pt.sql
create or replace function registrar_producto_terminado(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_sabor_id uuid,
  p_volumen_ml integer,
  p_paletas integer,
  p_cajas_sueltas integer,
  p_usuario text,
  p_pagina text default null,
  p_auditar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_presentacion_id uuid;
  v_cajas_x_paleta integer;
  v_litros_x_caja numeric;
  v_usuario_id uuid;
  v_registro producto_terminado%rowtype;
  v_litros_previos numeric;
  v_litros_delta numeric;
  v_lote_id uuid;
  v_pal_prev integer;
  v_caj_prev integer;
  v_habia_pt boolean;
  v_pt_creado timestamptz;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id, cajas_x_paleta, litros_x_caja into v_presentacion_id, v_cajas_x_paleta, v_litros_x_caja
  from presentaciones where volumen_ml = p_volumen_ml;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Cargar PT es en sí mismo confirmar la línea, si todavía no lo estaba.
  update turno_lineas
  set confirmado_inicio_en = now(), confirmado_inicio_por = v_usuario_id
  where id = p_turno_linea_id and confirmado_inicio_en is null;

  select litros_producidos, paletas, cajas_sueltas, created_at
  into v_litros_previos, v_pal_prev, v_caj_prev, v_pt_creado
  from producto_terminado where turno_linea_id = p_turno_linea_id;
  v_habia_pt := found;
  v_litros_previos := coalesce(v_litros_previos, 0);

  -- CANDADO: edición del supervisor pasada 1 h desde que se cargó.
  if coalesce(p_auditar, true) and v_habia_pt
     and v_pt_creado is not null and now() - v_pt_creado > interval '1 hour' then
    raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde que se cargó). Se corrige desde el módulo Validar cuando cierre el turno.';
  end if;

  insert into producto_terminado (
    turno_id, turno_linea_id, linea_id, sabor_id, presentacion_id, paletas, cajas_sueltas, cajas_x_paleta, litros_x_caja, usuario_id
  )
  values (
    p_turno_id, p_turno_linea_id, v_linea_id, p_sabor_id, v_presentacion_id, p_paletas, p_cajas_sueltas, v_cajas_x_paleta, v_litros_x_caja, v_usuario_id
  )
  on conflict (turno_linea_id) do update
    set sabor_id = excluded.sabor_id,
        presentacion_id = excluded.presentacion_id,
        paletas = excluded.paletas,
        cajas_sueltas = excluded.cajas_sueltas,
        cajas_x_paleta = excluded.cajas_x_paleta,
        litros_x_caja = excluded.litros_x_caja,
        updated_at = now()
  returning * into v_registro;

  v_litros_delta := v_registro.litros_producidos - v_litros_previos;

  -- Solo baja el volumen del lote. El cierre del lote/tanque lo hace
  -- revisar_cierre_de_lote. Producción no escribe en recepcion_tanques.
  select tl.lote_id into v_lote_id from turno_lineas tl where tl.id = p_turno_linea_id;

  if v_lote_id is not null and v_litros_delta <> 0 then
    update preparaciones
    set volumen_l = greatest(0, coalesce(volumen_l, 0) - v_litros_delta),
        actualizada_por = v_usuario_id
    where id = v_lote_id and cerrado_en is null;
  end if;

  -- Cierra la corrida si quedó en ESPERANDO_PT.
  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);
  -- Y aunque la corrida ya se hubiera cerrado antes (p. ej. el contador la
  -- cerró en la misma pantalla), revisar acá si ESTE PT dejó el lote en
  -- ~0 — cerrar_corrida_si_esperando ya no correría revisar_cierre_de_lote.
  if v_lote_id is not null then
    perform revisar_cierre_de_lote(v_lote_id);
  end if;

  if coalesce(p_auditar, true) then
    perform registrar_auditoria(
      p_usuario,
      case when v_habia_pt then 'EDITAR' else 'CREAR' end,
      'producto_terminado', p_turno_linea_id::text, p_pagina,
      format('Producto Terminado %s: %s paletas + %s cajas',
             p_linea_codigo, v_registro.paletas, v_registro.cajas_sueltas),
      case when v_habia_pt
           then jsonb_build_object('paletas', v_pal_prev, 'cajas_sueltas', v_caj_prev, 'litros', round(v_litros_previos))
           else null end,
      jsonb_build_object('paletas', v_registro.paletas, 'cajas_sueltas', v_registro.cajas_sueltas, 'litros', round(v_registro.litros_producidos))
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261053090000_confirmar_linea_esperando_pt.sql
create or replace function registrar_contador(
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_linea_codigo text,
  p_envases_llenadora integer,
  p_justificacion text,
  p_usuario text,
  p_pagina text default null,
  p_envases_buenos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea_id uuid;
  v_usuario_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  if p_envases_buenos is null then
    raise exception 'El Contador 2 (envases buenos) es obligatorio.';
  end if;
  if p_envases_buenos < 0 or p_envases_buenos > p_envases_llenadora then
    raise exception 'El Contador 2 (envases buenos = %) no puede ser negativo ni superar el contador de la llenadora (%).',
      p_envases_buenos, p_envases_llenadora;
  end if;

  select id into v_linea_id from lineas where codigo = p_linea_codigo;
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  -- Cargar el contador es en sí mismo confirmar la línea, si todavía no lo estaba.
  update turno_lineas
  set confirmado_inicio_en = now(), confirmado_inicio_por = v_usuario_id
  where id = p_turno_linea_id and confirmado_inicio_en is null;

  insert into contadores (turno_id, turno_linea_id, linea_id, envases_llenadora, envases_buenos, justificacion, usuario_id)
  values (p_turno_id, p_turno_linea_id, v_linea_id, p_envases_llenadora, p_envases_buenos, nullif(p_justificacion, ''), v_usuario_id);

  perform cerrar_corrida_si_esperando(p_turno_id, p_turno_linea_id);

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'contador', p_turno_linea_id::text, p_pagina,
    format('Contador %s: %s envases%s', p_linea_codigo, p_envases_llenadora,
           case when p_envases_buenos is not null then format(' (%s buenos)', p_envases_buenos) else '' end),
    null,
    jsonb_build_object('envases_llenadora', p_envases_llenadora, 'envases_buenos', p_envases_buenos,
                       'justificacion', nullif(p_justificacion, ''))
  );

  return turno_json(p_turno_id);
end;
$$;

-- Última versión: 20261046090000_novedades_del_turno.sql
create or replace function registrar_novedad_turno(
  p_usuario text,
  p_turno_id uuid,
  p_texto text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_id uuid;
  v_texto text := trim(coalesce(p_texto, ''));
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  if v_texto = '' then
    raise exception 'La novedad no puede estar vacía.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into turno_novedades (turno_id, texto, usuario_id)
  values (p_turno_id, v_texto, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'turno_novedades', v_id::text, 'Novedades del turno',
    format('Novedad: %s', v_texto),
    null,
    jsonb_build_object('texto', v_texto)
  );

  return turno_json(p_turno_id);
end;
$$;

-- reabrir_turno y corregir_producto_terminado_auditoria se retiraron en 20261013,
-- pero el rework de roles (20261076) y el de permisos (20261078) las volvieron a
-- crear sin querer. La app no las usa; reabrir_turno reabre turnos cerrados y la
-- otra usa columnas que ya no existen. Se borran.
drop function if exists reabrir_turno(text, uuid);
drop function if exists corregir_producto_terminado_auditoria(text, uuid, integer, integer, text);

-- registrar_parada(): cualquiera con PARADAS_REGISTRAR (no solo el supervisor
-- del turno), y misma regla de datos que PT (abierto, gracia o corrección).

-- Última versión: 20261076090000_rework_dos_roles.sql
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

  -- Supervisores y Super Administrador registran paradas (el Área de Pruebas también, para probar).
  if not tiene_permiso(p_usuario, 'PARADAS_REGISTRAR') and v_area is distinct from 'PRUEBAS' then
    raise exception 'No tienes permiso para registrar paradas.';
  end if;

  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  perform exigir_turno_escribible(p_usuario, p_turno_id, true);
  -- El Super Administrador puede registrar en cualquier turno abierto, no solo el propio.


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
    -- El supervisor registra Programadas, Línea no programada (LNPE), Operacionales y Tiempo ocioso; lo demás lo registra Mantenimiento.
    if v_area is distinct from 'PRUEBAS' and v_tipo.familia not in ('PROGRAMADA', 'EXTERNA', 'OPERACIONAL', 'OCIOSO') then
      raise exception 'Ese tipo de parada lo registra Mantenimiento.';
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

  -- Sin repetir por descuido: la misma parada (línea, tipo y minutos) cargada hace un momento.
  if exists (
    select 1 from paradas p
    where p.turno_id = p_turno_id and p.linea_id = v_linea_id and p.origen = 'MANUAL'
      and p.tipo_id is not distinct from v_tipo.id and p.tipo_nombre = v_nombre
      and round(extract(epoch from (p.fin - p.inicio)) / 60) = p_minutos
      and p.nota is not distinct from nullif(trim(coalesce(p_nota, '')), '')
      and p.created_at > now() - interval '3 minutes'
  ) then
    raise exception 'Esa parada ya se registró hace un momento.';
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

-- ------------------------------------------------------------
-- Personal del área Mantenimiento: pasa al rol MANTENIMIENTO. Desde el
-- rework del 23/09 tenían rol SUPERVISOR, y con 20261078 su página pide
-- PARADAS_MANTENIMIENTO (que SUPERVISOR no trae): se habían quedado afuera.
-- ------------------------------------------------------------
update usuario_roles ur
set rol_id = (select id from roles where codigo = 'MANTENIMIENTO')
from areas a, roles r
where a.id = ur.area_id and a.codigo = 'MANTENIMIENTO'
  and r.id = ur.rol_id and r.codigo = 'SUPERVISOR';

-- Paradas de Mantenimiento: además del área, alcanza con el permiso PARADAS_MANTENIMIENTO.

-- Última versión: 20261070090000_paradas_mantenimiento_en_la_app.sql
create or replace function area_de_paradas_mantenimiento(p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rol text;
  v_area text;
  v_area_id uuid;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if not (v_area in ('MANTENIMIENTO', 'PRUEBAS') or v_rol = 'SUPERADMINISTRADOR' or tiene_permiso(p_usuario, 'PARADAS_MANTENIMIENTO')) then
    raise exception 'Solo el área de Mantenimiento puede registrar estas paradas.';
  end if;
  select a.id into v_area_id from areas a where a.codigo = case when v_area = 'PRUEBAS' then 'PRUEBAS' else 'ASEPTICO' end;
  return v_area_id;
end;
$$;

-- relevo_de_respaldo(): no cierra un turno que alguien abrió poco antes del
-- cambio (ej. el supervisor del T2 llegó 14:40 y dejó elegido T1). Sin esto,
-- a las 15:30 el cron le cerraba ese turno y abría otro sin responsable.

-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
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

    -- Abierto por alguien en la hora previa al cambio de franja: es el de esta franja.
    if v_abierto.id is not null and v_abierto.supervisor_id is distinct from usuario_sistema_id()
       and v_abierto.created_at >= (v_franja.inicio - interval '60 minutes') at time zone 'America/Caracas' then
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

-- turno_json(): suma las correcciones posteriores (para el acta).

-- Última versión: 20261080090000_turnos_responsable_y_respaldo.sql
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
