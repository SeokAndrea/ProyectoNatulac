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
import type { DatosCambiarTanque, ModoTransferencia, Resultado } from "./tipos"

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

// ------------------------------------------------------------
// TODO (Fase 2 del plan) — RETIRAR ESTAS 3 FUNCIONES cuando la base de
// datos cambie. Veredicto ya tomado en plan-rework-3-modulos-y-merma.md
// §2.1:
//   - cambiarCondicionTanque ("Editar" libre): un solo formulario deja
//     fijar cualquier condición/sabor/lote/volumen sin los guardrails de
//     iniciarPreparacion — la única edición libre que debe sobrevivir es
//     Recepción, y ni siquiera ahí necesita ser TAN libre.
//   - reactivarLote: bug confirmado en operación real — terminarSaborLinea
//     ya puso turno_lineas.activa=false ANTES de que esto corra, así que
//     nunca encuentra la fila para reactivar la corrida (queda muerta).
//     Reemplazo: confirmación antes de "Terminó Lote" (plan §2.1-bis).
//   - descartarRestoTanque: en la operación real nunca se descarta nada
//     de verdad — todo resto se transfiere (transferirTanque) o se
//     guarda en pipa (desvasarTanque), ambas ya arriba en este archivo.
// Hoy siguen acá porque la Fase 2 (que las retira de la base) todavía no
// corrió — sacarlas de este módulo antes de tiempo le quitaría 3
// capacidades reales a los supervisores sin haber construido el
// reemplazo. Cuando la Fase 2 corra: borrar este bloque entero + las 3
// piezas de UI que lo llaman (EstadoPlantaTabs.tsx, TanqueEditForm).
// ------------------------------------------------------------

/** Ver nota de retiro arriba. */
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

/** Ver nota de retiro arriba. */
export async function reactivarLote(usuario: string, turnoId: string, numeroTanque: 1 | 2 | 3): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("reactivar_lote", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo reactivar el lote. Intenta de nuevo." }
  }

  return { ok: true, data }
}

/** Ver nota de retiro arriba. */
export async function descartarRestoTanque(
  usuario: string,
  turnoId: string,
  numeroTanque: 1 | 2 | 3,
  motivo: string,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("descartar_resto_tanque", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_numero_tanque: numeroTanque,
    p_motivo: motivo.trim() || null,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo descartar. Intenta de nuevo." }
  }

  return { ok: true, data }
}
