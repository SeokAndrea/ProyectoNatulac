-- ============================================================
-- LÍNEAS: el CIP termina solo al arrancar una corrida (dueña, 2026-10-28)
-- ============================================================
-- La Línea de Javier decía «Corriendo» pero seguía marcada en CIP (y el Modo
-- Paradas no le daba Parar). Causa: el CIP solo se quitaba con «Terminó CIP»,
-- que además exige completar antes el +1 del CIP. Si en vez de eso se
-- activaba la corrida siguiente, la línea corría con la marca de CIP, y
-- abrir_turno la copiaba al turno siguiente.
--
--   * Trigger: al entrar una corrida corriendo (activa y sin pausa) en una
--     línea marcada CIP de ese turno, el CIP termina como con «Terminó CIP»
--     (condición LISTA, fin del CIP = arranque). El +1 del CIP sigue
--     pendiente en su lista hasta que lo completen.
--     Las corridas que abrir_turno copia (heredadas) entran antes que el
--     estado de las líneas: no las toca. La corrida en pausa por un CIP con el
--     lote que sigue tampoco (tiene pausa).
--   * Las líneas que hoy están así (turno abierto, marcada CIP con una
--     corrida corriendo) quedan LISTA, con su registro en la auditoría.
-- ============================================================

create or replace function cip_termina_al_arrancar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not new.activa or new.pausada_en is not null or new.lote_terminado_en is not null then
    return null;
  end if;
  for r in
    update lineas_estado le
    set condicion = 'LISTA', activada_en = now(), cip_finalizado_en = least(new.activada_en, now()),
        observacion = null, parada_id = null, actualizada_por = coalesce(new.actualizada_por, new.activada_por)
    where le.turno_id = new.turno_id and le.linea_id = new.linea_id and le.condicion = 'CIP'
    returning le.id
  loop
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'lineas_estado', r.id::text, 'Líneas (automático)',
      format('Terminó el CIP de la %s: arrancó una corrida', (select nombre from lineas where id = new.linea_id)),
      jsonb_build_object('condicion', 'CIP'),
      jsonb_build_object('condicion', 'LISTA', 'corrida', new.id)
    );
  end loop;
  return null;
end;
$$;

drop trigger if exists cip_termina_al_arrancar on turno_lineas;
create trigger cip_termina_al_arrancar
after insert on turno_lineas
for each row execute function cip_termina_al_arrancar();

-- Las que hoy corren con la marca de CIP (solo turnos abiertos).
do $$
declare
  r record;
begin
  for r in
    update lineas_estado le
    set condicion = 'LISTA', activada_en = now(), cip_finalizado_en = coalesce(le.cip_finalizado_en, now()),
        observacion = null, parada_id = null
    from turnos t
    where t.id = le.turno_id and t.estado = 'ABIERTO' and le.condicion = 'CIP'
      and exists (
        select 1 from turno_lineas tl
        where tl.turno_id = le.turno_id and tl.linea_id = le.linea_id
          and tl.activa and tl.pausada_en is null and tl.lote_terminado_en is null
      )
    returning le.id, le.linea_id
  loop
    perform registrar_auditoria(
      'sistema', 'EDITAR', 'lineas_estado', r.id::text, 'Migración 20261113390000',
      format('Quitó la marca de CIP de la %s: estaba corriendo', (select nombre from lineas where id = r.linea_id)),
      jsonb_build_object('condicion', 'CIP'),
      jsonb_build_object('condicion', 'LISTA')
    );
    raise notice 'Quitada la marca de CIP: %', (select nombre from lineas where id = r.linea_id);
  end loop;
end;
$$;
