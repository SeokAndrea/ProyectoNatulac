-- ============================================================
-- PARADAS: Continuar pregunta cuánto duró
-- ============================================================
-- Dueña, 2026-10-26: al darle Continuar, la parada se cerraba con la hora de
-- ese momento y no dejaba poner los minutos (si la línea arrancó antes de que
-- alguien apretara Continuar, sobraba tiempo).
--
--   * continuar_linea(): copia de 20261111590000 con p_minutos (opcional).
--     Con minutos, la parada termina en inicio + minutos (nunca después de
--     ahora) y el tiempo guía se mira con esos minutos. Sin minutos, igual
--     que antes (termina ahora). Una de Mantenimiento sigue sin cerrarse.
-- ============================================================

drop function if exists continuar_linea(text, uuid, uuid, text);

create or replace function continuar_linea(
  p_usuario text,
  p_turno_id uuid,
  p_turno_linea_id uuid,
  p_justificacion text default null,
  p_minutos integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_c turno_lineas;
  v_le lineas_estado;
  v_p paradas;
  v_just text := nullif(btrim(coalesce(p_justificacion, '')), '');
begin
  perform exigir_turno_escribible(p_usuario, p_turno_id, false);
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  if p_minutos is not null and (p_minutos <= 0 or p_minutos > 30 * 24 * 60) then
    raise exception 'Pon cuántos minutos duró la parada.';
  end if;

  select * into v_c from turno_lineas where id = p_turno_linea_id and turno_id = p_turno_id and activa for update;
  if found then
    select * into v_le from lineas_estado where turno_id = p_turno_id and linea_id = v_c.linea_id;
    if v_le.condicion = 'CIP' then
      raise exception 'La línea está en CIP: usa «Terminó CIP» para continuar el lote.';
    end if;
    if v_le.parada_id is not null and exists (select 1 from paradas where id = v_le.parada_id and pendiente) then
      raise exception 'Completa la parada (tipo y minutos) en Registrar Paradas antes de continuar.';
    end if;

    -- Con minutos, el tiempo guía se compara con lo que dijo el supervisor, no con el reloj.
    if p_minutos is not null and v_le.parada_id is not null then
      select * into v_p from paradas where id = v_le.parada_id;
      if v_p.fin is null and not parada_de_mantenimiento(v_p.id)
         and v_p.clase = 'PROGRAMADA' and v_p.tiempo_guia_min is not null
         and p_minutos > v_p.tiempo_guia_min and v_just is null then
        raise exception 'La parada pasó su tiempo guía. Escribe la justificación.';
      end if;
    end if;

    perform soltar_parada_de_linea(p_usuario, p_turno_id, v_c.linea_id, 'Líneas (Continuar)', p_justificacion, p_minutos is null);

    -- La que se acaba de cerrar termina en inicio + minutos.
    if p_minutos is not null and v_p.id is not null then
      update paradas
      set fin = least(inicio + make_interval(mins => p_minutos), now()),
          justificacion_desvio = case
            when clase = 'PROGRAMADA' and tiempo_guia_min is not null and p_minutos > tiempo_guia_min
              then coalesce(v_just, justificacion_desvio)
            else null
          end
      where id = v_p.id and fin is not null and not pendiente and v_p.fin is null;
      if found then
        perform registrar_auditoria(
          p_usuario, 'EDITAR', 'paradas', v_p.id::text, 'Líneas (Continuar)',
          format('La parada «%s» de la %s duró %s min (lo puso el supervisor)', v_p.tipo_nombre,
                 (select nombre from lineas where id = v_c.linea_id), p_minutos),
          null,
          jsonb_build_object('minutos', p_minutos)
        );
      end if;
    end if;

    -- Las demás paradas abiertas de la línea (de Mantenimiento) ya no la vuelven a poner en Parada.
    update paradas
    set linea_siguio_en = now()
    where linea_id = v_c.linea_id and fin is null and not pendiente and linea_siguio_en is null;
  end if;

  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null,
      actualizada_por = v_usuario_id
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_c.id is not null and v_c.pausada_en is not null then
    perform registrar_auditoria(
      p_usuario, 'EDITAR', 'turno_lineas', v_c.id::text, 'Líneas',
      format('Continuó la %s', (select nombre from lineas where id = v_c.linea_id)),
      jsonb_build_object('pausada_en', v_c.pausada_en),
      jsonb_build_object('pausada_en', null)
    );
  end if;

  return turno_json(p_turno_id);
end;
$$;
grant execute on function continuar_linea(text, uuid, uuid, text, integer) to anon, authenticated;
