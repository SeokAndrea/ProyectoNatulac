-- ============================================================
-- TARJETAS OCULTAS: cada persona esconde las tarjetas que no usa
-- ============================================================
-- Dueña, 2026-10-31: desde Ajustes cada uno elige qué tarjetas ve en el
-- inicio y en el menú. Se guarda en su CUENTA (no en el dispositivo): en
-- planta varios comparten equipo. Esconder no quita permisos: la pantalla
-- sigue abriendo si alguien llega por enlace.
-- ============================================================

alter table usuarios add column if not exists tarjetas_ocultas text[] not null default '{}';
comment on column usuarios.tarjetas_ocultas is 'Slugs de src/lib/apps.tsx que la persona escondió desde Ajustes (20261113690000).';

create or replace function listar_tarjetas_ocultas(p_usuario text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select tarjetas_ocultas from usuarios where usuario = lower(p_usuario)), '{}');
$$;
grant execute on function listar_tarjetas_ocultas(text) to anon, authenticated;

create or replace function guardar_tarjetas_ocultas(p_usuario text, p_slugs text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update usuarios
  set tarjetas_ocultas = coalesce((select array_agg(distinct left(s, 60)) from unnest(coalesce(p_slugs, '{}')) s where btrim(s) <> ''), '{}')
  where usuario = lower(p_usuario) and activo;
  if not found then
    raise exception 'No se encontró tu usuario.';
  end if;
end;
$$;
grant execute on function guardar_tarjetas_ocultas(text, text[]) to anon, authenticated;

-- Regla de 20261109690000: cada función nueva con p_usuario revisa que sea el de la credencial.
select * from asegurar_control_usuario();
