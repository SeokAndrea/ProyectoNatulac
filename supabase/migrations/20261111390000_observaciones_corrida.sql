-- ============================================================
-- OBSERVACIONES DE CORRIDA (Resumen Diario → Indicadores)
-- ============================================================
-- Dueña, 2026-10-20: en el Resumen Diario, en "Contadores y merma", cada
-- lote del día abre sus paradas de la línea y se le puede guardar una
-- observación (qué pasó con esa merma). En Indicadores, la pantalla de cada
-- línea muestra "Ver observaciones guardadas" del mes.
--
-- Una observación por corrida (turno_lineas.id). Texto vacío la borra.
-- Leen y escriben quienes ven el Resumen Diario (puede_ver_resumen_dia).
-- ============================================================

create table observaciones_corrida (
  turno_linea_id uuid primary key references turno_lineas (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 400),
  actualizado_por uuid references usuarios (id),
  actualizado_en timestamptz not null default now()
);

alter table observaciones_corrida enable row level security;

-- ------------------------------------------------------------
-- Guardar (o borrar, con texto vacío)
-- ------------------------------------------------------------
create or replace function guardar_observacion_corrida(p_usuario text, p_turno_linea_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
  v_antes text;
  v_resumen text;
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para escribir observaciones.';
  end if;
  if length(v_texto) > 400 then
    raise exception 'La observación pasa de 400 letras.';
  end if;

  select format('%s · %s · lote %s', l.nombre, to_char(t.fecha, 'DD/MM/YYYY'), coalesce(tl.lote, '—'))
  into v_resumen
  from turno_lineas tl
  join turnos t on t.id = tl.turno_id
  join lineas l on l.id = tl.linea_id
  where tl.id = p_turno_linea_id;
  if v_resumen is null then
    raise exception 'No se encontró esa corrida.';
  end if;

  select texto into v_antes from observaciones_corrida where turno_linea_id = p_turno_linea_id;

  if v_texto is null then
    delete from observaciones_corrida where turno_linea_id = p_turno_linea_id;
  else
    insert into observaciones_corrida (turno_linea_id, texto, actualizado_por, actualizado_en)
    values (p_turno_linea_id, v_texto, (select id from usuarios where usuario = lower(p_usuario)), now())
    on conflict (turno_linea_id) do update
      set texto = excluded.texto,
          actualizado_por = excluded.actualizado_por,
          actualizado_en = now();
  end if;

  if v_antes is distinct from v_texto then
    perform registrar_auditoria(
      p_usuario,
      case when v_texto is null then 'ELIMINAR' when v_antes is null then 'CREAR' else 'EDITAR' end,
      'observaciones_corrida', p_turno_linea_id::text, 'Resumen Diario',
      'Observación de ' || v_resumen,
      case when v_antes is null then null else jsonb_build_object('texto', v_antes) end,
      case when v_texto is null then null else jsonb_build_object('texto', v_texto) end
    );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Listar las de un rango de jornadas (Resumen: un día; Indicadores: un mes)
-- ------------------------------------------------------------
create or replace function listar_observaciones_corrida(p_usuario text, p_area_codigo text, p_desde date, p_hasta date)
returns table (
  turno_linea_id uuid,
  fecha date,
  turno_tipo_codigo text,
  linea_codigo text,
  sabor_nombre text,
  lote text,
  presentacion_volumen_ml integer,
  texto text,
  actualizado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not puede_ver_resumen_dia(p_usuario) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
  select o.turno_linea_id, t.fecha, tt.codigo, l.codigo, s.nombre, tl.lote, pr.volumen_ml, o.texto, o.actualizado_en
  from observaciones_corrida o
  join turno_lineas tl on tl.id = o.turno_linea_id
  join turnos t on t.id = tl.turno_id
  join areas a on a.id = t.area_id
  join turno_tipos tt on tt.id = t.turno_tipo_id
  join lineas l on l.id = tl.linea_id
  left join sabores s on s.id = tl.sabor_id
  left join presentaciones pr on pr.id = tl.presentacion_id
  where a.codigo = p_area_codigo
    and t.fecha between p_desde and p_hasta
  order by t.fecha, tt.codigo, l.codigo;
end;
$$;

grant execute on function guardar_observacion_corrida(text, uuid, text) to anon, authenticated;
grant execute on function listar_observaciones_corrida(text, text, date, date) to anon, authenticated;

select * from asegurar_control_usuario();
