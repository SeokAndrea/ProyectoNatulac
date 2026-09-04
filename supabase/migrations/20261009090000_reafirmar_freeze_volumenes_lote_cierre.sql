-- ============================================================
-- REAFIRMAR EL FREEZE DE volumenes_lote_cierre AL CERRAR UN TURNO
-- ============================================================
-- Diagnóstico (chat del 2026-09-04, "por qué cambió el Rendimiento"):
-- se auditaron con turno_json/turno_de_fecha_tipo TODOS los turnos
-- CERRADOS de ASEPTICO y PRUEBAS entre 2026-09-01 y 2026-09-03, y
-- turnos.volumenes_lote_cierre vino NULL en el 100% de los casos —
-- tanto en cierres manuales (finalizar_turno) como automáticos
-- (cerrar_turnos_vencidos). Es decir: el freeze que
-- 20260968090000_congelar_volumen_lote_al_cerrar_turno.sql debía
-- dejar instalado NO está corriendo en esta base, aunque el código de
-- turno_json ya asume que sí (usa el snapshot cuando existe, y si no,
-- cae a prep.volumen_l EN VIVO).
--
-- Consecuencia real, medida en el turno A20260903_T3G2 (el "turno
-- pasado" que hoy muestra el Panel): el tanque 2 (lote Pera 0002) se
-- preparó durante ese turno pero nunca corrió una línea mientras
-- estuvo abierto. Como no hay snapshot, al recalcular HOY el turno ya
-- cerrado, se lee el volumen ACTUAL del tanque (2.700 L, porque el
-- turno de HOY ya lo está vaciando) en vez del volumen con el que ese
-- turno realmente cerró (16.840 L, sin tocar). Resultado: 14.140 L de
-- "merma" que en realidad pertenecen al turno de HOY quedan pegados
-- al turno de AYER, y el número sigue cambiando cada vez que el
-- turno en vivo consume más de ese tanque.
--
-- No se pudo confirmar por qué el trigger no quedó instalado (esta
-- sesión no tiene acceso psql/service-role al proyecto — el intento
-- de `supabase migration list` se cortó por el mismo problema de VPN
-- de siempre). Esta migración no depende de esa causa: es un
-- DROP + CREATE idéntico al original de 20260968, así que deja el
-- trigger andando esté o no esté ya instalado (si ya existía y
-- funcionaba, este archivo es un no-op funcional).
--
-- NO se hace backfill de turnos ya cerrados (mismo criterio que
-- 20260968: su volumen de cierre real no quedó registrado en ningún
-- lado, y completarlo con el valor de hoy sería inventarlo). Todo
-- turno CERRADO antes de aplicar esto sigue con la merma "a la
-- deriva" hasta que la vuelvan a tocar — que no debería pasar en
-- turnos ya cerrados, pero conviene saberlo.
-- ============================================================

drop trigger if exists trg_turnos_congelar_volumenes_lote_cierre on turnos;
drop function if exists turnos_congelar_volumenes_lote_cierre();

create function turnos_congelar_volumenes_lote_cierre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'CERRADO' and old.estado = 'ABIERTO' and new.volumenes_lote_cierre is null then
    select jsonb_object_agg(prep.id::text, to_jsonb(prep.volumen_l))
    into new.volumenes_lote_cierre
    from preparaciones prep
    where prep.id in (
      select distinct tl.lote_id
      from turno_lineas tl
      where tl.turno_id = new.id and tl.lote_id is not null
    );
  end if;
  return new;
end;
$$;

create trigger trg_turnos_congelar_volumenes_lote_cierre
before update on turnos
for each row
execute function turnos_congelar_volumenes_lote_cierre();

-- ------------------------------------------------------------
-- Verificación manual sugerida después de pushear esto: cerrar (o
-- esperar que cierre automático) un turno de prueba y confirmar que
-- turnos.volumenes_lote_cierre deja de ser NULL:
--
--   select id, codigo, estado, volumenes_lote_cierre
--   from turnos
--   where estado = 'CERRADO'
--   order by fecha_fin desc nulls last, hora_fin desc nulls last
--   limit 5;
-- ------------------------------------------------------------
