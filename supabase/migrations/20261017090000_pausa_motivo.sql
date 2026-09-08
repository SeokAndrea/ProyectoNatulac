-- ============================================================
-- PARADA OPERACIONAL: la pausa de una corrida guarda su motivo
-- ============================================================
-- Fase 2 del rework, §2.2 (pieza chica y aditiva, se adelanta sola).
-- Hoy `pausar_linea` solo sella `pausada_en`; no hay dónde guardar POR
-- QUÉ se paró la línea. La página de Líneas nueva ("Parada Operacional")
-- va a pedir el motivo obligatorio — acá se abre el lugar para guardarlo.
--
--   turno_lineas.pausa_motivo  text (nullable)
--   pausar_linea(...)          + p_motivo text default null
--   continuar_linea(...)       limpia pausa_motivo al reanudar
--
-- p_motivo queda con DEFAULT null a propósito: el frontend actual (botón
-- "Parada momentánea", y el turno.tsx muerto) todavía llama sin motivo y
-- no se debe romper en el BIG UPDATE. La obligatoriedad la impone la UI
-- nueva de "Parada Operacional" (costura 2); si más adelante se quiere
-- un guard en la base, va ahí, no acá.
-- ============================================================

alter table turno_lineas add column pausa_motivo text;

-- ------------------------------------------------------------
-- pausar_linea(): + p_motivo. DROP+CREATE porque suma un parámetro.
-- Cuerpo idéntico a 20260913 salvo el set de pausa_motivo.
-- ------------------------------------------------------------
drop function if exists pausar_linea(text, uuid, uuid);

create function pausar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set pausada_en = now(),
      pausa_motivo = nullif(btrim(p_motivo), '')
  where id = p_turno_linea_id and turno_id = p_turno_id and activa and pausada_en is null;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function pausar_linea(text, uuid, uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- continuar_linea(): al reanudar, el motivo de la parada deja de aplicar.
-- ------------------------------------------------------------
create or replace function continuar_linea(p_usuario text, p_turno_id uuid, p_turno_linea_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update turno_lineas
  set pausada_en = null,
      pausa_motivo = null
  where id = p_turno_linea_id and turno_id = p_turno_id and activa;

  return turno_json(p_turno_id);
end;
$$;

grant execute on function continuar_linea(text, uuid, uuid) to anon, authenticated;
