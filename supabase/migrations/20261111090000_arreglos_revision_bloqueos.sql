-- ============================================================
-- Arreglos de la revisión de bloqueos (dueña, 2026-10-19), puntos 1 a 5.
-- Todo comprobado antes en el Área de Pruebas.
--
-- 1. eliminar_parada y eliminar_parada_mantenimiento (las dos pasan por
--    exigir_parada_borrable): no borran la parada que tiene detenida una línea
--    (pausa de Líneas o CIP en curso) ni una de una jornada validada.
--    Antes se borraba y ese tiempo parado se perdía sin rastro.
-- 2. sumar_parada_por_clasificar: una «Parada por clasificar» pendiente
--    ya no impide poner otra Parada en la línea (la línea ya está parada
--    en la realidad). Las pendientes se completan en Registrar Paradas y
--    Finalizar turno las sigue exigiendo. Pasaba sobre todo al pasar de
--    una Parada a CIP: la de la pausa quedaba escondida y trababa todo.
-- 3. cerrar_corrida_si_esperando: al cerrarse la corrida (con su PT), la
--    línea que quedó «Detenida» por Detener línea vuelve a «Lista». Antes
--    los paneles la mostraban parada, con el técnico, hasta que alguien
--    cambiara el estado. detener_linea_por_falla deja el motivo en
--    Auditoría para que no se pierda al limpiar la línea.
-- 4. poner_linea_en_cip: si ya hay un +1 igual sin completar en la línea,
--    el CIP usa ese mismo. Antes el CIP no se ponía.
-- 5. registrar_contador: rechaza el mismo contador (llenadora y buenos)
--    cargado otra vez en la misma corrida dentro de 30 minutos. Cada
--    carga se suma, así que repetirlo duplicaba la producción.
-- ============================================================


-- ---------- 1. Borrar paradas: eliminar_parada y eliminar_parada_mantenimiento ----------
-- Las dos formas de borrar pasan por la misma revisión.
create or replace function exigir_parada_borrable(p_parada_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_p paradas;
  v_linea_detenida text;
  v_area_parada uuid;
  v_fecha date;
begin
  select * into v_p from paradas where id = p_parada_id;
  if not found then
    return;
  end if;

  -- La parada que tiene detenida una línea ahora mismo (pausa de Líneas o CIP).
  select l.nombre into v_linea_detenida
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join turnos t on t.id = le.turno_id
  where le.parada_id = p_parada_id
    and t.estado = 'ABIERTO'
    and (
      le.condicion = 'CIP'
      or exists (
        select 1 from turno_lineas tl
        where tl.turno_id = le.turno_id and tl.linea_id = le.linea_id
          and tl.activa and tl.pausada_en is not null
      )
    )
  limit 1;
  if v_linea_detenida is not null then
    raise exception 'Esta parada tiene detenida la % (Parada o CIP en curso). Pon su tipo y minutos en lugar de borrarla.',
      v_linea_detenida;
  end if;

  -- Jornada validada: la del turno de la parada o, sin turno, la del día en que empezó.
  select coalesce(t.area_id, l.area_id), coalesce(t.fecha, (v_p.inicio at time zone 'America/Caracas')::date)
  into v_area_parada, v_fecha
  from lineas l
  left join turnos t on t.id = v_p.turno_id
  where l.id = v_p.linea_id;
  perform exigir_jornada_abierta(v_area_parada, v_fecha);
end;
$$;

create or replace function eliminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_pagina text default 'Registrar Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
begin
  select * into v_p from paradas where id = p_parada_id and origen <> 'SHEET';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  perform exigir_parada_borrable(p_parada_id);

  delete from paradas where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'paradas', p_parada_id::text, p_pagina,
    format('Eliminó la parada «%s»', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'linea_id', v_p.linea_id, 'inicio', v_p.inicio, 'fin', v_p.fin,
                       'nota', v_p.nota, 'pendiente', v_p.pendiente),
    null
  );
end;
$$;

create or replace function eliminar_parada_mantenimiento(
  p_usuario text,
  p_parada_id uuid,
  p_pagina text default 'Paradas de Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_p paradas;
begin
  select * into v_p from paradas where id = p_parada_id and origen = 'MANTENIMIENTO';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  perform exigir_parada_borrable(p_parada_id);

  delete from paradas where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'paradas', p_parada_id::text, p_pagina,
    format('Mantenimiento eliminó la parada «%s»', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'linea_id', v_p.linea_id, 'inicio', v_p.inicio, 'fin', v_p.fin, 'nota', v_p.nota),
    null
  );
end;
$$;


-- ---------- 2. sumar_parada_por_clasificar ----------
create or replace function sumar_parada_por_clasificar(p_usuario text, p_linea_codigo text, p_nota text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid := area_de_paradas_mantenimiento(p_usuario);
  v_usuario_id uuid;
  v_linea_id uuid;
  v_linea_nombre text;
  v_tipo paradas_tipos;
  v_turno_id uuid;
  v_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;
  select * into v_tipo from paradas_tipos where codigo = 'POR_CLASIFICAR';

  -- Sin la guarda de «ya hay una sin clasificar»: la línea ya está parada.

  select tu.id into v_turno_id
  from turnos tu
  where tu.area_id = v_area_id and tu.estado = 'ABIERTO'
  order by tu.fecha desc, tu.hora_inicio desc
  limit 1;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por)
  values (v_turno_id, v_linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_tipo.nombre, null, p_nota,
          now(), now(), true, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, 'Líneas (Parada)',
    format('+1 «Parada por clasificar» en %s: %s', v_linea_nombre, p_nota),
    null,
    jsonb_build_object('linea_id', v_linea_id, 'tipo', v_tipo.nombre, 'pendiente', true, 'nota', p_nota)
  );
  return v_id;
end;
$$;


-- ---------- 3. cerrar_corrida_si_esperando + detener_linea_por_falla ----------
create or replace function cerrar_corrida_si_esperando(p_turno_id uuid, p_turno_linea_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corrida_activa boolean;
  v_finalizada_en timestamptz;
  v_lote_id uuid;
  v_linea_id uuid;
  v_turno_corrida uuid;
begin
  select tl.activa, tl.finalizada_en, tl.lote_id, tl.linea_id, tl.turno_id
  into v_corrida_activa, v_finalizada_en, v_lote_id, v_linea_id, v_turno_corrida
  from turno_lineas tl where tl.id = p_turno_linea_id;

  -- Solo corridas en ESPERANDO_PT (ya no activas, todavia sin finalizar).
  if v_corrida_activa is not false or v_finalizada_en is not null then
    return;
  end if;

  update turno_lineas
  set finalizada_en = now()
  where id = p_turno_linea_id and activa = false and finalizada_en is null;

  -- La línea que quedó Detenida por «Detener línea» vuelve a Lista, si no
  -- le queda otra corrida en marcha o esperando su PT.
  update lineas_estado
  set condicion = 'LISTA', activada_en = now(), observacion = null
  where turno_id = v_turno_corrida and linea_id = v_linea_id
    and condicion = 'DETENIDA'
    and not exists (
      select 1 from turno_lineas o
      where o.turno_id = v_turno_corrida and o.linea_id = v_linea_id
        and (o.activa or o.finalizada_en is null)
    );

  perform revisar_cierre_de_lote(v_lote_id);
end;
$$;

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
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
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
  values (p_turno_id, v_linea_id, 'DETENIDA', now(), v_motivo, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'DETENIDA',
        activada_en = excluded.activada_en,
        observacion = excluded.observacion,
        actualizada_por = excluded.actualizada_por;

  -- El motivo queda en Auditoría: la línea se limpia sola al cargar el PT.
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'turno_lineas', p_turno_linea_id::text, 'Líneas',
    format('Detuvo %s%s', coalesce((select nombre from lineas where id = v_linea_id), '?'), coalesce(' · ' || v_motivo, '')),
    jsonb_build_object('activa', true),
    jsonb_build_object('activa', false, 'motivo', v_motivo)
  );

  return turno_json(p_turno_id);
end;
$$;


-- ---------- 4. poner_linea_en_cip ----------
create or replace function poner_linea_en_cip(
  p_usuario text,
  p_turno_id uuid,
  p_linea_codigo text,
  p_motivo text,
  p_descripcion text default null,
  p_turno_linea_id uuid default null,
  p_lote_sigue boolean default null
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
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select id, nombre into v_linea_id, v_linea_nombre from lineas where codigo = p_linea_codigo;
  if v_linea_id is null then
    raise exception 'No se encontró la línea.';
  end if;

  v_tipo := case p_motivo
    when 'SUMINISTRO_ELECTRICO' then 'FALLA_SUMINISTRO_ELECTRICO'
    when 'HORAS_36' then 'LIMPIEZA_INTERMEDIA'
    when 'FALLA_MECANICA' then 'FALLA_SIN_ESPECIFICAR'
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

  -- El +1: si ya hay uno igual sin completar en la línea, el CIP usa ese mismo.
  select p.id into v_parada_id
  from paradas p
  join paradas_tipos pt on pt.id = p.tipo_id
  where p.linea_id = v_linea_id and pt.codigo = v_tipo and p.pendiente
  order by p.inicio desc
  limit 1;
  if v_parada_id is null then
    v_parada_id := anotar_parada(p_usuario, p_linea_codigo, v_tipo, null, null, v_desc, 'Líneas (CIP)');
  end if;

  if p_turno_linea_id is not null then
    if p_lote_sigue then
      -- El lote sigue: la corrida queda en pausa (sigue activa, sin PT).
      update turno_lineas
      set pausada_en = coalesce(pausada_en, now()), pausa_motivo = 'CIP', actualizada_por = v_usuario_id
      where id = v_c.id;
    else
      -- El lote termina aquí: Esperando PT, como con Detener línea.
      update turno_lineas
      set activa = false, pausada_en = null, actualizada_por = v_usuario_id
      where id = v_c.id;
    end if;
  end if;

  insert into lineas_estado (turno_id, linea_id, condicion, activada_en, cip_iniciado_en, cip_finalizado_en, observacion, parada_id, actualizada_por)
  values (p_turno_id, v_linea_id, 'CIP', now(), now(), null, left(v_etiqueta || coalesce(' · ' || v_desc, ''), 140), v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set condicion = 'CIP',
        activada_en = excluded.activada_en,
        cip_iniciado_en = excluded.cip_iniciado_en,
        cip_finalizado_en = null,
        observacion = excluded.observacion,
        parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  return turno_json(p_turno_id);
end;
$$;


-- ---------- 5. registrar_contador ----------
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

  -- Cada carga se suma: el mismo contador otra vez enseguida es un duplicado.
  if exists (
    select 1 from contadores
    where turno_linea_id = p_turno_linea_id
      and envases_llenadora = p_envases_llenadora
      and envases_buenos is not distinct from p_envases_buenos
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Ese contador (% envases, % buenos) ya se cargó en esta corrida hace menos de 30 minutos. No se volvió a sumar.',
      p_envases_llenadora, p_envases_buenos;
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

select * from asegurar_control_usuario();
