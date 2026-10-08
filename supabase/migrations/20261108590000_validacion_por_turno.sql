-- ============================================================
-- RESUMEN DIARIO: la analista corrige las cajas POR TURNO
-- ============================================================
-- Dueña, 2026-10-08: la corrección del mensaje de WhatsApp ya no es una
-- sola por sabor + presentación del día, sino por turno. El número
-- oficial del día es la suma de los turnos: lo corregido donde se
-- corrigió y lo del supervisor donde no.
--
--   * validacion_turno: confirmar o corregir las cajas de un sabor +
--     presentación en UN turno.
--   * validacion_dia (20261099190000) queda para los días ya validados
--     con la corrección global: si un sabor + presentación no tiene
--     correcciones por turno, sigue valiendo la global (en la app).
-- ============================================================

create table if not exists validacion_turno (
  turno_id uuid not null references turnos (id) on delete cascade,
  sabor_nombre text not null,
  volumen_ml integer not null,
  estado text not null check (estado in ('CONFIRMADO', 'EDITADO')),
  -- Total corregido de ese turno; null = vale lo del supervisor.
  cajas integer check (cajas is null or cajas >= 0),
  nota text,
  validado_por uuid references usuarios (id) on delete set null,
  validado_en timestamptz not null default now(),
  primary key (turno_id, sabor_nombre, volumen_ml)
);
alter table validacion_turno enable row level security;

-- ------------------------------------------------------------
-- Lectura: las de los turnos de la jornada (por turnos.fecha)
-- ------------------------------------------------------------
create or replace function validacion_turnos_de(p_usuario text, p_area_codigo text, p_fecha date)
returns table (
  turno_id uuid,
  sabor_nombre text,
  presentacion_volumen_ml integer,
  estado text,
  cajas integer,
  nota text,
  validado_por_nombre text,
  validado_en timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver el resumen del día.';
  end if;

  return query
  select vt.turno_id, vt.sabor_nombre, vt.volumen_ml, vt.estado, vt.cajas, vt.nota, u.nombre, vt.validado_en
  from validacion_turno vt
  join turnos t on t.id = vt.turno_id
  join areas a on a.id = t.area_id
  left join usuarios u on u.id = vt.validado_por
  where a.codigo = p_area_codigo and t.fecha = p_fecha;
end;
$$;
grant execute on function validacion_turnos_de(text, text, date) to anon, authenticated;

-- ------------------------------------------------------------
-- Confirmar (p_cajas null) o corregir (p_cajas) un sabor + presentación de un turno
-- ------------------------------------------------------------
create or replace function validar_turno(
  p_usuario text,
  p_turno_id uuid,
  p_sabor_nombre text,
  p_volumen_ml integer,
  p_cajas integer default null,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
  v_usuario_id uuid;
  v_antes validacion_turno;
  v_estado text := case when p_cajas is null then 'CONFIRMADO' else 'EDITADO' end;
begin
  if not puede_validar_dia(p_usuario) then
    raise exception 'No tienes permiso para validar producción.';
  end if;
  if p_cajas is not null and p_cajas < 0 then
    raise exception 'Las cajas no pueden ser negativas.';
  end if;
  select * into v_turno from turnos where id = p_turno_id;
  if v_turno.id is null then
    raise exception 'No se encontró el turno.';
  end if;

  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);
  select * into v_antes from validacion_turno
  where turno_id = p_turno_id and sabor_nombre = p_sabor_nombre and volumen_ml = p_volumen_ml;

  insert into validacion_turno (turno_id, sabor_nombre, volumen_ml, estado, cajas, nota, validado_por, validado_en)
  values (p_turno_id, p_sabor_nombre, p_volumen_ml, v_estado, p_cajas, nullif(trim(coalesce(p_nota, '')), ''), v_usuario_id, now())
  on conflict (turno_id, sabor_nombre, volumen_ml) do update
    set estado = excluded.estado,
        cajas = excluded.cajas,
        nota = excluded.nota,
        validado_por = excluded.validado_por,
        validado_en = now();

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'validacion_turno', format('%s %s %s', v_turno.codigo, p_sabor_nombre, p_volumen_ml), 'Resumen Diario',
    format('%s %s ml del turno %s: %s', p_sabor_nombre, p_volumen_ml, v_turno.codigo,
           case when p_cajas is null then 'confirmó lo del supervisor' else format('corrigió a %s cajas', p_cajas) end),
    case when v_antes.turno_id is null then null else jsonb_strip_nulls(jsonb_build_object('estado', v_antes.estado, 'cajas', v_antes.cajas, 'nota', v_antes.nota)) end,
    jsonb_strip_nulls(jsonb_build_object('estado', v_estado, 'cajas', p_cajas, 'nota', nullif(trim(coalesce(p_nota, '')), '')))
  );
end;
$$;
grant execute on function validar_turno(text, uuid, text, integer, integer, text) to anon, authenticated;
