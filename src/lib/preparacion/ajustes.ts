/**
 * Ajustes de Preparación: operaciones para cuando algo salió distinto de
 * lo planeado — nunca reimplementan lo que hace nucleo.ts, lo asumen ya
 * hecho y corrigen sobre eso. Ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraídas de src/lib/turno.tsx, mismo comportamiento. `reactivarLote` y
 * `descartarRestoTanque` NO están acá a propósito: se retiran en la Fase 2
 * del plan (bug confirmado en `reactivarLote`; `descartarRestoTanque`
 * modela un caso — "se descarta algo" — que no existe en la operación
 * real, confirmado con el dueño).
 */
import { supabase } from "@/lib/supabase"
import type { ModoTransferencia, Resultado } from "./tipos"

/** Solo antes de liberar el lote — suma litros (agua/jugo) al volumen. */
export async function ajustarPreparacion(
  usuario: string,
  loteId: string,
  litros: number,
  detalle: string | null,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("ajustar_preparacion", {
    p_usuario: usuario,
    p_lote_id: loteId,
    p_litros: litros,
    p_detalle: detalle,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo registrar el ajuste. Intenta de nuevo." }
  }

  return { ok: true, data }
}

export async function transferirTanque(
  usuario: string,
  turnoId: string,
  numeroTanqueOrigen: 1 | 2 | 3,
  numeroTanqueDestino: 1 | 2 | 3,
  modo: ModoTransferencia,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("transferir_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque_origen: numeroTanqueOrigen,
    p_numero_tanque_destino: numeroTanqueDestino,
    p_modo: modo,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo transferir. Intenta de nuevo." }
  }

  return { ok: true, data }
}

/** Guarda el resto de un tanque a pipa (reserva) para una preparación futura. */
export async function envasarTanque(usuario: string, turnoId: string, numeroTanque: 1 | 2 | 3): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("envasar_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo guardar en la pipa. Intenta de nuevo." }
  }

  return { ok: true, data }
}
