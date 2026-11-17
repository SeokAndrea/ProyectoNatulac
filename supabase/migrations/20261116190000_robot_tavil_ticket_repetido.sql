-- ============================================================
-- Robot Tavil: el ticket se puede repetir con doble confirmación
-- (Alexander, 2026-11-17)
-- ============================================================
-- Antes (20261115290000) el ticket no se podía repetir entre paletas vivas.
-- Ahora sí: si ya está en otra paleta, el «+» y la corrección avisan
-- (TICKET_REPETIDO|…) y la pantalla pide un segundo clic. Con
-- p_confirmar_repetido = true se guarda y queda en Auditoría.
--   * Se quita el índice único del ticket.
--   * robot_tavil_aviso_ticket(): nombra todas las paletas con ese ticket.
--   * robot_tavil_sumar() y robot_tavil_editar_paleta(): parámetro nuevo
--     p_confirmar_repetido (por defecto false, así la pantalla vieja sigue
--     andando). El resto queda como en 20261115290000.
-- ============================================================

drop index if exists robot_tavil_paletas_ticket_unico;

comment on column robot_tavil_paletas.ticket is 'Código del papel pegado a la paleta. Lo teclea el operador; se puede repetir con doble confirmación (20261116190000).';

-- ¿Ese ticket ya está en otra paleta viva? Devuelve el aviso o null.
create or replace function robot_tavil_aviso_ticket(p_ticket text, p_excluir uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'TICKET_REPETIDO|Este ticket ya está registrado en '
         || case when count(*) = 1 then 'la paleta ' else 'las paletas ' end
         || string_agg(
              'Nº ' || coalesce(rp.numero::text, '?') || ' de la ' || l.nombre
              || ' (' || coalesce(to_char(rp.fecha_produccion, 'DD/MM/YYYY'), 'sin fecha') || ')',
              ', ' order by rp.fecha_produccion desc nulls last, rp.numero desc nulls last
            )
         || '.'
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id
  where rp.anulada_en is null
    and rp.ticket is not null
    and upper(btrim(rp.ticket)) = upper(btrim(p_ticket))
    and rp.id is distinct from p_excluir
  having count(*) > 0;
$$;
revoke execute on function robot_tavil_aviso_ticket(text, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- «+»: crea la paleta (la firma vieja se borra para no tener dos).
-- ------------------------------------------------------------
drop function if exists robot_tavil_sumar(text, text, text, boolean, integer[], text, text);

create or replace function robot_tavil_sumar(
  p_usuario text,
  p_linea_codigo text,
  p_ticket text,
  p_conforme boolean default true,
  p_observacion_codigos integer[] default '{}',
  p_observacion_otros text default null,
  p_accion_correccion text default null,
  p_confirmar_repetido boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_sumar', p_usuario);
  v_linea uuid := robot_tavil_linea(v_area, p_linea_codigo);
  v_e record;
  v_ctx record;
  v_obs record;
  v_ticket text := nullif(btrim(coalesce(p_ticket, '')), '');
  v_aviso text;
  v_id uuid;
  v_numero integer;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  if v_ticket is null then
    raise exception 'Escribe el número de ticket para guardar la paleta.';
  end if;
  -- Un «+» a la vez por línea: así dos toques seguidos no repiten número.
  perform 1 from lineas where id = v_linea for update;

  select * into v_e from robot_tavil_estado_linea(v_linea);
  if v_e.estado = 'LOTE_NUEVO' and not v_e.seguida_abierta then
    raise exception 'El supervisor cargó un lote nuevo en esta línea. Toca «Iniciar con el lote» antes de sumar.';
  end if;
  select * into v_ctx from robot_tavil_contexto_paleta(v_linea);
  if not v_ctx.puede then
    raise exception 'Esta línea no tiene una corrida en curso.';
  end if;

  select * into v_obs from robot_tavil_validar_conformidad(coalesce(p_conforme, true), p_observacion_codigos,
                                                          p_observacion_otros, p_accion_correccion, true);
  v_aviso := robot_tavil_aviso_ticket(v_ticket, null);
  if v_aviso is not null and not coalesce(p_confirmar_repetido, false) then
    raise exception '%', v_aviso;
  end if;

  insert into robot_tavil_paletas (
    linea_id, turno_linea_id, creada_por, fecha_produccion, turno_tipo, sabor_id, presentacion_id,
    numero, tipo_paletizado, cajas, ticket, conforme, observacion_codigos, observacion_otros, accion_correccion
  )
  values (
    v_linea, v_ctx.turno_linea_id, v_usuario, v_ctx.fecha, v_ctx.turno_tipo, v_ctx.sabor_id, v_ctx.presentacion_id,
    robot_tavil_siguiente_numero(v_linea, v_ctx.fecha, v_ctx.sabor_id, v_ctx.presentacion_id),
    case when coalesce((select m.manual from robot_tavil_linea_manual m where m.linea_id = v_linea), false)
         then 'MANUAL' else 'AUTOMATICO' end,
    (select p.cajas_x_paleta from presentaciones p where p.id = v_ctx.presentacion_id),
    v_ticket, coalesce(p_conforme, true), v_obs.codigos, v_obs.otros, v_obs.accion
  )
  returning id, numero into v_id, v_numero;

  if v_aviso is not null then
    perform registrar_auditoria(
      p_usuario, 'CREAR', 'robot_tavil_paletas', v_id::text, 'Robot Tavil',
      'Creó la paleta Nº ' || coalesce(v_numero::text, '?') || ' con el ticket repetido ' || v_ticket
        || ' (' || split_part(v_aviso, '|', 2) || ')',
      null,
      jsonb_build_object('ticket', v_ticket, 'ticket_repetido', true)
    );
  end if;
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_sumar(text, text, text, boolean, integer[], text, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- Corregir una paleta viva del área desde la lista del operador.
-- ------------------------------------------------------------
drop function if exists robot_tavil_editar_paleta(text, uuid, text, text, integer, boolean, integer[], text, text);

create or replace function robot_tavil_editar_paleta(
  p_usuario text,
  p_paleta_id uuid,
  p_ticket text,
  p_tipo_paletizado text,
  p_cajas integer,
  p_conforme boolean,
  p_observacion_codigos integer[],
  p_observacion_otros text,
  p_accion_correccion text,
  p_confirmar_repetido boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area uuid := robot_tavil_preparar('robot_tavil_editar_paleta', p_usuario);
  v_antes robot_tavil_paletas;
  v_obs record;
  v_ticket text := nullif(btrim(coalesce(p_ticket, '')), '');
  v_aviso text;
  v_usuario uuid := (select u.id from usuarios u where u.usuario = lower(p_usuario));
begin
  select rp.* into v_antes
  from robot_tavil_paletas rp
  join lineas l on l.id = rp.linea_id and l.area_id = v_area
  where rp.id = p_paleta_id and rp.anulada_en is null
  for update of rp;
  if not found then
    raise exception 'Esa paleta ya no existe o fue anulada. Recarga la página.';
  end if;
  if v_ticket is null then
    raise exception 'Escribe el número de ticket.';
  end if;
  if coalesce(p_tipo_paletizado, '') not in ('AUTOMATICO', 'MANUAL') then
    raise exception 'Elige si la paleta es automática o manual.';
  end if;
  if coalesce(p_cajas, 0) <= 0 then
    raise exception 'El número de cajas debe ser mayor que cero.';
  end if;
  select * into v_obs from robot_tavil_validar_conformidad(coalesce(p_conforme, true), p_observacion_codigos,
                                                          p_observacion_otros, p_accion_correccion, true);
  -- Solo se avisa si el ticket cambió: corregir otra cosa de una paleta que ya tenía el ticket repetido no vuelve a preguntar.
  if upper(btrim(coalesce(v_antes.ticket, ''))) <> upper(v_ticket) then
    v_aviso := robot_tavil_aviso_ticket(v_ticket, p_paleta_id);
    if v_aviso is not null and not coalesce(p_confirmar_repetido, false) then
      raise exception '%', v_aviso;
    end if;
  end if;

  update robot_tavil_paletas
  set ticket = v_ticket, tipo_paletizado = p_tipo_paletizado, cajas = p_cajas,
      conforme = coalesce(p_conforme, true), observacion_codigos = v_obs.codigos,
      observacion_otros = v_obs.otros, accion_correccion = v_obs.accion,
      editada_en = now(), editada_por = v_usuario
  where id = p_paleta_id;

  perform registrar_auditoria(
    p_usuario, 'EDITAR', 'robot_tavil_paletas', p_paleta_id::text, 'Robot Tavil',
    'Corrigió la paleta Nº ' || coalesce(v_antes.numero::text, '?') || ' (ticket ' || coalesce(v_antes.ticket, '—') || ')'
      || case when v_aviso is not null then ' con el ticket repetido ' || v_ticket || ' (' || split_part(v_aviso, '|', 2) || ')' else '' end,
    jsonb_build_object('ticket', v_antes.ticket, 'tipo_paletizado', v_antes.tipo_paletizado, 'cajas', v_antes.cajas,
                       'conforme', v_antes.conforme, 'observacion_codigos', v_antes.observacion_codigos,
                       'observacion_otros', v_antes.observacion_otros, 'accion_correccion', v_antes.accion_correccion),
    jsonb_build_object('ticket', v_ticket, 'tipo_paletizado', p_tipo_paletizado, 'cajas', p_cajas,
                       'conforme', coalesce(p_conforme, true), 'observacion_codigos', v_obs.codigos,
                       'observacion_otros', v_obs.otros, 'accion_correccion', v_obs.accion,
                       'ticket_repetido', v_aviso is not null)
  );
  return robot_tavil_pantalla(v_area);
end;
$$;
grant execute on function robot_tavil_editar_paleta(text, uuid, text, text, integer, boolean, integer[], text, text, boolean) to anon, authenticated;
