-- ============================================================
-- SERVICIOS INDUSTRIALES: sumar Gasoil (L) a Temperatura del Quantum
-- y Agua Osmotizada
-- ============================================================
-- Mismo patrón que los otros dos valores (ver 20261012090000): otro
-- campo meramente informativo, opcional, que se guarda en la misma
-- fila de lectura. No alimenta ningún cálculo de merma ni de otro
-- tipo.
-- ============================================================

alter table servicios_industriales_lecturas add column gasoil numeric;

drop function if exists registrar_lectura_servicios_industriales(text, numeric, numeric);

create function registrar_lectura_servicios_industriales(
  p_usuario text,
  p_temperatura_quantum numeric default null,
  p_agua_osmotizada numeric default null,
  p_gasoil numeric default null
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
  if p_temperatura_quantum is null and p_agua_osmotizada is null and p_gasoil is null then
    raise exception 'Carga al menos un valor.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  insert into servicios_industriales_lecturas (temperatura_quantum, agua_osmotizada, gasoil, usuario_id)
  values (p_temperatura_quantum, p_agua_osmotizada, p_gasoil, v_usuario_id)
  returning id into v_id;

  perform registrar_auditoria(
    p_usuario, 'CREAR', 'servicios_industriales_lecturas', v_id::text, 'Panel de Producción',
    format('Servicios Industriales%s%s%s',
           case when p_temperatura_quantum is not null then format(' · Temp. Quantum %s', p_temperatura_quantum) else '' end,
           case when p_agua_osmotizada is not null then format(' · Agua Osmotizada %s', p_agua_osmotizada) else '' end,
           case when p_gasoil is not null then format(' · Gasoil %s L', p_gasoil) else '' end),
    null,
    jsonb_build_object('temperatura_quantum', p_temperatura_quantum, 'agua_osmotizada', p_agua_osmotizada, 'gasoil', p_gasoil)
  );

  return lectura_servicios_industriales_actual();
end;
$$;

grant execute on function registrar_lectura_servicios_industriales(text, numeric, numeric, numeric) to anon, authenticated;

-- ------------------------------------------------------------
-- lectura_servicios_industriales_actual(): suma el gasoil a la lectura.
-- ------------------------------------------------------------
create or replace function lectura_servicios_industriales_actual()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'temperatura_quantum', l.temperatura_quantum,
    'agua_osmotizada', l.agua_osmotizada,
    'gasoil', l.gasoil,
    'actualizado_en', l.creado_en,
    'actualizado_por_nombre', u.nombre
  )
  from servicios_industriales_lecturas l
  left join usuarios u on u.id = l.usuario_id
  order by l.creado_en desc
  limit 1;
$$;

grant execute on function lectura_servicios_industriales_actual() to anon, authenticated;
