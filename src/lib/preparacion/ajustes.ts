/**
 * Ajustes de Preparación: operaciones para cuando algo salió distinto de
 * lo planeado — nunca reimplementan lo que hace nucleo.ts, lo asumen ya
 * hecho y corrigen sobre eso. Ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraídas de src/lib/turno.tsx, mismo comportamiento. cambiarCondicionTanque,
 * reactivarLote y descartarRestoTanque están al final, en su propia sección
 * marcada — ver el comentario ahí: la Fase 2 (base de datos) todavía no
 * corrió, así que siguen siendo capacidades reales en uso hoy. No se
 * excluyeron de este módulo porque eso significaría sacarle esos 3
 * botones a los supervisores sin haber hecho el trabajo de reemplazo.
 */
import { supabase } from "@/lib/supabase"
import type { DatosCambiarTanque, ModoTransferencia, MotivoTransferencia, Resultado } from "./tipos"

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
  motivo: MotivoTransferencia,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("transferir_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque_origen: numeroTanqueOrigen,
    p_numero_tanque_destino: numeroTanqueDestino,
    p_modo: modo,
    p_motivo: motivo,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo transferir. Intenta de nuevo." }
  }

  return { ok: true, data }
}

/** Desvasa: guarda el resto de un tanque en una pipa para una preparación futura. */
export async function desvasarTanque(usuario: string, turnoId: string, numeroTanque: 1 | 2 | 3): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("desvasar_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo desvasar a la pipa. Intenta de nuevo." }
  }

  return { ok: true, data }
}

/**
 * Medir tanque: relectura física. El supervisor mide el tanque de verdad
 * y tipea el volumen real; el sistema corrige `volumen_l` y deja el delta
 * (teórico vs real) en `preparaciones_ajuste`. Herramienta de excepción
 * (Recepción / "algo se ve raro"), no parte del cierre normal — ver
 * migración 20261021090000 y el Contexto del plan.
 */
export async function medirTanque(
  usuario: string,
  turnoId: string,
  numeroTanque: 1 | 2 | 3,
  volumenReal: number,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("medir_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
    p_volumen_real: volumenReal,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo guardar la medición. Intenta de nuevo." }
  }

  return { ok: true, data }
}

/**
 * Después de transferir: si el tanque origen NO quedó vacío, capturar los
 * litros que quedaron. Reabre el lote origen con ese resto (tanque →
 * Con Restos) y le baja al lote destino el mismo volumen (llegó de
 * menos), con constancia en `preparaciones_ajuste`. Ver migración
 * 20261024090000. Solo aplica a transferencias de líquido / a tanque
 * Limpio (no a "mover el lote entero").
 */
export async function capturarRestoOrigenTransferencia(
  usuario: string,
  turnoId: string,
  numeroTanqueOrigen: 1 | 2 | 3,
  litrosResto: number,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("capturar_resto_origen_transferencia", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque_origen: numeroTanqueOrigen,
    p_litros_resto: litrosResto,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo registrar el resto del tanque. Intenta de nuevo." }
  }

  return { ok: true, data }
}

// ------------------------------------------------------------
// TODO (Fase 2 del plan, §2.1) — `cambiarCondicionTanque` todavía hace el
// toggle de CIP (Iniciar/Terminó CIP) y el confirmar INICIO/FIN de un
// tanque heredado. Narrowear eso (CIP angosto + confirmar_estado_tanque)
// es un paso posterior; hasta entonces queda. `reactivarLote` y
// `descartarRestoTanque` ya se retiraron (migración 20261021090000):
// reactivar no existe en el modelo de dos estados; descartar no existe en
// la operación real (todo resto se transfiere o se desvasa).
// ------------------------------------------------------------

/** Ver nota arriba. */
export async function cambiarCondicionTanque(
  usuario: string,
  turnoId: string,
  datos: DatosCambiarTanque,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("cambiar_condicion_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: datos.numeroTanque,
    p_condicion: datos.condicion,
    p_sabor_id: datos.saborId,
    p_volumen_l: datos.volumenL,
    p_lote: datos.lote,
    p_momento: datos.momento ?? null,
    p_tambores: datos.tambores ?? null,
  })

  if (error || !data) {
    return { ok: false, error: "No se pudo cambiar el tanque. Intenta de nuevo." }
  }

  return { ok: true, data }
}
