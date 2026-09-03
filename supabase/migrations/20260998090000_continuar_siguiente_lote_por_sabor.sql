-- ============================================================
-- CONTINUAR AL SIGUIENTE LOTE: matchear también por sabor
-- ============================================================
-- continuar_siguiente_lote() (20260925) buscaba el "lote siguiente"
-- (mismo número + 1) SOLO por el string del lote:
--
--   where condicion = 'LISTO' and lote = v_lote_siguiente
--   order by numero_tanque limit 1
--
-- Los números de lote colisionan entre sabores (ej. "0001" existe a la
-- vez para Manzana y para Pera Selecto — se numeran por tanque/sabor,
-- no globalmente). Si dos tanques estaban Listos con el mismo string,
-- agarraba uno arbitrario y la corrida "continuaba" en el sabor
-- equivocado, con el lote_id de otro lote — a partir de ahí el PT de
-- esa línea drenaba el volumen del lote incorrecto y la merma de ese
-- lote quedaba corrompida (ver plan-rework-auditoria.md §7).
--
-- Ahora el match exige el MISMO sabor que la corrida que se está
-- continuando, y:
--   - 0 candidatos  -> mensaje claro, sin forzar nada.
--   - >1 candidatos  -> se niega y pide activar la línea a mano
--     eligiendo el tanque (no elige a ciegas).
-- El resto (cerrar la corrida vieja, heredar velocidad/presentación,
-- arrancar la nueva) queda igual.
-- ============================================================

create or replace function continuar_siguiente_lote(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_actual turno_lineas%rowtype;
  v_ancho integer;
  v_lote_siguiente text;
  v_tanque recepcion_tanques%rowtype;
  v_candidatos integer;
begin
  select id into v_usuario_id from usuarios where usuario = lower(p_usuario);

  select * into v_actual from turno_lineas
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  if v_actual.id is null then
    raise exception 'Esa corrida no está activa.';
  end if;

  if v_actual.lote is null or v_actual.lote !~ '^[0-9]+$' then
    raise exception 'El lote actual (%) no tiene formato numérico — no se puede calcular el siguiente.', v_actual.lote;
  end if;

  v_ancho := length(v_actual.lote);
  v_lote_siguiente := lpad((v_actual.lote::bigint + 1)::text, greatest(v_ancho, 4), '0');

  select count(*) into v_candidatos
  from recepcion_tanques
  where turno_id = p_turno_id
    and condicion = 'LISTO'
    and lote = v_lote_siguiente
    and sabor_id is not distinct from v_actual.sabor_id;

  if v_candidatos = 0 then
    raise exception 'No hay ningún tanque Listo con el Lote % del mismo sabor. Activa la línea manualmente si corresponde.', v_lote_siguiente;
  end if;
  if v_candidatos > 1 then
    raise exception 'Hay más de un tanque Listo con el Lote % de ese sabor — activa la línea manualmente eligiendo el tanque.', v_lote_siguiente;
  end if;

  select * into v_tanque
  from recepcion_tanques
  where turno_id = p_turno_id
    and condicion = 'LISTO'
    and lote = v_lote_siguiente
    and sabor_id is not distinct from v_actual.sabor_id
  limit 1;

  update turno_lineas
  set activa = false, finalizada_en = now()
  where id = v_actual.id;

  insert into turno_lineas (
    turno_id, linea_id, presentacion_id, envases_hora, litros_hora, sabor_id, lote, lote_id, activa, activada_en, activada_por
  )
  values (
    p_turno_id, v_actual.linea_id, v_actual.presentacion_id, v_actual.envases_hora, v_actual.litros_hora,
    v_tanque.sabor_id, v_tanque.lote, v_tanque.lote_id, true, now(), v_usuario_id
  );

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_siguiente_lote(text, uuid, uuid) to anon, authenticated;
