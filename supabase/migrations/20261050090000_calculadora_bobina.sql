-- ============================================================
-- CALCULADORA DE BOBINA — envases restantes según medida de bobina
-- ============================================================
-- Daniela mide a mano, con una regla, la distancia entre el borde
-- de la bobina de material de empaque y el core, y hoy tiene que
-- caminar hasta la PC para sacar la cuenta en el Excel "Control de
-- Existencias" (hoja "Cálculos", bloques "CALCULO DE ENVASES ...").
--
-- Fórmula confirmada ahí (se replica el literal 3.1416 tal cual usa
-- el Excel, no PI(), para que el resultado calce con lo que ella ya
-- conoce):
--
--   envases = ROUNDUP( 3.1416 * B * (B + Dcore) / espesor / largo, 0 )
--
-- donde B es la distancia medida (cm) y Dcore/espesor/largo son
-- constantes fijas por tipo de envase — quedan en esta tabla en vez
-- de hardcodeadas en el frontend, mismo patrón que presentaciones/
-- sabores (RLS activado sin políticas, solo RPC security definer).
-- ============================================================

create table tipos_bobina (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  diametro_core_cm numeric not null,
  espesor_cm numeric not null,
  largo_envase_cm numeric not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into tipos_bobina (nombre, diametro_core_cm, espesor_cm, largo_envase_cm) values
  ('TP 250cc', 15.75, 0.0382, 18.5),
  ('TP 200cc', 15.75, 0.03712, 16),
  ('TB 1000cc', 16.5, 0.0479, 28.5),
  ('TB 500cc', 12, 0.0479, 18.41),
  ('TP 330cc', 15.75, 0.04015, 18.7);

alter table tipos_bobina enable row level security;

create or replace function listar_tipos_bobina()
returns table (
  tipo_id uuid,
  nombre text,
  diametro_core_cm numeric,
  espesor_cm numeric,
  largo_envase_cm numeric,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select t.id, t.nombre, t.diametro_core_cm, t.espesor_cm, t.largo_envase_cm, t.activo
  from tipos_bobina t
  order by t.nombre;
end;
$$;

grant execute on function listar_tipos_bobina() to anon, authenticated;

create trigger auditar_tipos_bobina after insert or update or delete on tipos_bobina for each row execute function auditar_cambio();

-- ------------------------------------------------------------
-- Historial: cada medición que Daniela (o quien sea) guarda queda
-- como una fila, agrupada por la fecha de jornada de planta (la
-- calcula el frontend con fechaJornadaPlanta(), igual que
-- Programación — ver src/lib/tiempoPlanta.ts). Es un log, no un
-- catálogo: solo se inserta, nunca se edita ni se borra, por eso se
-- audita explícito (mismo patrón que
-- registrar_lectura_servicios_industriales en 20261045090000) en vez
-- de colgarle el trigger genérico.
-- ------------------------------------------------------------
create table calculadora_bobina_historial (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo_bobina_id uuid not null references tipos_bobina (id),
  distancia_cm numeric not null,
  envases integer not null,
  usuario_id uuid references usuarios (id),
  creado_en timestamptz not null default now()
);

alter table calculadora_bobina_historial enable row level security;

create or replace function guardar_calculo_bobina(
  p_usuario text,
  p_fecha date,
  p_tipo_bobina_id uuid,
  p_distancia_cm numeric,
  p_envases integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_tipo_nombre text;
  v_id uuid;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select nombre into v_tipo_nombre from tipos_bobina where id = p_tipo_bobina_id;
  if v_tipo_nombre is null then
    raise exception 'Tipo de bobina no encontrado.';
  end if;

  insert into calculadora_bobina_historial (fecha, tipo_bobina_id, distancia_cm, envases, usuario_id)
  values (p_fecha, p_tipo_bobina_id, p_distancia_cm, p_envases, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'calculadora_bobina_historial', v_id::text, 'Calculadora de Bobina',
    format('%s · medida %s cm · %s envases', v_tipo_nombre, p_distancia_cm, p_envases),
    null,
    jsonb_build_object('tipo_bobina', v_tipo_nombre, 'distancia_cm', p_distancia_cm, 'envases', p_envases)
  );

  return v_id;
end;
$$;

grant execute on function guardar_calculo_bobina(text, date, uuid, numeric, integer) to anon, authenticated;

create or replace function listar_calculos_bobina(p_fecha date)
returns table (
  id uuid,
  tipo_bobina_id uuid,
  tipo_bobina_nombre text,
  distancia_cm numeric,
  envases integer,
  usuario text,
  creado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select h.id, h.tipo_bobina_id, t.nombre, h.distancia_cm, h.envases, u.usuario, h.creado_en
  from calculadora_bobina_historial h
  join tipos_bobina t on t.id = h.tipo_bobina_id
  left join usuarios u on u.id = h.usuario_id
  where h.fecha = p_fecha
  order by h.creado_en desc;
end;
$$;

grant execute on function listar_calculos_bobina(date) to anon, authenticated;
