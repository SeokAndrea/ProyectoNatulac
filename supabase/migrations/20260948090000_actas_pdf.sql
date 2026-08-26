-- ============================================================
-- ACTAS EN PDF — tabla + versionado + bucket de Storage
-- ============================================================
-- Reemplaza el "Generar Acta (PDF)" de window.print() (dependía de que
-- el navegador tenga "Guardar como PDF", no dejaba nada guardado) por
-- un PDF real: se genera del lado del cliente (jsPDF, ver
-- src/lib/actaPdf.ts) y se sube a Storage — acá solo va la
-- contabilidad de versiones. Corregir un acta (turno reabierto, ver
-- 20260949090000_reabrir_turno_y_administrador_area.sql, y vuelto a
-- cerrar) ANULA la versión anterior pero su PDF sigue disponible para
-- descargar — nunca se borra ni se sobreescribe el archivo viejo.
--
-- Primer uso de Supabase Storage en este proyecto: como el resto de la
-- app no usa Supabase Auth (todo pasa por RPCs con la key "anon", sin
-- auth.uid() real), el bucket queda público — mismo modelo de
-- seguridad que ya tiene el resto del sistema, no uno nuevo.
-- ============================================================

create table actas (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos (id) on delete cascade,
  version integer not null,
  codigo text not null,
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE', 'ANULADA')),
  storage_path text not null,
  generado_por uuid references usuarios (id),
  generado_en timestamptz not null default now(),
  unique (turno_id, version)
);

alter table actas enable row level security;

-- ------------------------------------------------------------
-- Bucket público "actas" + policies mínimas para que el cliente
-- (key anon) pueda subir y leer los PDF.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('actas', 'actas', true)
on conflict (id) do nothing;

-- storage.objects ya viene con RLS activado de fábrica en Supabase (lo
-- administra Supabase mismo) — el rol de la migración no tiene permiso
-- para ALTER TABLE sobre esa tabla, solo para crear policies, que es
-- lo único que hace falta acá.
create policy "actas_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'actas');

create policy "actas_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'actas');

-- ------------------------------------------------------------
-- registrar_acta(): el PDF ya se subió a Storage del lado del
-- cliente — esto solo calcula la versión, anula la vigente anterior
-- (si hay) y arma el código ACTAV{n}_{codigo del turno}.
-- ------------------------------------------------------------
create or replace function registrar_acta(p_usuario text, p_turno_id uuid, p_storage_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_version integer;
  v_codigo_turno text;
  v_codigo text;
  v_acta actas%rowtype;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select codigo into v_codigo_turno from turnos where id = p_turno_id;
  if v_codigo_turno is null then
    raise exception 'Ese turno no existe.';
  end if;

  select coalesce(max(version) + 1, 0) into v_version from actas where turno_id = p_turno_id;

  update actas set estado = 'ANULADA' where turno_id = p_turno_id and estado = 'VIGENTE';

  v_codigo := 'ACTAV' || v_version || '_' || v_codigo_turno;

  insert into actas (turno_id, version, codigo, estado, storage_path, generado_por)
  values (p_turno_id, v_version, v_codigo, 'VIGENTE', p_storage_path, v_usuario_id)
  returning * into v_acta;

  return jsonb_build_object(
    'id', v_acta.id,
    'turno_id', v_acta.turno_id,
    'version', v_acta.version,
    'codigo', v_acta.codigo,
    'estado', v_acta.estado,
    'storage_path', v_acta.storage_path,
    'generado_en', v_acta.generado_en
  );
end;
$$;

grant execute on function registrar_acta(text, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- listar_actas(): para la pestaña "Actas" de Auditoría — mismo
-- criterio de alcance por rol/área que listar_turnos_historial
-- (ver 20260949090000_reabrir_turno_y_administrador_area.sql).
-- ------------------------------------------------------------
create or replace function listar_actas(
  p_usuario text,
  p_area_codigo text default null,
  p_fecha_desde date default null,
  p_fecha_hasta date default null
)
returns table (
  acta_id uuid,
  turno_id uuid,
  version integer,
  codigo text,
  estado text,
  storage_path text,
  generado_en timestamptz,
  turno_codigo text,
  fecha date,
  supervisor_nombre text,
  area_codigo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_area text;
  v_area_efectiva text;
begin
  select * into v_rol, v_area from rol_y_area_de(p_usuario);
  if v_rol not in ('SUPERADMINISTRADOR', 'ADMINISTRADOR_AREA') then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  v_area_efectiva := case when v_rol = 'SUPERADMINISTRADOR' then p_area_codigo else v_area end;

  return query
  select ac.id, ac.turno_id, ac.version, ac.codigo, ac.estado, ac.storage_path, ac.generado_en,
         t.codigo, t.fecha, u.nombre, a.codigo
  from actas ac
  join turnos t on t.id = ac.turno_id
  join usuarios u on u.id = t.supervisor_id
  join areas a on a.id = t.area_id
  where (p_fecha_desde is null or t.fecha >= p_fecha_desde)
    and (p_fecha_hasta is null or t.fecha <= p_fecha_hasta)
    and (
      (v_area_efectiva is not null and a.codigo = v_area_efectiva)
      or (v_area_efectiva is null and a.codigo <> 'PRUEBAS')
    )
  order by ac.generado_en desc;
end;
$$;

grant execute on function listar_actas(text, text, date, date) to anon, authenticated;
