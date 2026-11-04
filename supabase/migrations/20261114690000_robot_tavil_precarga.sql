-- ============================================================
-- Robot Tavil: precarga de paletas y Resto por corrida
-- ============================================================
-- Aprobado (Alexander y Andrea, 2026-11-04). Ver
-- docs/superpowers/specs/2026-11-04-operador-robot-tavil-design.md.
--
-- Quien tiene el permiso ROBOT_TAVIL_CARGAR ve las líneas activas del área de
-- planta (Pruebas si su sesión es de Pruebas; si no, Aséptico) y, por cada
-- paleta que sale del robot, toca «+» en su línea. El «−» anula la última.
-- El Resto (cajas sueltas que quedan al terminar el lote) es un número por
-- corrida. Esto es una PRECARGA: no toca producto_terminado. El supervisor la
-- ve en la tarjeta de Producto Terminado y la confirma o la corrige con
-- registrar_producto_terminado de siempre; lo del operador queda guardado
-- aparte, así la diferencia se ve.
--
-- Qué corrida cuenta el operador en cada línea (robot_tavil_seguimiento):
--   * La primera vez, la corrida abierta más reciente de la línea.
--   * Si el supervisor ENTREGA la línea, el turno siguiente abre una corrida
--     nueva del mismo lote: el seguimiento pasa solo a esa. Las paletas que
--     salen mientras tanto quedan sin corrida y se le pegan al pasar.
--   * Si el supervisor TERMINA la corrida, la línea se bloquea. Cuando cargue
--     otro lote, el operador toca «Iniciar con el lote …» para pasar a él.
-- Una corrida está abierta para el robot si sigue activa o esperando su PT
-- (activa = false y sin finalizada_en) y no se entregó: el mismo criterio de
-- la tarjeta de Producto Terminado.
-- ============================================================

-- ------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------
create table if not exists robot_tavil_paletas (
  id uuid primary key default gen_random_uuid(),
  linea_id uuid not null references lineas (id),
  -- null = salió con la línea entregada y el turno siguiente todavía sin abrir.
  turno_linea_id uuid references turno_lineas (id) on delete cascade,
  creada_en timestamptz not null default now(),
  creada_por uuid references usuarios (id),
  -- El «−» no borra: anula, así queda lo que cargó el operador.
  anulada_en timestamptz,
  anulada_por uuid references usuarios (id)
);
create index if not exists robot_tavil_paletas_corrida on robot_tavil_paletas (turno_linea_id) where anulada_en is null;
create index if not exists robot_tavil_paletas_sin_corrida on robot_tavil_paletas (linea_id) where turno_linea_id is null and anulada_en is null;
alter table robot_tavil_paletas enable row level security;
comment on table robot_tavil_paletas is 'Una fila por paleta que sale del Robot Tavil (precarga del PT). El «−» la anula (20261114690000).';

create table if not exists robot_tavil_resto (
  turno_linea_id uuid primary key references turno_lineas (id) on delete cascade,
  cajas integer not null check (cajas >= 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references usuarios (id)
);
alter table robot_tavil_resto enable row level security;
comment on table robot_tavil_resto is 'Resto del Robot Tavil: cajas sueltas de la corrida que no llegaron a formar paleta (20261114690000).';

create table if not exists robot_tavil_seguimiento (
  linea_id uuid primary key references lineas (id),
  turno_linea_id uuid not null references turno_lineas (id) on delete cascade,
  -- La corrida que contaba antes: para el aviso «el lote X cerró con N paletas».
  anterior_turno_linea_id uuid references turno_lineas (id) on delete set null,
  desde timestamptz not null default now()
);
alter table robot_tavil_seguimiento enable row level security;
comment on table robot_tavil_seguimiento is 'Qué corrida cuenta el operador del Robot Tavil en cada línea (20261114690000).';

-- ------------------------------------------------------------
-- Permiso
-- ------------------------------------------------------------
-- No se da a ningún puesto: se asigna desde Áreas y puestos o como permiso extra.
insert into permisos (codigo, nombre, tema)
values ('ROBOT_TAVIL_CARGAR', 'Cargar paletas del Robot Tavil', 'TURNOS')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- Ayudas internas (no se exponen)
-- ------------------------------------------------------------
-- ¿El operador todavía puede cargar en esta corrida?
create or replace function robot_tavil_corrida_abierta(p_turno_linea_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (tl.activa or tl.finalizada_en is null) and tl.entregada_en is null
    from turno_lineas tl
    where tl.id = p_turno_linea_id
  ), false);
$$;
revoke execute on function robot_tavil_corrida_abierta(uuid) from public, anon, authenticated;

-- La corrida abierta más reciente de la línea, en un turno abierto.
create or replace function robot_tavil_corrida_vigente(p_linea_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tl.id
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  where tl.linea_id = p_linea_id
    and t.estado = 'ABIERTO'
    and (tl.activa or tl.finalizada_en is null)
    and tl.entregada_en is null
  order by t.created_at desc, tl.activada_en desc
  limit 1;
$$;
revoke execute on function robot_tavil_corrida_vigente(uuid) from public, anon, authenticated;

-- ¿p_nueva es la continuación en otro turno de p_anterior, que se entregó?
create or replace function robot_tavil_es_continuacion(p_anterior uuid, p_nueva uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.entregada_en is not null
       and n.turno_id <> a.turno_id
       and n.linea_id = a.linea_id
       and (n.lote_id = a.lote_id or (n.lote_id is null and a.lote_id is null and n.lote is not distinct from a.lote))
    from turno_lineas a, turno_lineas n
    where a.id = p_anterior and n.id = p_nueva
  ), false);
$$;
revoke execute on function robot_tavil_es_continuacion(uuid, uuid) from public, anon, authenticated;

-- Área de planta del operador: Pruebas si su sesión es de Pruebas; si no, Aséptico.
create or replace function robot_tavil_area(p_usuario text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area text;
begin
  select area_codigo into v_area from rol_y_area_de(p_usuario);
  return (select a.id from areas a where a.codigo = case when v_area = 'PRUEBAS' then 'PRUEBAS' else 'ASEPTICO' end);
end;
$$;
revoke execute on function robot_tavil_area(text) from public, anon, authenticated;

/*
 * Pone al día el seguimiento de cada línea del área: adopta la corrida
 * vigente si la línea no tenía, y pasa a la continuación de una corrida
 * entregada (con las paletas que quedaron sin corrida).
 */
create or replace function robot_tavil_sincronizar(p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linea record;
  v_vigente uuid;
  v_seguida uuid;
begin
  for v_linea in select l.id from lineas l where l.area_id = p_area_id and l.activo loop
    v_vigente := robot_tavil_corrida_vigente(v_linea.id);
    select s.turno_linea_id into v_seguida from robot_tavil_seguimiento s where s.linea_id = v_linea.id;
    if not found then
      if v_vigente is not null then
        insert into robot_tavil_seguimiento (linea_id, turno_linea_id) values (v_linea.id, v_vigente)
        on conflict (linea_id) do nothing;
      end if;
    elsif v_vigente is not null and v_vigente <> v_seguida and robot_tavil_es_continuacion(v_seguida, v_vigente) then
      update robot_tavil_seguimiento
      set turno_linea_id = v_vigente, anterior_turno_linea_id = v_seguida, desde = now()
      where linea_id = v_linea.id;
      update robot_tavil_paletas
      set turno_linea_id = v_vigente
      where linea_id = v_linea.id and turno_linea_id is null and anulada_en is null;
    end if;
  end loop;
end;
$$;
revoke execute on function robot_tavil_sincronizar(uuid) from public, anon, authenticated;

/*
 * Estado de una línea para el operador (después de sincronizar):
 *   EN_CURSO    cuenta en la corrida seguida.
 *   LOTE_NUEVO  el supervisor cargó otra corrida en la línea: hay que tocar
 *               «Iniciar con el lote …». Si la seguida sigue abierta, se puede
 *               seguir sumando en ella hasta entonces.
 *   ENTREGADA   la seguida se entregó y el turno siguiente no abrió: las
 *               paletas quedan sin corrida hasta que abra.
 *   TERMINADA   la seguida se cerró y no hay lote nuevo: no se carga nada.
 */
create or replace function robot_tavil_estado_linea(
  p_linea_id uuid,
  out estado text,
  out seguida uuid,
  out vigente uuid,
  out seguida_abierta boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select s.turno_linea_id into seguida from robot_tavil_seguimiento s where s.linea_id = p_linea_id;
  vigente := robot_tavil_corrida_vigente(p_linea_id);
  if seguida is null then
    estado := null;
    return;
  end if;
  seguida_abierta := robot_tavil_corrida_abierta(seguida);
  if vigente is not null and vigente <> seguida then
    estado := 'LOTE_NUEVO';
  elsif seguida_abierta then
    estado := 'EN_CURSO';
  elsif (select tl.entregada_en is not null from turno_lineas tl where tl.id = seguida) then
    estado := 'ENTREGADA';
  else
    estado := 'TERMINADA';
  end if;
end;
$$;
revoke execute on function robot_tavil_estado_linea(uuid) from public, anon, authenticated;

-- Datos de una corrida para la pantalla: lote, sabor, presentación, paletas y Resto.
create or replace function robot_tavil_corrida_json(p_turno_linea_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', tl.id,
    'lote', tl.lote,
    'sabor_nombre', sabor_display(s.nombre, f.nombre),
    'presentacion_volumen_ml', p.volumen_ml,
    'paletas', (select count(*) from robot_tavil_paletas rp where rp.turno_linea_id = tl.id and rp.anulada_en is null),
    'ultima_paleta_en', (select max(rp.creada_en) from robot_tavil_paletas rp where rp.turno_linea_id = tl.id and rp.anulada_en is null),
    'resto', coalesce((select r.cajas from robot_tavil_resto r where r.turno_linea_id = tl.id), 0),
    'entregada', tl.entregada_en is not null
  )
  from turno_lineas tl
  left join presentaciones p on p.id = tl.presentacion_id
  left join sabores s on s.id = tl.sabor_id
  left join familias_producto f on f.id = s.familia_id
  where tl.id = p_turno_linea_id;
$$;
revoke execute on function robot_tavil_corrida_json(uuid) from public, anon, authenticated;

-- Pantalla completa del operador: una entrada por línea con algo que mostrar.
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
  v_actual jsonb;
  v_anterior uuid;
  v_cerrada_en timestamptz;
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
                       then robot_tavil_corrida_json(v_anterior) end
    );
  end loop;
  return jsonb_build_object('lineas', v_lineas);
end;
$$;
revoke execute on function robot_tavil_pantalla(uuid) from public, anon, authenticated;

-- Permiso + área + seguimiento al día, para toda función del operador.
create or replace function robot_tavil_preparar(p_funcion text, p_usuario text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid;
begin
  perform public.exigir_usuario(p_funcion, p_usuario);
  if not tiene_permiso(p_usuario, 'ROBOT_TAVIL_CARGAR') then
    raise exception 'No tienes permiso para cargar paletas del Robot Tavil.';
  end if;
  v_area := robot_tavil_area(p_usuario);
  if v_area is null then
    raise exception 'No se encontró el área de planta.';
  end if;
  perform robot_tavil_sincronizar(v_area);
  return v_area;
end;
$$;
revoke execute on function robot_tavil_preparar(text, text) from public, anon, authenticated;

-- La línea por código, dentro del área del operador.
create or replace function robot_tavil_linea(p_area_id uuid, p_linea_codigo text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_linea uuid;
begin
  select l.id into v_linea from lineas l where l.codigo = p_linea_codigo and l.area_id = p_area_id;
  if v_linea is null then
    raise exception 'Esa línea no existe en tu área.';
  end if;
  return v_linea;
end;
$$;
revoke execute on function robot_tavil_linea(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Funciones del operador
-- ------------------------------------------------------------
create or replace function robot_tavil_estado(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- En su propia instrucción: la pantalla (stable) tiene que ver lo que sincronizó.
  v_area uuid := robot_tavil_preparar('robot_tavil_estado', p_usuario);
begin
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_estado(text) to anon, authenticated;

-- «+»: una paleta más en la línea.
create or replace function robot_tavil_sumar(p_usuario text, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_sumar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  select * into v_e from robot_tavil_estado_linea(v_linea);
  if v_e.estado = 'EN_CURSO' or (v_e.estado = 'LOTE_NUEVO' and v_e.seguida_abierta) then
    insert into robot_tavil_paletas (linea_id, turno_linea_id, creada_por) values (v_linea, v_e.seguida, v_usuario);
  elsif v_e.estado = 'ENTREGADA' then
    insert into robot_tavil_paletas (linea_id, turno_linea_id, creada_por) values (v_linea, null, v_usuario);
  elsif v_e.estado = 'LOTE_NUEVO' then
    raise exception 'El supervisor cargó un lote nuevo en esta línea. Toca «Iniciar con el lote» antes de sumar.';
  else
    raise exception 'Esta línea no tiene una corrida en curso.';
  end if;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_sumar(text, text) to anon, authenticated;

-- «−»: anula la última paleta de la línea (de la corrida en curso, o la última sin corrida).
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
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_restar(text, text) to anon, authenticated;

-- Resto: el total de cajas sueltas de la corrida en curso (se reemplaza, no se suma).
create or replace function robot_tavil_guardar_resto(p_usuario text, p_linea_codigo text, p_cajas integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_guardar_resto', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  if p_cajas is null or p_cajas < 0 then
    raise exception 'El Resto tiene que ser un número de cajas, 0 o más.';
  end if;
  select * into v_e from robot_tavil_estado_linea(v_linea);
  if not (v_e.estado = 'EN_CURSO' or (v_e.estado = 'LOTE_NUEVO' and v_e.seguida_abierta)) then
    raise exception 'Esta línea no tiene una corrida en curso: el Resto no se puede cambiar.';
  end if;
  insert into robot_tavil_resto (turno_linea_id, cajas, actualizado_en, actualizado_por)
  values (v_e.seguida, p_cajas, now(), v_usuario)
  on conflict (turno_linea_id) do update
    set cajas = excluded.cajas, actualizado_en = now(), actualizado_por = v_usuario;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_guardar_resto(text, text, integer) to anon, authenticated;

-- «Iniciar con el lote …»: pasa a contar en la corrida nueva de la línea.
create or replace function robot_tavil_iniciar(p_usuario text, p_linea_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_iniciar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
begin
  select * into v_e from robot_tavil_estado_linea(v_linea);
  if v_e.estado is distinct from 'LOTE_NUEVO' then
    raise exception 'Esta línea no tiene un lote nuevo para iniciar.';
  end if;
  update robot_tavil_seguimiento
  set turno_linea_id = v_e.vigente, anterior_turno_linea_id = v_e.seguida, desde = now()
  where linea_id = v_linea;
  -- Las que salieron con la línea entregada pasan a la corrida nueva.
  update robot_tavil_paletas
  set turno_linea_id = v_e.vigente
  where linea_id = v_linea and turno_linea_id is null and anulada_en is null;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_iniciar(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- Para el supervisor: la precarga de las corridas de un turno
-- ------------------------------------------------------------
-- Solo lectura (no sincroniza: eso lo hace la pantalla del operador).
create or replace function listar_precarga_robot_tavil(p_usuario text, p_turno_id uuid)
returns table (
  turno_linea_id uuid,
  paletas integer,
  ultima_paleta_en timestamptz,
  ultima_paleta_por text,
  resto integer,
  resto_en timestamptz,
  resto_por text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_usuario('listar_precarga_robot_tavil', p_usuario);
  return query
  select tl.id,
         coalesce(pa.n, 0)::integer,
         pa.ultima,
         pu.nombre,
         r.cajas,
         r.actualizado_en,
         ru.nombre
  from turno_lineas tl
  left join lateral (
    select count(*) as n, max(rp.creada_en) as ultima
    from robot_tavil_paletas rp
    where rp.turno_linea_id = tl.id and rp.anulada_en is null
  ) pa on true
  left join lateral (
    select u.nombre from robot_tavil_paletas rp join usuarios u on u.id = rp.creada_por
    where rp.turno_linea_id = tl.id and rp.anulada_en is null
    order by rp.creada_en desc limit 1
  ) pu on true
  left join robot_tavil_resto r on r.turno_linea_id = tl.id
  left join usuarios ru on ru.id = r.actualizado_por
  where tl.turno_id = p_turno_id
    and (coalesce(pa.n, 0) > 0 or r.turno_linea_id is not null);
end;
$$;
grant execute on function listar_precarga_robot_tavil(text, uuid) to anon, authenticated;
