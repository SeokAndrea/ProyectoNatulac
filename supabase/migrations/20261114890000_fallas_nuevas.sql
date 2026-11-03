-- ============================================================
-- FALLAS NUEVAS, QUITAR DEL CATÁLOGO Y ELIMINAR PARADAS
-- ============================================================
-- Dueña, 2026-11-02. Cuando la falla (o la parada) no existe en el catálogo
-- hoy no hay salida: el buscador termina en «Nada coincide». Ahora:
--
--   * «Falla nueva» es UNA falla real y reservada por equipo (Equipo ›
--     General › Sin clasificar › Falla nueva), más un equipo reservado
--     «Equipo no listado». Cuenta como cualquier otra (eficiencia, Top, SIF):
--     el detalle va en la observación de la parada y quien crea las fallas del
--     catálogo la lee. No se crea una fila por propuesta (embasuraba).
--   * «Parada nueva · <prefijo>» es un tipo reservado por cada grupo de
--     «Otras paradas» (PP, LNPE, OP, S…), disponible en todas las líneas.
--   * Cola «Fallas nuevas»: las paradas cuya falla que cuenta (la final, o la
--     de Producción si no hay final) o cuyo tipo es uno reservado y no se ha
--     revisado. Única acción: Descartar (marca revisada).
--   * Las filas reservadas no se cambian, desactivan ni quitan, y nadie puede
--     agregarles hijos propios.
--   * «Quitar» del catálogo (subsistema, falla, y por la misma regla sistema y
--     equipo): solo si nada lo usó (0 paradas, 0 solicitudes de intervención).
--     Auditoría con foto completa. Hoy un disparador bloquea todo borrado.
--   * Permiso PARADAS_ELIMINAR para eliminar paradas: las funciones ya
--     existían (con auditoría y guardas) pero su único filtro era un efecto de
--     area_de_paradas_mantenimiento y ninguna pantalla las llamaba.
--   * «¿Qué se realizó?» sube de 300 a 1000 caracteres.
--
-- Parte de la versión de listar_catalogo_fallas() de 20261114790000 (orden de
-- creación): no se pierde.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas
-- ------------------------------------------------------------
alter table catalogo_equipos add column if not exists reservada boolean not null default false;
alter table catalogo_sistemas add column if not exists reservada boolean not null default false;
alter table catalogo_subsistemas add column if not exists reservada boolean not null default false;
alter table catalogo_fallas add column if not exists reservada boolean not null default false;
alter table paradas_tipos add column if not exists reservada boolean not null default false;

alter table paradas add column if not exists revisada_en timestamptz;
alter table paradas add column if not exists revisada_por uuid references usuarios (id);
comment on column paradas.revisada_en is 'Cuándo se descartó de la cola «Fallas nuevas» (20261114890000).';

create index if not exists paradas_sin_revisar_idx on paradas (inicio) where revisada_en is null;

-- ------------------------------------------------------------
-- 2. Las filas reservadas no se tocan
-- ------------------------------------------------------------
create or replace function catalogo_reservada_intocable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Esta fila es reservada («Falla nueva» / «Parada nueva»): no se puede cambiar, desactivar ni quitar.';
end;
$$;

create trigger catalogo_equipos_reservada before update on catalogo_equipos
  for each row when (old.reservada) execute function catalogo_reservada_intocable();
create trigger catalogo_sistemas_reservada before update on catalogo_sistemas
  for each row when (old.reservada) execute function catalogo_reservada_intocable();
create trigger catalogo_subsistemas_reservada before update on catalogo_subsistemas
  for each row when (old.reservada) execute function catalogo_reservada_intocable();
create trigger catalogo_fallas_reservada before update on catalogo_fallas
  for each row when (old.reservada) execute function catalogo_reservada_intocable();
create trigger paradas_tipos_reservada before update on paradas_tipos
  for each row when (old.reservada) execute function catalogo_reservada_intocable();

-- Nadie le agrega hijos propios a lo reservado (la «Falla nueva» queda sola en su subsistema).
create or replace function catalogo_sin_hijos_en_reservada()
returns trigger
language plpgsql
as $$
begin
  if not new.reservada then
    if tg_table_name = 'catalogo_fallas'
       and exists (select 1 from catalogo_subsistemas u where u.id = new.subsistema_id and u.reservada) then
      raise exception 'El subsistema «Sin clasificar» es reservado: ahí solo vive la «Falla nueva».';
    elsif tg_table_name = 'catalogo_subsistemas'
       and exists (select 1 from catalogo_sistemas s where s.id = new.sistema_id and s.reservada) then
      raise exception 'El sistema «General» es reservado: no se le agregan subsistemas.';
    end if;
  end if;
  return new;
end;
$$;

create trigger catalogo_fallas_sin_hijos before insert on catalogo_fallas
  for each row execute function catalogo_sin_hijos_en_reservada();
create trigger catalogo_subsistemas_sin_hijos before insert on catalogo_subsistemas
  for each row execute function catalogo_sin_hijos_en_reservada();

-- ------------------------------------------------------------
-- 3. «Falla nueva» por equipo (y «Equipo no listado»)
-- ------------------------------------------------------------
create or replace function asegurar_falla_nueva_equipo(p_equipo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sis uuid;
  v_sub uuid;
  v_falla uuid;
  v_suf text;
  n integer := 0;
begin
  select s.id into v_sis from catalogo_sistemas s where s.equipo_id = p_equipo_id and s.reservada;
  if v_sis is null then
    v_suf := 'GEN';
    while exists (select 1 from catalogo_sistemas where equipo_id = p_equipo_id and sufijo = v_suf) loop
      n := n + 1;
      v_suf := 'GEN' || n;
    end loop;
    insert into catalogo_sistemas (equipo_id, sufijo, nombre, reservada)
    values (p_equipo_id, v_suf, 'General', true)
    returning id into v_sis;
  end if;

  select u.id into v_sub from catalogo_subsistemas u where u.sistema_id = v_sis and u.reservada;
  if v_sub is null then
    insert into catalogo_subsistemas (sistema_id, sufijo, nombre, reservada)
    values (v_sis, 'SIN', 'Sin clasificar', true)
    returning id into v_sub;
  end if;

  select f.id into v_falla from catalogo_fallas f where f.subsistema_id = v_sub and f.reservada;
  if v_falla is null then
    insert into catalogo_fallas (subsistema_id, numero, nombre, clase, reservada)
    values (v_sub, 1, 'Falla nueva', 'NO_PROGRAMADA', true)
    returning id into v_falla;
  end if;
  return v_falla;
end;
$$;
revoke execute on function asegurar_falla_nueva_equipo(uuid) from public, anon, authenticated;

create or replace function fn_equipo_falla_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform asegurar_falla_nueva_equipo(new.id);
  return new;
end;
$$;

drop trigger if exists catalogo_equipos_falla_nueva on catalogo_equipos;
create trigger catalogo_equipos_falla_nueva after insert on catalogo_equipos
  for each row execute function fn_equipo_falla_nueva();

-- El equipo reservado: sale en todas las líneas (tipo SERVICIOS). Su «Falla nueva» la crea el disparador.
do $$
declare
  v_suf text := 'ENL';
  n integer := 0;
begin
  if not exists (select 1 from catalogo_equipos where reservada) then
    while exists (select 1 from catalogo_equipos where sufijo = v_suf) loop
      n := n + 1;
      v_suf := 'ENL' || n;
    end loop;
    insert into catalogo_equipos (sufijo, nombre, tipo, reservada)
    values (v_suf, 'Equipo no listado', 'SERVICIOS', true);
  end if;
end;
$$;

-- Relleno de los equipos que ya existían (idempotente).
select asegurar_falla_nueva_equipo(id) from catalogo_equipos;

-- ------------------------------------------------------------
-- 4. «Parada nueva» por grupo de «Otras paradas»
-- ------------------------------------------------------------
-- Un grupo = un prefijo de planilla (PP, LNPE, OP, S…), como los agrupa la app.
-- Las mecánicas (EQUIPO, EQUIPO_PROCESO) van en el catálogo de fallas y Ocioso ya
-- acepta texto libre, así que no llevan. Sin líneas asignadas = todas las líneas.
create or replace function asegurar_parada_nueva(p_prefijo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into paradas_tipos (codigo, nombre, clase, familia, prefijo_planilla, secuencia_planilla, codigo_con_linea, orden, reservada)
  select 'PARADA_NUEVA_' || g.prefijo,
         'Parada nueva · ' || g.prefijo,
         case g.familia when 'PROGRAMADA' then 'PROGRAMADA' else 'NO_PROGRAMADA' end,
         g.familia,
         g.prefijo,
         case when g.numerado then 99 end,
         g.con_linea,
         9000,
         true
  from (
    select t.prefijo_planilla as prefijo,
           (array_agg(t.familia order by t.orden, t.codigo))[1] as familia,
           bool_or(t.secuencia_planilla is not null) as numerado,
           bool_or(t.codigo_con_linea) as con_linea
    from paradas_tipos t
    where not t.reservada
      and t.prefijo_planilla <> ''
      and t.familia not in ('EQUIPO', 'EQUIPO_PROCESO', 'OCIOSO')
      and (p_prefijo is null or t.prefijo_planilla = p_prefijo)
    group by t.prefijo_planilla
  ) g
  on conflict (codigo) do nothing;
end;
$$;
revoke execute on function asegurar_parada_nueva(text) from public, anon, authenticated;

create or replace function fn_tipo_parada_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform asegurar_parada_nueva(new.prefijo_planilla);
  return new;
end;
$$;

drop trigger if exists paradas_tipos_parada_nueva on paradas_tipos;
create trigger paradas_tipos_parada_nueva after insert on paradas_tipos
  for each row when (not new.reservada) execute function fn_tipo_parada_nueva();

select asegurar_parada_nueva();

-- listar_paradas_tipos() no cambia de forma: la app reconoce las reservadas por su código PARADA_NUEVA_*.

-- ------------------------------------------------------------
-- 5. Lectura del catálogo: + reservada (parte de 20261114790000)
-- ------------------------------------------------------------
-- Última versión: 20261114790000_catalogo_orden_creacion.sql
create or replace function listar_catalogo_fallas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'sufijo', e.sufijo, 'nombre', e.nombre, 'tipo', e.tipo, 'activo', e.activo, 'creado_en', e.creado_en, 'reservada', e.reservada,
        'lineas', coalesce((select jsonb_agg(el.linea_id) from catalogo_equipos_lineas el where el.equipo_id = e.id), '[]'::jsonb)
      ) order by e.creado_en, e.sufijo)
      from catalogo_equipos e), '[]'::jsonb),
    'sistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'equipo_id', s.equipo_id, 'sufijo', s.sufijo, 'nombre', s.nombre, 'activo', s.activo,
                                          'creado_en', s.creado_en, 'reservada', s.reservada)
                       order by s.creado_en, s.sufijo)
      from catalogo_sistemas s), '[]'::jsonb),
    'subsistemas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'sistema_id', u.sistema_id, 'sufijo', u.sufijo, 'nombre', u.nombre,
                                          'codigo_sheet', u.codigo_sheet, 'activo', u.activo, 'creado_en', u.creado_en, 'reservada', u.reservada)
                       order by u.creado_en, u.sufijo)
      from catalogo_subsistemas u), '[]'::jsonb),
    'fallas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'subsistema_id', f.subsistema_id, 'numero', f.numero, 'nombre', f.nombre, 'clase', f.clase, 'activo', f.activo,
        'reservada', f.reservada,
        'codigo', e.sufijo || '-' || s.sufijo || '-' || u.sufijo || '-' || lpad(f.numero::text, 2, '0')
      ) order by f.subsistema_id, f.numero)
      from catalogo_fallas f
      join catalogo_subsistemas u on u.id = f.subsistema_id
      join catalogo_sistemas s on s.id = u.sistema_id
      join catalogo_equipos e on e.id = s.equipo_id), '[]'::jsonb)
  );
$$;
grant execute on function listar_catalogo_fallas() to anon, authenticated;

-- ------------------------------------------------------------
-- 6. La cola «Fallas nuevas»
-- ------------------------------------------------------------
create or replace function parada_es_nueva(p_parada_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from paradas p
    left join catalogo_fallas f on f.id = coalesce(p.falla_final_id, p.falla_produccion_id)
    left join paradas_tipos t on t.id = p.tipo_id
    where p.id = p_parada_id and (coalesce(f.reservada, false) or coalesce(t.reservada, false))
  );
$$;
revoke execute on function parada_es_nueva(uuid) from public, anon, authenticated;

create or replace function puede_ver_fallas_nuevas(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'CATALOGO_PARADAS') or tiene_permiso(p_usuario, 'CATALOGO_PARADAS_VER') or coalesce(es_dueno(p_usuario), false);
$$;
revoke execute on function puede_ver_fallas_nuevas(text) from public, anon, authenticated;

create or replace function listar_fallas_nuevas(p_usuario text)
returns table (
  parada_id uuid,
  linea_codigo text,
  linea_nombre text,
  origen text,
  tipo_nombre text,
  nota text,
  solucion text,
  creada_por text,
  inicio timestamptz,
  fin timestamptz,
  minutos integer,
  terminada boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not puede_ver_fallas_nuevas(p_usuario) then
    raise exception 'No tienes permiso para ver las fallas nuevas.';
  end if;
  return query
  select p.id, l.codigo, l.nombre,
         coalesce(e.nombre, t.nombre),
         p.tipo_nombre, p.nota, p.solucion, u.nombre,
         p.inicio, p.fin,
         round(extract(epoch from (coalesce(p.fin, now()) - p.inicio)) / 60)::integer,
         (p.fin is not null and not p.pendiente)
  from paradas p
  join lineas l on l.id = p.linea_id
  left join catalogo_fallas f on f.id = coalesce(p.falla_final_id, p.falla_produccion_id)
  left join catalogo_subsistemas su on su.id = f.subsistema_id
  left join catalogo_sistemas si on si.id = su.sistema_id
  left join catalogo_equipos e on e.id = si.equipo_id
  left join paradas_tipos t on t.id = p.tipo_id
  left join usuarios u on u.id = p.creado_por
  where p.revisada_en is null
    and (coalesce(f.reservada, false) or coalesce(t.reservada, false))
  order by p.inicio desc;
end;
$$;
grant execute on function listar_fallas_nuevas(text) to anon, authenticated;

create or replace function descartar_fallas_nuevas(p_usuario text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_n integer;
begin
  with hechas as (
    update paradas p
    set revisada_en = now(), revisada_por = v_uid
    where p.id = any (coalesce(p_ids, '{}'))
      and p.revisada_en is null
      and parada_es_nueva(p.id)
    returning p.id
  )
  select count(*) into v_n from hechas;

  if v_n > 0 then
    perform registrar_auditoria(p_usuario, 'EDITAR', 'paradas', 'fallas-nuevas', 'Catálogo de Paradas',
      format('Descartó %s de la cola «Fallas nuevas»', v_n), null,
      jsonb_build_object('paradas', to_jsonb(p_ids), 'descartadas', v_n));
  end if;
  return v_n;
end;
$$;
grant execute on function descartar_fallas_nuevas(text, uuid[]) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Quitar del catálogo lo que nunca se usó
-- ------------------------------------------------------------
-- El disparador de «no se borra» deja pasar solo a quitar_catalogo(), que
-- enciende la señal dentro de su propia transacción (mismo patrón que
-- natulac.corregir_corrida_entregada).
create or replace function catalogo_no_borrar()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('natulac.catalogo_quitar', true), '') = 'on' then
    return old;
  end if;
  raise exception 'El catálogo de paradas no se borra: se desactiva.';
end;
$$;

create or replace function catalogo_fallas_de_nivel(p_nivel text, p_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(f.id), '{}'::uuid[])
  from catalogo_fallas f
  where case p_nivel
    when 'FALLA' then f.id = p_id
    when 'SUBSISTEMA' then f.subsistema_id = p_id
    when 'SISTEMA' then f.subsistema_id in (select u.id from catalogo_subsistemas u where u.sistema_id = p_id)
    when 'EQUIPO' then f.subsistema_id in (
      select u.id from catalogo_subsistemas u join catalogo_sistemas s on s.id = u.sistema_id where s.equipo_id = p_id)
    else false
  end;
$$;
revoke execute on function catalogo_fallas_de_nivel(text, uuid) from public, anon, authenticated;

-- Cuánto usa algo del catálogo: lo que la pantalla muestra antes de quitar.
create or replace function uso_catalogo(p_nivel text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := catalogo_fallas_de_nivel(p_nivel, p_id);
  v_nombre text;
  v_reservada boolean;
begin
  if p_nivel = 'FALLA' then
    select nombre, reservada into v_nombre, v_reservada from catalogo_fallas where id = p_id;
  elsif p_nivel = 'SUBSISTEMA' then
    select nombre, reservada into v_nombre, v_reservada from catalogo_subsistemas where id = p_id;
  elsif p_nivel = 'SISTEMA' then
    select nombre, reservada into v_nombre, v_reservada from catalogo_sistemas where id = p_id;
  elsif p_nivel = 'EQUIPO' then
    select nombre, reservada into v_nombre, v_reservada from catalogo_equipos where id = p_id;
  else
    raise exception 'Nivel del catálogo no válido.';
  end if;
  if v_nombre is null then
    raise exception 'No se encontró lo que quieres quitar.';
  end if;
  return jsonb_build_object(
    'nombre', v_nombre,
    'reservada', coalesce(v_reservada, false),
    'fallas', coalesce(array_length(v_ids, 1), 0),
    'paradas', (select count(*) from paradas p where p.falla_produccion_id = any (v_ids) or p.falla_final_id = any (v_ids)),
    'sif', (select count(*) from solicitudes_intervencion s where s.falla_id = any (v_ids))
  );
end;
$$;
grant execute on function uso_catalogo(text, uuid) to anon, authenticated;

create or replace function quitar_catalogo(p_usuario text, p_nivel text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := exigir_editor_catalogo(p_usuario);
  v_uso jsonb;
  v_ids uuid[] := catalogo_fallas_de_nivel(p_nivel, p_id);
  v_foto jsonb;
  v_fallas jsonb;
begin
  if p_nivel not in ('FALLA', 'SUBSISTEMA', 'SISTEMA', 'EQUIPO') then
    raise exception 'Nivel del catálogo no válido.';
  end if;
  v_uso := uso_catalogo(p_nivel, p_id);
  if (v_uso ->> 'reservada')::boolean then
    raise exception 'Es una fila reservada: no se puede quitar.';
  end if;
  if (v_uso ->> 'paradas')::integer > 0 or (v_uso ->> 'sif')::integer > 0 then
    raise exception 'No se puede quitar «%»: ya lo usan % paradas y % solicitudes de intervención. Desactívalo.',
      v_uso ->> 'nombre', v_uso ->> 'paradas', v_uso ->> 'sif';
  end if;

  -- Foto completa para la auditoría: la fila ya no va a existir.
  select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo_falla(f.id), 'nombre', f.nombre, 'clase', f.clase) order by f.numero), '[]'::jsonb)
  into v_fallas
  from catalogo_fallas f where f.id = any (v_ids);

  if p_nivel = 'FALLA' then
    select jsonb_build_object('codigo', codigo_falla(f.id), 'nombre', f.nombre, 'clase', f.clase) into v_foto from catalogo_fallas f where f.id = p_id;
  elsif p_nivel = 'SUBSISTEMA' then
    select jsonb_build_object('sufijo', u.sufijo, 'nombre', u.nombre, 'codigo_sheet', u.codigo_sheet, 'sistema_id', u.sistema_id) into v_foto
    from catalogo_subsistemas u where u.id = p_id;
  elsif p_nivel = 'SISTEMA' then
    select jsonb_build_object('sufijo', s.sufijo, 'nombre', s.nombre, 'equipo_id', s.equipo_id) into v_foto from catalogo_sistemas s where s.id = p_id;
  else
    select jsonb_build_object('sufijo', e.sufijo, 'nombre', e.nombre, 'tipo', e.tipo) into v_foto from catalogo_equipos e where e.id = p_id;
  end if;

  perform set_config('natulac.catalogo_quitar', 'on', true);
  if p_nivel = 'FALLA' then
    delete from catalogo_fallas where id = p_id;
  elsif p_nivel = 'SUBSISTEMA' then
    delete from catalogo_fallas where subsistema_id = p_id;
    delete from catalogo_subsistemas where id = p_id;
  elsif p_nivel = 'SISTEMA' then
    delete from catalogo_fallas where id = any (v_ids);
    delete from catalogo_subsistemas where sistema_id = p_id;
    delete from catalogo_sistemas where id = p_id;
  else
    delete from catalogo_fallas where id = any (v_ids);
    delete from catalogo_subsistemas where sistema_id in (select id from catalogo_sistemas where equipo_id = p_id);
    delete from catalogo_sistemas where equipo_id = p_id;
    delete from catalogo_equipos_lineas where equipo_id = p_id;
    delete from catalogo_equipos where id = p_id;
  end if;
  perform set_config('natulac.catalogo_quitar', 'off', true);

  perform registrar_auditoria(p_usuario, 'ELIMINAR', 'catalogo_' || lower(p_nivel), p_id::text, 'Catálogo de Paradas',
    format('Quitó %s «%s» del catálogo (nunca se usó; %s fallas)', lower(p_nivel), v_uso ->> 'nombre', v_uso ->> 'fallas'),
    jsonb_build_object('nivel', p_nivel, 'datos', v_foto, 'fallas', v_fallas),
    null);

  return jsonb_build_object('nivel', p_nivel, 'nombre', v_uso ->> 'nombre', 'fallas', v_uso ->> 'fallas');
end;
$$;
grant execute on function quitar_catalogo(text, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Eliminar paradas: permiso propio
-- ------------------------------------------------------------
insert into permisos (codigo, nombre, tema) values ('PARADAS_ELIMINAR', 'Eliminar paradas', 'PARADAS')
on conflict (codigo) do nothing;

-- Última versión: 20261111090000_arreglos_revision_bloqueos.sql (solo cambia el filtro de quién puede).
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
  v_p paradas;
begin
  if not (tiene_permiso(p_usuario, 'PARADAS_ELIMINAR') or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'No tienes permiso para eliminar paradas.';
  end if;
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
                       'nota', v_p.nota, 'solucion', v_p.solucion, 'pendiente', v_p.pendiente),
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
  v_p paradas;
begin
  if not (tiene_permiso(p_usuario, 'PARADAS_ELIMINAR') or coalesce(es_dueno(p_usuario), false)) then
    raise exception 'No tienes permiso para eliminar paradas.';
  end if;
  select * into v_p from paradas where id = p_parada_id and origen = 'MANTENIMIENTO';
  if not found then
    raise exception 'No se encontró la parada.';
  end if;
  perform exigir_parada_borrable(p_parada_id);

  delete from paradas where id = p_parada_id;

  perform registrar_auditoria(
    p_usuario, 'ELIMINAR', 'paradas', p_parada_id::text, p_pagina,
    format('Mantenimiento eliminó la parada «%s»', v_p.tipo_nombre),
    jsonb_build_object('tipo', v_p.tipo_nombre, 'linea_id', v_p.linea_id, 'inicio', v_p.inicio, 'fin', v_p.fin,
                       'nota', v_p.nota, 'solucion', v_p.solucion),
    null
  );
end;
$$;

-- ------------------------------------------------------------
-- 9. «¿Qué se realizó?»: de 300 a 1000 caracteres
-- ------------------------------------------------------------
-- Se parchea la definición VIGENTE en la base (terminar_parada y
-- clasificar_falla_mantenimiento, y cualquier otra que la corte igual) en vez
-- de copiar cientos de líneas: solo cambia ese número.
do $$
declare
  v_def text;
begin
  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%left(v_solucion, 300)%'
  loop
    execute replace(v_def, 'left(v_solucion, 300)', 'left(v_solucion, 1000)');
  end loop;
end;
$$;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
