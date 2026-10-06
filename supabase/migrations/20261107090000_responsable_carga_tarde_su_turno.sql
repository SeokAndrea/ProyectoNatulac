-- ============================================================
-- El responsable carga tarde contadores y PT de SU turno cerrado
-- ============================================================
-- Dueña, 2026-10-06: el supervisor que cerró el turno sin el contador (la
-- línea estaba parada o en CIP) no podía subirlo después de los 30 min de
-- gracia sin que alguien con TURNO_CORREGIR abriera la corrección, y el
-- acta salía con la merma mal. Ahora:
--
--   * exigir_turno_escribible(): el responsable del turno (supervisor_id o
--     quien figure en turno_responsables) puede cargar DATOS (contador y
--     PT, p_solo_datos) hasta 24 h después del cierre, sin permiso extra.
--     Cambios de estado (tanques, líneas) siguen solo con el turno abierto.
--   * turno_pt_gracia_de(): además del turno del área cerrado hace menos de
--     30 min (igual que antes), ofrece el último turno propio cerrado hace
--     menos de 24 h. Producto Terminado lo muestra en modo "turno cerrado".
--   * mi_turno_detalle(): también para quien figure en turno_responsables,
--     para que el navegador regenere el acta (versión nueva en Mis Actas).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ¿El usuario fue responsable de ese turno?
-- ------------------------------------------------------------
create or replace function es_responsable_turno(p_usuario text, p_turno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from turnos t
    join usuarios u on u.usuario = lower(p_usuario)
    where t.id = p_turno_id
      and (
        t.supervisor_id = u.id
        or exists (select 1 from turno_responsables r where r.turno_id = t.id and r.usuario_id = u.id)
      )
  );
$$;
revoke execute on function es_responsable_turno(text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. exigir_turno_escribible(): + responsable, 24 h, solo datos.
-- ------------------------------------------------------------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function exigir_turno_escribible(p_usuario text, p_turno_id uuid, p_solo_datos boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno turnos;
begin
  select * into v_turno from turnos where id = p_turno_id;
  if not found then
    raise exception 'No se encontró el turno.';
  end if;
  if v_turno.estado = 'ABIERTO' then
    return;
  end if;

  if not p_solo_datos then
    raise exception 'Este turno ya está cerrado: no se pueden cambiar tanques ni líneas. Recarga la página para ver el turno en curso.';
  end if;

  if fin_de_turno(v_turno) >= now() - interval '30 minutes' then
    return;
  end if;
  -- El responsable del turno carga tarde lo suyo (contador y PT) durante 24 h.
  if fin_de_turno(v_turno) >= now() - interval '24 hours' and es_responsable_turno(p_usuario, p_turno_id) then
    return;
  end if;
  if correccion_activa(p_usuario, p_turno_id) then
    return;
  end if;

  raise exception 'Este turno se cerró hace más de 30 minutos. Solo su responsable puede cargar datos durante 24 h; si no, alguien con permiso de corrección debe abrirlo desde Auditoría.';
end;
$$;
revoke execute on function exigir_turno_escribible(text, uuid, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. turno_pt_gracia_de(): + el último turno propio cerrado hace < 24 h.
-- ------------------------------------------------------------
-- Última versión: 20261082090000_turno_cerrado_gracia_y_correccion.sql
create or replace function turno_pt_gracia_de(p_usuario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area text;
  v_turno_id uuid;
begin
  select area_codigo into v_area from rol_y_area_de(p_usuario);
  v_area := coalesce(v_area, 'ASEPTICO');

  select t.id into v_turno_id
  from turnos t
  join areas a on a.id = t.area_id
  where a.codigo = v_area
    and t.estado = 'CERRADO'
    and fin_de_turno(t) >= now() - interval '30 minutes'
  order by t.updated_at desc
  limit 1;

  if v_turno_id is null then
    select t.id into v_turno_id
    from turnos t
    join areas a on a.id = t.area_id
    where a.codigo = v_area
      and t.estado = 'CERRADO'
      and fin_de_turno(t) >= now() - interval '24 hours'
      and es_responsable_turno(p_usuario, t.id)
    order by fin_de_turno(t) desc
    limit 1;
  end if;

  if v_turno_id is null then
    return null;
  end if;

  return turno_json(v_turno_id);
end;
$$;

-- ------------------------------------------------------------
-- 4. mi_turno_detalle(): también para quien figure como responsable.
-- ------------------------------------------------------------
-- Última versión: 20261058090000_actas_pendientes_cierre_automatico.sql
create or replace function mi_turno_detalle(p_usuario text, p_turno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_responsable_turno(p_usuario, p_turno_id) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return turno_json(p_turno_id);
end;
$$;
grant execute on function mi_turno_detalle(text, uuid) to anon, authenticated;
