-- ============================================================
-- PARADAS: «No sé / es una falla» y Mantenimiento la clasifica
-- ============================================================
-- Dueña, 2026-10-26: lo principal es el TIEMPO y la animación. Mantenimiento
-- no carga sus paradas al día, así que la línea no se ve parada y el tiempo
-- llega tarde. Ahora quien está en la línea la para de una vez:
--
--   * pausar_linea(): además de un tipo del catálogo, acepta «Falla sin
--     especificar» con solo la descripción. La línea queda en Parada y el
--     tiempo corre desde ya; Continuar la termina, como cualquier otra.
--   * clasificar_falla(): Mantenimiento (o quien registra paradas) le pone
--     el código del catálogo y qué hizo para resolverla (paradas.solucion).
--     Cambia la categoría, no los minutos.
--   * Puente con el Sheet (mientras Mantenimiento lo siga usando): una parada
--     del Sheet que se solapa en la misma línea con UNA falla sin clasificar
--     no entra como otra parada; esa falla toma del Sheet el código (si la
--     equivalencia lo tiene) y la descripción como «qué se hizo». La hora
--     sigue siendo la de la línea. Las siguientes sincronizaciones solo
--     actualizan eso (paradas_puente_sheet).
--   * listar_paradas(): + las columnas «solucion» y «la_termina_mantenimiento».
--   * Interruptor «Mantenimiento termina las fallas» por área
--     (areas.mantenimiento_finaliza), como el de Calidad: Producción inicia,
--     Mantenimiento finaliza. Encendido, el supervisor no puede darle
--     Continuar a una falla: Mantenimiento la termina (finalizar_falla, o
--     cerrando su reporte del Sheet) y la línea sigue sola. Apagado (Aséptico
--     por ahora), la termina Producción con Continuar. Pruebas, encendido.
-- ============================================================

alter table paradas add column if not exists solucion text;
alter table paradas add column if not exists clasificada_por uuid references usuarios(id);
alter table paradas add column if not exists clasificada_en timestamptz;
comment on column paradas.solucion is
  'Qué hizo Mantenimiento para resolver la falla (20261112590000).';
comment on column paradas.clasificada_por is
  'Quién le puso el código a una «Falla sin especificar» en la app (null si vino del Sheet).';

alter table areas add column if not exists mantenimiento_finaliza boolean not null default false;
update areas set mantenimiento_finaliza = true where codigo = 'PRUEBAS';
comment on column areas.mantenimiento_finaliza is
  'Encendido: las fallas que para Producción las termina Mantenimiento (20261112590000).';

-- Una falla (sin clasificar, o clasificada desde que la reportó la línea)
-- abierta, en un área donde la termina Mantenimiento.
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
       and (t.codigo = 'FALLA_SIN_ESPECIFICAR' or p.clasificada_en is not null)
       and a.mantenimiento_finaliza
    from paradas p
    join lineas l on l.id = p.linea_id
    join areas a on a.id = l.area_id
    left join paradas_tipos t on t.id = p.tipo_id
    where p.id = p_parada_id
  ), false);
$$;
revoke execute on function la_termina_mantenimiento(uuid) from public, anon, authenticated;

-- Para el front (Ajustes de planta y Mantenimiento). Sin área: Aséptico.
create or replace function mantenimiento_finaliza_area(p_area_codigo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select mantenimiento_finaliza from areas where codigo = coalesce(p_area_codigo, 'ASEPTICO')), false);
$$;
grant execute on function mantenimiento_finaliza_area(text) to anon, authenticated;

create or replace function guardar_mantenimiento_finaliza(p_usuario text, p_area_codigo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_antes boolean;
begin
  if not es_dueno(p_usuario) then
    raise exception 'Solo el dueño puede cambiar este ajuste.';
  end if;
  select id, mantenimiento_finaliza into v_area_id, v_antes from areas where codigo = p_area_codigo;
  if v_area_id is null then
    raise exception 'Esa área no existe.';
  end if;
  update areas set mantenimiento_finaliza = p_activo where id = v_area_id;
  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'mantenimiento_finaliza', v_area_id::text, 'Edición de Datos',
    case when p_activo then 'Prendió' else 'Apagó' end || ' "Mantenimiento termina las fallas" en ' || p_area_codigo,
    jsonb_build_object('mantenimiento_finaliza', v_antes), jsonb_build_object('mantenimiento_finaliza', p_activo)
  );
end;
$$;
grant execute on function guardar_mantenimiento_finaliza(text, text, boolean) to anon, authenticated;

-- Copia de 20261111590000 + las fallas que termina Mantenimiento: Detener
-- línea y CIP las dejan abiertas (la línea siguió), como las del Sheet.
create or replace function parada_de_mantenimiento(p_parada_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select p.origen = 'SHEET'
        or exists (
          select 1 from usuario_roles ur
          join areas a on a.id = ur.area_id
          where ur.usuario_id = p.creado_por and a.codigo = 'MANTENIMIENTO'
        )
        or la_termina_mantenimiento(p.id)
    from paradas p where p.id = p_parada_id
  ), false);
$$;
revoke execute on function parada_de_mantenimiento(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 1. pausar_linea(): copia de 20261111590000 que acepta FALLA_SIN_ESPECIFICAR.
-- ------------------------------------------------------------
create or replace function pausar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_motivo text,
  p_tipo_codigo text,
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

  if v_motivo is null then
    raise exception 'Escribe qué pasó (la descripción de la parada).';
  end if;
  if coalesce(p_tipo_codigo, '') = '' then
    raise exception 'Elige el tipo de la parada.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo;
  if v_tipo.id is null or v_tipo.codigo = 'POR_CLASIFICAR' then
    raise exception 'Elige un tipo de parada del catálogo.';
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
                       inicio, fin, pendiente, creado_por)
  values (null, v_c.linea_id, v_tipo.id, v_tipo.clase, 'MANUAL', v_nombre, v_guia, left(v_motivo, 140),
          v_inicio, null, false, v_usuario_id)
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
    format('Parada «%s» en %s desde las %s: %s', v_nombre, v_linea_nombre,
           to_char(v_inicio at time zone 'America/Caracas', 'HH24:MI'), v_motivo),
    null,
    jsonb_build_object('linea_id', v_c.linea_id, 'tipo', v_nombre, 'inicio', v_inicio, 'nota', v_motivo,
                       'turno_linea_id', v_c.id)
  );

  return turno_json(p_turno_id);
end;
$$;
grant execute on function pausar_linea(text, uuid, uuid, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 2. clasificar_falla(): código del catálogo + qué se hizo. La hora no cambia.
-- ------------------------------------------------------------
create or replace function clasificar_falla(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_solucion text,
  p_pagina text default 'Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_p paradas;
  v_tipo paradas_tipos;
  v_nombre text;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
begin
  perform area_de_paradas_mantenimiento(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.pendiente or (select codigo from paradas_tipos where id = v_p.tipo_id) is distinct from 'FALLA_SIN_ESPECIFICAR' then
    raise exception 'Esa parada ya está clasificada.';
  end if;

  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el código de la parada del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      solucion = left(v_solucion, 300),
      clasificada_por = v_usuario_id,
      clasificada_en = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Clasificó la falla de la %s como «%s»: %s', (select nombre from lineas where id = v_p.linea_id), v_nombre, v_solucion),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'solucion', v_p.solucion),
    jsonb_build_object('tipo', v_nombre, 'solucion', v_solucion)
  );
end;
$$;
grant execute on function clasificar_falla(text, uuid, text, text, text) to anon, authenticated;

-- Mantenimiento termina una falla (con el interruptor encendido): código,
-- qué se hizo y fin = ahora. Al cerrarse, la línea sigue sola
-- (paradas_mueven_lineas → reanudar_lineas_de_parada).
create or replace function finalizar_falla(
  p_usuario text,
  p_parada_id uuid,
  p_tipo_codigo text,
  p_solucion text,
  p_pagina text default 'Mantenimiento'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_p paradas;
  v_tipo paradas_tipos;
  v_nombre text;
  v_min integer;
  v_solucion text := nullif(btrim(coalesce(p_solucion, '')), '');
begin
  perform area_de_paradas_mantenimiento(p_usuario);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_p from paradas where id = p_parada_id for update;
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  if v_p.fin is not null then
    raise exception 'Esa falla ya terminó.';
  end if;
  if not la_termina_mantenimiento(p_parada_id) then
    raise exception 'Esa parada la termina Producción con Continuar.';
  end if;

  if v_solucion is null then
    raise exception 'Escribe qué se hizo para resolver la falla.';
  end if;
  select * into v_tipo from paradas_tipos where codigo = p_tipo_codigo and activo;
  if v_tipo.id is null or v_tipo.codigo in ('POR_CLASIFICAR', 'FALLA_SIN_ESPECIFICAR') then
    raise exception 'Elige el código de la parada del catálogo.';
  end if;
  v_nombre := nombre_tipo_en_linea(v_tipo, v_p.linea_id, (select area_id from lineas where id = v_p.linea_id));
  v_min := round(extract(epoch from (now() - v_p.inicio)) / 60);

  update paradas
  set tipo_id = v_tipo.id,
      clase = v_tipo.clase,
      tipo_nombre = v_nombre,
      tiempo_guia_min = case when v_tipo.clase = 'PROGRAMADA' then v_tipo.tiempo_guia_min else null end,
      solucion = left(v_solucion, 300),
      clasificada_por = v_usuario_id,
      clasificada_en = now(),
      fin = now()
  where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'paradas', p_parada_id::text, p_pagina,
    format('Terminó la falla de la %s como «%s» (%s min): %s', (select nombre from lineas where id = v_p.linea_id), v_nombre, v_min, v_solucion),
    jsonb_build_object('fin', null, 'tipo', v_p.tipo_nombre),
    jsonb_build_object('fin', now(), 'tipo', v_nombre, 'minutos', v_min, 'solucion', v_solucion)
  );
end;
$$;
grant execute on function finalizar_falla(text, uuid, text, text, text) to anon, authenticated;

-- continuar_linea(): copia de 20261111590000 que no deja continuar una falla
-- que termina Mantenimiento.
create or replace function continuar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_justificacion text default null
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
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa for update;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en Registrar Paradas antes de continuar.';
    end if;
    if v_le.parada_id is not null and la_termina_mantenimiento(v_le.parada_id) then
      raise exception 'Esta falla la termina Mantenimiento: la línea sigue sola cuando la terminen.';
    end if;

    perform soltar_parada_de_linea(p_usuario, p_turno_id, v_c.linea_id, 'Líneas (Continuar)', p_justificacion, true);
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
grant execute on function continuar_linea(text, uuid, uuid, text) to anon, authenticated;

-- paradas_que_detienen_lineas(): igual que 20261111590000 + la_termina_mantenimiento.
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
  la_termina_mantenimiento boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select l.codigo, p.id, p.pendiente, p.tipo_nombre, p.clase, p.tiempo_guia_min, p.nota,
         to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
         parada_de_mantenimiento(p.id),
         la_termina_mantenimiento(p.id)
  from lineas_estado le
  join lineas l on l.id = le.linea_id
  join paradas p on p.id = le.parada_id
  where le.turno_id = p_turno_id;
$$;
grant execute on function paradas_que_detienen_lineas(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Puente con el Sheet. La sincronización se envuelve para marcar la
--    transacción; los triggers solo actúan con esa marca.
-- ------------------------------------------------------------
alter function sincronizar_paradas_mantenimiento(text, jsonb) rename to sincronizar_paradas_mantenimiento_base;
revoke execute on function sincronizar_paradas_mantenimiento_base(text, jsonb) from public, anon, authenticated;

create or replace function sincronizar_paradas_mantenimiento(p_usuario text, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.sync_sheet', '1', true);
  return sincronizar_paradas_mantenimiento_base(p_usuario, p_filas);
end;
$$;
grant execute on function sincronizar_paradas_mantenimiento(text, jsonb) to anon, authenticated;

create or replace function paradas_puente_sheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_falla uuid := (select id from paradas_tipos where codigo = 'FALLA_SIN_ESPECIFICAR');
  v_candidatas uuid[];
  v_con_tipo boolean;
begin
  if coalesce(current_setting('app.sync_sheet', true), '') <> '1' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.origen = 'SHEET' then
    -- Fallas sin clasificar de la línea que se solapan con esta del Sheet.
    select array_agg(p.id) into v_candidatas
    from paradas p
    where p.linea_id = new.linea_id
      and p.tipo_id = v_falla
      and p.origen <> 'SHEET'
      and p.ref_sheet is null
      and not p.pendiente
      and p.inicio < coalesce(new.fin, now())
      and coalesce(p.fin, now()) > new.inicio;
    if coalesce(array_length(v_candidatas, 1), 0) <> 1 then
      return new;  -- ninguna o varias: entra como siempre
    end if;

    v_con_tipo := new.tipo_id is not null and new.tipo_id <> v_falla;
    update paradas
    set ref_sheet = new.ref_sheet,
        mtto_equipo = new.mtto_equipo,
        mtto_subsistema = new.mtto_subsistema,
        solucion = left(new.nota, 300),
        tipo_id = case when v_con_tipo then new.tipo_id else tipo_id end,
        clase = case when v_con_tipo then new.clase else clase end,
        tipo_nombre = case when v_con_tipo then new.tipo_nombre else tipo_nombre end,
        clasificada_en = case when v_con_tipo then now() else clasificada_en end
    where id = v_candidatas[1];

    perform registrar_auditoria(
      'sistema', 'EDITAR', 'paradas', v_candidatas[1]::text, 'Actualizar desde el Sheet',
      format('La falla de la %s tomó el reporte %s del Sheet de Mantenimiento', (select nombre from lineas where id = new.linea_id), new.ref_sheet),
      null,
      jsonb_build_object('ref_sheet', new.ref_sheet, 'solucion', new.nota, 'tipo', case when v_con_tipo then new.tipo_nombre end)
    );
    return null;  -- no entra como otra parada
  end if;

  if tg_op = 'UPDATE' and old.origen <> 'SHEET' and old.ref_sheet is not null then
    -- Una falla que tomó un reporte del Sheet: el inicio, la línea y la
    -- descripción son de quien la paró; del Sheet llega qué se hizo, el
    -- código si nadie la clasificó en la app y, si la termina Mantenimiento,
    -- el fin (al cerrar su reporte).
    new.linea_id := old.linea_id;
    new.inicio := old.inicio;
    if la_termina_mantenimiento(old.id) and new.fin is not null then
      new.fin := least(greatest(new.fin, old.inicio), now());
    else
      new.fin := old.fin;
    end if;
    new.solucion := left(new.nota, 300);
    new.nota := old.nota;
    if old.clasificada_por is not null or new.tipo_id is null or new.tipo_id = v_falla then
      new.tipo_id := old.tipo_id;
      new.clase := old.clase;
      new.tipo_nombre := old.tipo_nombre;
    elsif new.tipo_id is distinct from old.tipo_id then
      new.clasificada_en := now();
    end if;
    -- Nada nuevo del Sheet: no se escribe (ni cuenta como actualizada).
    if new is not distinct from old then
      return null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists paradas_puente_sheet on paradas;
create trigger paradas_puente_sheet
before insert or update on paradas
for each row execute function paradas_puente_sheet();

-- ------------------------------------------------------------
-- 4. listar_paradas(): igual que 20261090 + «solucion» y «la_termina_mantenimiento» al final.
-- ------------------------------------------------------------
drop function if exists listar_paradas(date, date, text, text, uuid, text);

create function listar_paradas(
  p_desde date,
  p_hasta date,
  p_linea text default null,
  p_clase text default null,
  p_turno_id uuid default null,
  p_area text default null
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
  supervisor_nombre text,
  pendiente boolean,
  solucion text,
  la_termina_mantenimiento boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.id,
    p_turno_id,
    e.clase,
    e.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    tt.codigo,
    t.codigo,
    e.tipo_nombre,
    e.tiempo_guia_min,
    e.nota,
    e.justificacion_desvio,
    to_char(e.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(e.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    coalesce((select pp.pendiente from paradas pp where pp.id = e.id), false),
    (select pp.solucion from paradas pp where pp.id = e.id),
    la_termina_mantenimiento(e.id)
  from paradas_efectivas_turno(p_turno_id) e
  join lineas l on l.id = e.linea_id
  join turnos tu on tu.id = p_turno_id
  join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = e.tipo_id
  left join usuarios u on u.id = e.creado_por
  where p_turno_id is not null
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or e.clase = p_clase)

  union all

  select
    p.id,
    p.turno_id,
    p.clase,
    p.origen,
    'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', ''),
    coalesce(tt.codigo, turno_tipo_por_hora(p.inicio at time zone 'America/Caracas')),
    t.codigo,
    p.tipo_nombre,
    p.tiempo_guia_min,
    p.nota,
    p.justificacion_desvio,
    to_char(p.inicio at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(p.fin at time zone 'America/Caracas', 'YYYY-MM-DD"T"HH24:MI:SS'),
    u.nombre,
    p.pendiente,
    p.solucion,
    la_termina_mantenimiento(p.id)
  from paradas p
  join lineas l on l.id = p.linea_id
  join areas ar on ar.id = l.area_id
  left join turnos tu on tu.id = p.turno_id
  left join turno_tipos tt on tt.id = tu.turno_tipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  where p_turno_id is null
    and (p.inicio at time zone 'America/Caracas')::date between p_desde and p_hasta
    and ((p_area is null and ar.codigo <> 'PRUEBAS') or ar.codigo = p_area)
    and (p_linea is null or 'LINEA_' || regexp_replace(upper(l.codigo), '^LINEA_T?', '') = p_linea)
    and (p_clase is null or p.clase = p_clase)

  order by 12 desc;
$$;
grant execute on function listar_paradas(date, date, text, text, uuid, text) to anon, authenticated;
