-- ============================================================
-- SERVICIOS INDUSTRIALES: asociar cada lectura al turno real abierto
-- ============================================================
-- Pedido: sumar Temperatura del Quantum / Agua Osmotizada / Gasoil al
-- Acta de Aséptico, y dejarlo ya listo para cuando se haga el Panel
-- Analítico (cruza merma con estas variables por fecha, ver
-- plan-panel-analitico). servicios_industriales_lecturas era un log
-- completamente global — sin turno_id no había forma de saber qué
-- lectura corresponde a qué turno/jornada.
--
-- turno_id se resuelve solo, al cargar la lectura: el turno real
-- (nunca Pruebas) que esté ABIERTO en ese momento — no depende de que
-- el área de Servicios Industriales elija nada. Si no hay ninguno
-- abierto (entre turnos), queda null — no bloquea la carga, sigue
-- siendo informativo.
-- ============================================================

alter table servicios_industriales_lecturas add column turno_id uuid references turnos (id) on delete set null;

drop function if exists registrar_lectura_servicios_industriales(text, numeric, numeric, numeric);

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
  v_turno_id uuid;
  v_id uuid;
begin
  if p_temperatura_quantum is null and p_agua_osmotizada is null and p_gasoil is null then
    raise exception 'Carga al menos un valor.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select t.id into v_turno_id
  from turnos t
  join areas a on a.id = t.area_id
  where t.estado = 'ABIERTO' and a.codigo <> 'PRUEBAS'
  order by t.fecha desc, t.hora_inicio desc, t.created_at desc
  limit 1;

  insert into servicios_industriales_lecturas (temperatura_quantum, agua_osmotizada, gasoil, usuario_id, turno_id)
  values (p_temperatura_quantum, p_agua_osmotizada, p_gasoil, v_usuario_id, v_turno_id)
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
-- listar_lecturas_servicios_industriales_de_turno(): las lecturas de
-- ESE turno puntual, en orden cronológico — para el Acta.
-- ------------------------------------------------------------
create or replace function listar_lecturas_servicios_industriales_de_turno(p_turno_id uuid)
returns table (
  temperatura_quantum numeric,
  agua_osmotizada numeric,
  gasoil numeric,
  actualizado_en timestamptz,
  actualizado_por_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select l.temperatura_quantum, l.agua_osmotizada, l.gasoil, l.creado_en, u.nombre
  from servicios_industriales_lecturas l
  left join usuarios u on u.id = l.usuario_id
  where l.turno_id = p_turno_id
  order by l.creado_en asc;
$$;

grant execute on function listar_lecturas_servicios_industriales_de_turno(uuid) to anon, authenticated;
