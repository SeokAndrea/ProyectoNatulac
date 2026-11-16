-- ============================================================
-- PARADAS: la abre el supervisor, la define Mantenimiento (dueña, 2026-11-13)
-- ============================================================
-- Flujo (para todas las áreas; Mantenimiento ya usa la app):
--   1. El supervisor abre la parada con equipo, falla y observación: queda
--      POR_DEFINIR (no elige responsable).
--   2. Mantenimiento la revisa; si es suya, la marca «de Mantenimiento»
--      (definir_responsable_parada) y la termina con sistema/subsistema.
--   3. Si se determina fuera del sistema que es operacional, el supervisor la
--      marca Operacional y la cierra él (Continuar / Terminar parada).
-- No depende del interruptor «Mantenimiento termina las fallas» (areas.mantenimiento_finaliza):
-- la de Mantenimiento la termina Mantenimiento en todas las áreas (dueña, 2026-11-13).
-- Las funciones de abajo son copias de la última versión con el cambio marcado.

alter table paradas drop constraint if exists paradas_responsable_check;
alter table paradas add constraint paradas_responsable_check
  check (responsable in ('OPERACIONAL', 'MANTENIMIENTO', 'POR_DEFINIR'));

-- Parada de Mantenimiento abierta: la termina Mantenimiento (copia de 20261112590000 sin el interruptor).
create or replace function la_termina_mantenimiento(p_parada_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select p.fin is null
       and not p.pendiente
       and p.responsable = 'MANTENIMIENTO'
    from paradas p
    where p.id = p_parada_id
  ), false);
$$;
revoke execute on function la_termina_mantenimiento(uuid) from public, anon, authenticated;

create or replace function definir_responsable_parada(
  p_usuario text,
  p_parada_id uuid,
  p_responsable text,
  p_pagina text default 'Modo Paradas'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p paradas;
  v_mtto boolean := es_de_mantenimiento(p_usuario);
  v_dueno boolean := es_dueno(p_usuario);
begin
  perform area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.fin is not null or v_p.pendiente then
    raise exception 'Esa parada ya terminó.';
  end if;
  if p_responsable not in ('OPERACIONAL', 'MANTENIMIENTO') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_p.responsable = p_responsable then
    return;
  end if;
  -- El supervisor solo define las que están por definir y solo como Operacional;
  -- Mantenimiento (y la dueña) pueden definirla en cualquier sentido mientras esté abierta.
  if not v_mtto and not v_dueno then
    if v_p.responsable <> 'POR_DEFINIR' then
      raise exception 'Esta parada ya la tomó Mantenimiento.';
    end if;
    if p_responsable <> 'OPERACIONAL' then
      raise exception 'Solo Mantenimiento marca una parada como suya.';
    end if;
  end if;
  update paradas set responsable = p_responsable where id = p_parada_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Marcó la parada «%s» como %s', v_p.tipo_nombre,
           case p_responsable when 'MANTENIMIENTO' then 'de Mantenimiento' else 'Operacional' end),
    jsonb_build_object('responsable', v_p.responsable),
    jsonb_build_object('responsable', p_responsable)
  );
end;
$$;
grant execute on function definir_responsable_parada(text, uuid, text, text) to anon, authenticated;

-- abrir_parada_mantenimiento (copia de 20261112890000)
create or replace function abrir_parada_mantenimiento(
  p_usuario text,
  p_linea_codigo text,
  p_tipo_codigo text,
  p_nota text,
  p_inicio text default null,
  p_responsable text default 'MANTENIMIENTO'
)
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
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_responsable text := coalesce(nullif(btrim(coalesce(p_responsable, '')), ''), 'MANTENIMIENTO');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_c turno_lineas;
  v_corre boolean := false;
  v_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  v_linea_id := linea_de_paradas(v_area_id, p_linea_codigo);
  select nombre into v_linea_nombre from lineas where id = v_linea_id;

  if v_responsable not in ('OPERACIONAL', 'MANTENIMIENTO', 'POR_DEFINIR') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_nota is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_linea_id, v_area_id);
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if now() - v_inicio > interval '30 days' then
    raise exception 'La parada no puede empezar hace más de 30 días.';
  end if;

  -- La corrida de la línea en el turno abierto del área.
  select tl.* into v_c
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id and t.estado = 'ABIERTO' and t.area_id = v_area_id
  where tl.linea_id = v_linea_id and tl.activa
  order by tl.activada_en desc
  limit 1
  for update of tl;
  -- Sin corrida no hay quién la solape en pantalla: otra parada de la línea en ese
  -- horario (una LNPE «Sin programación», por ejemplo) contaría el mismo tiempo dos veces.
  if v_c.id is null and exists (
    select 1 from paradas p
    where p.linea_id = v_linea_id
      and not p.pendiente
      and p.inicio < now()
      and coalesce(p.fin, now()) > v_inicio
  ) then
    raise exception 'Ya hay una parada en % en ese horario. Termínala o empieza esta después de que acabe.', v_linea_nombre;
  end if;
  -- Corriendo: activa, sin pausa, sin lote terminado, fuera de CIP. Una
  -- parada de antes de que arrancara la corrida no la detiene (como
  -- aplicar_paradas_a_lineas).
  v_corre := v_c.id is not null
    and v_c.pausada_en is null
    and v_c.lote_terminado_en is null
    and v_inicio >= v_c.activada_en
    and coalesce((select condicion from lineas_estado where turno_id = v_c.turno_id and linea_id = v_linea_id), '') <> 'CIP';

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor, sin_corrida)
  values (null, v_linea_id, v_tipo.id, v_tipo.clase,
          case when es_de_mantenimiento(p_usuario) then 'MANTENIMIENTO' else 'MANUAL' end,
          v_nombre, v_guia, left(v_nota, 140), v_inicio, null, false, v_usuario_id, v_responsable,
          case when v_c.id is not null
               then coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)) end,
          case when v_c.id is not null then (select s.nombre from sabores s where s.id = v_c.sabor_id) end,
          v_c.id is null)
  returning id into v_id;

  if v_corre then
    -- El trigger pudo haberla puesto en Parada ya (inicio de hace 15 min o más).
    update turno_lineas
    set pausada_en = v_inicio, pausa_motivo = left(v_nota, 140), actualizada_por = v_usuario_id
    where id = v_c.id and pausada_en is null;

    insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
    values (v_c.turno_id, v_linea_id, 'LISTA', v_id, v_usuario_id)
    on conflict (turno_id, linea_id) do update
      set parada_id = excluded.parada_id,
          actualizada_por = excluded.actualizada_por;
  end if;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_id::text, 'Líneas (Mantenimiento)',
    format('Parada %s «%s» en %s desde las %s%s%s: %s',
           case v_responsable when 'MANTENIMIENTO' then 'de Mantenimiento' when 'POR_DEFINIR' then 'por definir' else 'Operacional' end,
           v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'DD/MM HH24:MI'),
           case when v_corre then ' (pausó la corrida)' else '' end,
           case when v_c.id is null then ' (línea sin corrida)' else '' end, v_nota),
    null,
    jsonb_build_object('linea_id', v_linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_nota,
                       'responsable', v_responsable, 'pauso_corrida', v_corre, 'sin_corrida', v_c.id is null)
  );
  return v_id;
end;
$$;
grant execute on function abrir_parada_mantenimiento(text, text, text, text, text, text) to anon, authenticated;

-- pausar_linea (copia de 20261112590000)
create or replace function pausar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text,
  p_tipo_codigo text,
  p_responsable text,
  p_inicio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_linea_nombre text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_tipo paradas_tipos;
  v_nombre text;
  v_guia numeric;
  v_inicio timestamptz;
  v_parada_id uuid;
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  perform area_de_paradas_mantenimiento(p_usuario);  -- permiso para registrar paradas
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null
  for update;
  if not found then
    return turno_json(p_turno_id);  -- ya estaba en pausa o no está activa: no hace nada
  end if;
  select nombre into v_linea_nombre from lineas where id = v_c.linea_id;

  if coalesce(p_responsable, '') not in ('OPERACIONAL', 'MANTENIMIENTO', 'POR_DEFINIR') then
    raise exception 'Elige si la parada es Operacional o de Mantenimiento.';
  end if;
  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el equipo y la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el equipo y la falla del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_c.linea_id, (select area_id from lineas where id = v_c.linea_id));
  v_guia := case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end;

  v_inicio := coalesce(hora_planta_a_timestamptz(p_inicio, 'inicio'), now());
  if v_inicio > now() + interval '1 minute' then
    raise exception 'La hora de inicio no puede estar en el futuro.';
  end if;
  if v_inicio < v_c.activada_en then
    raise exception 'La parada no puede empezar antes de que arrancara la corrida (%).',
      to_char(v_c.activada_en at time zone 'America/Caracas', 'DD/MM HH24:MI');
  end if;

  insert into paradas (turno_id, linea_id, tipo_id, clase, origen, tipo_nombre, tiempo_guia_min, nota,
                       inicio, fin, pendiente, creado_por, responsable, lote, sabor)
  values (null, v_c.linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_nombre, v_guia, left(v_motivo, 140),
          v_inicio, null, false, v_usuario_id, p_responsable,
          coalesce(nullif(btrim(v_c.lote), ''), (select pr.lote from preparaciones pr where pr.id = v_c.lote_id)),
          (select s.nombre from sabores s where s.id = v_c.sabor_id))
  returning id into v_parada_id;

  update turno_lineas
  set pausada_en = v_inicio,
      pausa_motivo = v_motivo,
      actualizada_por = v_usuario_id
  where id = v_c.id;

  insert into lineas_estado (turno_id, linea_id, condicion, parada_id, actualizada_por)
  values (p_turno_id, v_c.linea_id, 'LISTA', v_parada_id, v_usuario_id)
  on conflict (turno_id, linea_id) do update
    set parada_id = excluded.parada_id,
        actualizada_por = excluded.actualizada_por;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'paradas', v_parada_id::text, 'Líneas (Parada)',
    format('Parada %s «%s» en %s desde las %s: %s',
           case p_responsable when 'MANTENIMIENTO' then 'de Mantenimiento' when 'POR_DEFINIR' then 'por definir' else 'Operacional' end,
           v_nombre, v_linea_nombre, to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'), v_motivo),
    null,
    jsonb_build_object('linea_id', v_c.linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_motivo,
                       'responsable', p_responsable, 'turno_linea_id', v_c.id)
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function pausar_linea(text, uuid, uuid, text, text, text, text) to anon, authenticated;

-- continuar_linea (copia de 20261112590000)
create or replace function continuar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_justificacion text default null,
  p_minutos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_le lineas_estado;
  v_p paradas;
  v_just text := nullif(btrim(coalesce(p_justificacion, '')), '');
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_minutos is not null and (p_minutos <= 0 or p_minutos > 30 * 24 * 60) then
    raise exception 'Pon cuántos minutos duró la parada.';
  end if;

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa for update;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en el Modo Paradas antes de continuar.';
    end if;
    -- Mientras Mantenimiento tenga una parada abierta en la línea (aunque la línea esté detenida
    -- por otra), el supervisor no la continúa. Ya no depende del interruptor del área (dueña, 2026-11-13).
    if exists (
      select 1
      from paradas p
      join lineas l on l.id = p.linea_id
      join areas a on a.id = l.area_id
      where p.linea_id = v_c.linea_id and p.fin is null and not p.pendiente
        and p.responsable = 'MANTENIMIENTO'
    ) then
      raise exception 'Mantenimiento debe terminar su parada.';
    end if;

    -- Con minutos, el tiempo guía se compara con lo que dijo el supervisor, no con el reloj.
    if p_minutos is not null and v_le.parada_id is not null then
      select * into v_p from paradas where id = v_le.parada_id;
      if v_p.fin is null and not parada_de_mantenimiento(v_p.id)
         and v_p.clase = 'PROGRAMADA' and v_p.tiempo_guia_min is not null
         and p_minutos > v_p.tiempo_guia_min and v_just is null then
        raise exception 'La parada pasó su tiempo guía. Escribe la justificación.';
      end if;
    end if;

    -- Flujo nuevo: mientras la parada esté por definir, el supervisor primero la marca Operacional
    -- (si no es de Mantenimiento); si Mantenimiento la toma, la termina él.
    if exists (
      select 1
      from paradas p
      join lineas l on l.id = p.linea_id
      join areas a on a.id = l.area_id
      where p.linea_id = v_c.linea_id and p.fin is null and not p.pendiente
        and p.responsable = 'POR_DEFINIR'
    ) then
      raise exception 'Marca la parada como Operacional (o espera a que Mantenimiento la tome) antes de continuar.';
    end if;

    -- Cierra la parada con la hora de ahora y pone terminada_por / terminada_en.
    perform soltar_parada_de_linea(p_usuario, p_turno_id, v_c.linea_id, 'Líneas (Continuar)', p_justificacion, p_minutos is null);

    -- La que se acaba de cerrar termina en inicio + minutos (nunca después de ahora).
    -- Una de Mantenimiento no se cerró (sigue abierta): no se toca.
    if p_minutos is not null and v_p.id is not null then
      update paradas
      set fin = least(inicio + make_interval(mins => p_minutos), now()),
          justificacion_desvio = case
            when clase = 'PROGRAMADA' and tiempo_guia_min is not null and p_minutos > tiempo_guia_min
              then coalesce(v_just, justificacion_desvio)
            else null
          end,
          terminada_por = coalesce(terminada_por, v_usuario_id),
          terminada_en = coalesce(terminada_en, now())
      where id = v_p.id and fin is not null and not pendiente and v_p.fin is null;
      if found then
        perform registrar_auditoria(
          p_usuario, 'EDITAR', 'paradas', v_p.id::text, 'Líneas (Continuar)',
          format('La parada «%s» de la %s duró %s min (lo puso el supervisor)', v_p.tipo_nombre,
                 (select nombre from lineas where id = v_c.linea_id), p_minutos),
          null,
          jsonb_build_object('minutos', p_minutos)
        );
      end if;
    end if;

    -- Las demás paradas abiertas de la línea (de Mantenimiento) ya no la vuelven a poner en Parada.
    update paradas
    set linea_siguio_en = now()
    where linea_id = v_c.linea_id and fin is null and not pendiente and linea_siguio_en is null;
  end if;

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_c.id is not null and v_c.pausada_en is not null then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'turno_lineas', v_c.id::text, 'Líneas',
      format('Continuó la %s', (select nombre from lineas where id = v_c.linea_id)),
      jsonb_build_object('pausada_en', v_c.pausada_en),
      jsonb_build_object('pausada_en', null)
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;
grant execute on function continuar_linea(text, uuid, uuid, text, integer) to anon, authenticated;

-- terminar_parada (copia de 20261113090000)
create or replace function terminar_parada(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_subsistema_codigo text,
  p_solucion text,
  p_fin text default null,
  p_inicio text default null,
  p_pagina text default 'Reportes de paradas',
  p_mtto_equipo_codigo text default null,
  p_reparacion_min integer default null
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
  if v_de_mtto then
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
  if v_cierre is not null then
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
      clase = v_tipo.clase,
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
      fin = v_fin,
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
                       'minutos', v_min, 'solucion', v_solucion, 'reparacion_min', v_reparacion)
  );
end;
$$;
grant execute on function terminar_parada(text, uuid, text, text, text, text, text, text, text, integer) to anon, authenticated;
