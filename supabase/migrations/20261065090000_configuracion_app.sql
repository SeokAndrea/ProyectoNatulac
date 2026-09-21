-- ============================================================
-- AJUSTES DE LA APP (clave → valor)
-- ============================================================
-- Primer uso: el enlace fijo del Google Sheet de Mantenimiento
-- ('sheet_mantenimiento_url', ver plan-eficiencia-meta.md, sección 7), para no
-- pegarlo cada vez. Lo lee cualquier sesión (el botón «Sincronizar» lo usa) y
-- solo lo cambia un SUPERADMINISTRADOR, con auditoría.
-- Las claves permitidas están en una lista blanca dentro de las funciones.
-- ============================================================

create table configuracion_app (
  clave text primary key,
  valor text,
  updated_at timestamptz not null default now(),
  updated_by uuid references usuarios (id)
);

alter table configuracion_app enable row level security;

create or replace function obtener_configuracion(p_clave text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_clave not in ('sheet_mantenimiento_url') then
    raise exception 'Ajuste desconocido.';
  end if;
  return (select valor from configuracion_app where clave = p_clave);
end;
$$;

grant execute on function obtener_configuracion(text) to anon, authenticated;

create or replace function guardar_configuracion(
  p_usuario text,
  p_clave text,
  p_valor text,
  p_pagina text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_usuario_id uuid;
  v_antes text;
  v_valor text := nullif(trim(coalesce(p_valor, '')), '');
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol is distinct from 'SUPERADMINISTRADOR' then
    raise exception 'No tienes permiso para cambiar los ajustes.';
  end if;
  if p_clave not in ('sheet_mantenimiento_url') then
    raise exception 'Ajuste desconocido.';
  end if;
  if p_clave = 'sheet_mantenimiento_url' and v_valor is not null
     and v_valor !~ '^https://docs\.google\.com/spreadsheets/' then
    raise exception 'El enlace tiene que ser de un Google Sheet (https://docs.google.com/spreadsheets/…).';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select valor into v_antes from configuracion_app where clave = p_clave;

  insert into configuracion_app (clave, valor, updated_at, updated_by)
  values (p_clave, v_valor, now(), v_usuario_id)
  on conflict (clave) do update
    set valor = excluded.valor, updated_at = now(), updated_by = v_usuario_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'configuracion_app', p_clave, p_pagina,
    format('Cambió el ajuste «%s»', p_clave),
    jsonb_build_object('valor', v_antes),
    jsonb_build_object('valor', v_valor)
  );
end;
$$;

grant execute on function guardar_configuracion(text, text, text, text) to anon, authenticated;
