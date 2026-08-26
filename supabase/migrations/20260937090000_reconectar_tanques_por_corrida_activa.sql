-- ============================================================
-- RECONECTAR TANQUES: usar la corrida ACTIVA, no contar preparaciones
-- ============================================================
-- El parche de datos de 20260936090000_corregir_tanque_preserva_lote_id.sql
-- reconectaba recepcion_tanques.lote_id solo cuando había EXACTAMENTE
-- una preparación abierta (cerrado_en is null) para ese número de
-- tanque. En la práctica eso casi nunca se cumple: las preparaciones
-- viejas se quedan con cerrado_en en null para siempre salvo que se
-- vacíen solas o alguien cierre el lote a mano (nada las cierra solo
-- por haber sido reemplazadas en el tanque) — confirmado viendo el
-- estado real: los 3 tanques tienen 2 o más preparaciones "abiertas"
-- cada uno. Resultado: el parche anterior no reconectó nada, y el
-- Tanque 2 (manzana) siguió mostrando 6500 L aunque su lote real
-- (preparaciones) ya estaba en 0.
--
-- Fuente más precisa: la corrida (turno_lineas) que está activa=true Y
-- saca de ese tanque siempre apunta al lote_id correcto — no hace
-- falta adivinar por conteo de preparaciones. Se toma, por
-- (turno_id, numero_tanque), la corrida activa más reciente
-- (activada_en desc) como la dueña actual del tanque, y se sincroniza
-- lote_id + volumen_l de una sola vez.
-- ============================================================

with lote_activo as (
  select distinct on (tl.turno_id, prep.numero_tanque)
    tl.turno_id, prep.numero_tanque, tl.lote_id, prep.volumen_l
  from turno_lineas tl
  join preparaciones prep on prep.id = tl.lote_id
  where tl.activa = true
  order by tl.turno_id, prep.numero_tanque, tl.activada_en desc
)
update recepcion_tanques rt
set lote_id = la.lote_id,
    volumen_l = la.volumen_l
from lote_activo la
where rt.lote_id is null
  and rt.condicion in ('LISTO', 'STANDBY')
  and rt.turno_id in (select id from turnos where estado = 'ABIERTO')
  and rt.turno_id = la.turno_id
  and rt.numero_tanque = la.numero_tanque;
