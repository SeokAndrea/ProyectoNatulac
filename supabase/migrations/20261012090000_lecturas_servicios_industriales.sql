-- ============================================================
-- SERVICIOS INDUSTRIALES: lecturas meramente visuales en el Panel
-- ============================================================
-- Dos valores que Servicios Industriales reporta (Temperatura del
-- Quantum, Agua Osmotizada) y que se muestran arriba de la grilla de
-- Tanques en el Panel de Producción — informativos, no alimentan
-- ningún cálculo de merma ni de otro tipo.
--
-- Se guarda como tabla de lecturas (una fila nueva por actualización,
-- no un upsert de una sola fila) para tener quién/cuándo de cada
-- cambio gratis, mismo patrón que contadores/producto_terminado. El
-- Panel siempre lee la más reciente.
-- ============================================================

create table servicios_industriales_lecturas (
  id uuid primary key default gen_random_uuid(),
  temperatura_quantum numeric,
  agua_osmotizada numeric,
  usuario_id uuid references usuarios (id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table servicios_industriales_lecturas enable row level security;
create index servicios_industriales_lecturas_creado_en_idx on servicios_industriales_lecturas (creado_en desc);

-- ------------------------------------------------------------
-- registrar_lectura_servicios_industriales(): guarda una lectura
-- nueva. Al menos uno de los dos valores tiene que venir — no tiene
-- sentido una fila vacía.
-- ------------------------------------------------------------
create function registrar_lectura_servicios_industriales(
  p_usuario text,
  p_temperatura_quantum numeric default null,
  p_agua_osmotizada numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_id uuid;
begin
  if p_temperatura_quantum is null and p_agua_osmotizada is null then
    raise exception 'Cargá al menos un valor.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into servicios_industriales_lecturas (temperatura_quantum, agua_osmotizada, usuario_id)
  values (p_temperatura_quantum, p_agua_osmotizada, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'servicios_industriales_lecturas', v_id::text, 'Panel de Producción',
    format('Servicios Industriales%s%s',
           case when p_temperatura_quantum is not null then format(' · Temp. Quantum %s', p_temperatura_quantum) else '' end,
           case when p_agua_osmotizada is not null then format(' · Agua Osmotizada %s', p_agua_osmotizada) else '' end),
    null,
    jsonb_build_object('temperatura_quantum', p_temperatura_quantum, 'agua_osmotizada', p_agua_osmotizada)
  );

  return lectura_servicios_industriales_actual();
end;
$$;

grant execute on function registrar_lectura_servicios_industriales(text, numeric, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- lectura_servicios_industriales_actual(): la más reciente, o null
-- si todavía no se cargó ninguna.
-- ------------------------------------------------------------
create function lectura_servicios_industriales_actual()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'temperatura_quantum', l.temperatura_quantum,
    'agua_osmotizada', l.agua_osmotizada,
    'actualizado_en', l.creado_en,
    'actualizado_por_nombre', u.nombre
  )
  from servicios_industriales_lecturas l
  left join usuarios u on u.id = l.usuario_id
  order by l.creado_en desc
  limit 1;
$$;

grant execute on function lectura_servicios_industriales_actual() to anon, authenticated;
