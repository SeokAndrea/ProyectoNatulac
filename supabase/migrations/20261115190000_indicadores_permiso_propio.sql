-- ============================================================
-- INDICADORES_VER: permiso propio para Indicadores (dueña, 2026-11-06)
-- ============================================================
-- Hasta hoy Indicadores y el Resumen Diario se abrían con el mismo permiso
-- (RESUMEN_VER, o VALIDAR): dar el Resumen a alguien (por ejemplo a los
-- supervisores de Mantenimiento) le abría también Indicadores. Ahora
-- Indicadores pide INDICADORES_VER.
--
--   1. Permiso INDICADORES_VER.
--   2. Se le da a todo puesto y a toda persona que HOY ve Indicadores
--      (tiene RESUMEN_VER o VALIDAR): nadie pierde el acceso que ya tenía.
--   3. puede_ver_indicadores(): INDICADORES_VER, o lo que ya podía validar
--      (VALIDAR y la dueña).
--   4. Las funciones de Indicadores que miraban puede_ver_resumen_dia pasan a
--      mirar puede_ver_indicadores. Se reescriben desde su definición vigente
--      (cambia solo esa llamada), así no se pisa ninguna versión posterior.
--      Guardar los datos del mes sigue siendo solo de la Analista y la dueña.
--
-- El Resumen Diario y lo que usa puede_ver_resumen_dia no cambia.
-- Se puede correr más de una vez.
-- ============================================================

insert into permisos (codigo, nombre, tema) values ('INDICADORES_VER', 'Ver los Indicadores', 'DATOS')
on conflict (codigo) do nothing;

-- 2. Quien ve Indicadores hoy lo sigue viendo.
insert into puesto_permisos (puesto_id, permiso_codigo)
select distinct pp.puesto_id, 'INDICADORES_VER'
from puesto_permisos pp
where pp.permiso_codigo in ('RESUMEN_VER', 'VALIDAR')
on conflict do nothing;

insert into usuario_permisos (usuario_id, permiso_codigo, otorgado_por)
select distinct up.usuario_id, 'INDICADORES_VER', up.otorgado_por
from usuario_permisos up
where up.permiso_codigo in ('RESUMEN_VER', 'VALIDAR')
on conflict do nothing;

-- 3. Quién puede ver Indicadores.
create or replace function puede_ver_indicadores(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select tiene_permiso(p_usuario, 'INDICADORES_VER') or puede_validar_dia(p_usuario);
$$;
revoke execute on function puede_ver_indicadores(text) from public, anon, authenticated;

-- 4. Las funciones de Indicadores pasan al permiso nuevo.
do $$
declare
  r record;
  v_def text;
  v_tocadas text[] := '{}';
  v_quedan text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('indicadores_meses', 'indicadores_turnos', 'guardar_observacion_indicador', 'guardar_indicadores_mes')
      and p.prosrc like '%puede_ver_resumen_dia(%'
  loop
    v_def := pg_get_functiondef(r.oid);
    execute replace(v_def, 'puede_ver_resumen_dia(', 'puede_ver_indicadores(');
    v_tocadas := v_tocadas || r.proname::text;
  end loop;
  raise notice 'Indicadores: pasaron a INDICADORES_VER %', coalesce(array_to_string(v_tocadas, ', '), '(ninguna)');

  -- Ninguna función de Indicadores debe seguir con el permiso del Resumen.
  select string_agg(p.proname, ', ') into v_quedan
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('indicadores_meses', 'indicadores_turnos', 'guardar_observacion_indicador')
    and p.prosrc like '%puede_ver_resumen_dia(%';
  if v_quedan is not null then
    raise exception 'Quedaron con el permiso del Resumen: %', v_quedan;
  end if;
end;
$$;
