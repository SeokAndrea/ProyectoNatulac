/**
 * Ajustes de Producción: operaciones para cuando algo salió distinto de
 * lo planeado — nunca reimplementan lo que hace nucleo.ts. Ver
 * plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraídas de src/lib/turno.tsx, mismo comportamiento, ninguna RPC nueva.
 */
import { supabase } from "@/lib/supabase"
import type { Resultado } from "./tipos"

/** Un solo paso atómico: termina la corrida conservando el tanque Y deja el motivo anotado en Detenida — antes eran 2 pasos separados y si el segundo no se hacía, el motivo se perdía. */
export async function detenerLineaPorFalla(
  usuario: string,
  turnoId: string,
  corridaId: string,
  motivo: string,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("detener_linea_por_falla", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_turno_linea_id: corridaId,
    p_motivo: motivo.trim() || null,
  })
  if (error || !data) return { ok: false, error: "No se pudo detener la línea. Intenta de nuevo." }
  return { ok: true, data }
}

/** `numeroTanque` opcional: si el auto-detect del lote+1 falla, el supervisor elige el tanque a mano. */
export async function continuarSiguienteLote(
  usuario: string,
  turnoId: string,
  corridaId: string,
  numeroTanque?: number,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("continuar_siguiente_lote", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_turno_linea_id: corridaId,
    p_numero_tanque: numeroTanque ?? null,
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo continuar al siguiente lote. Intenta de nuevo." }
  return { ok: true, data }
}

/** Deshace un "terminó el lote" prematuro: la corrida sigue en el MISMO lote. No toca el tanque ni los litros. */
export async function seguirMismoLote(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("seguir_mismo_lote", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo seguir con el mismo lote. Intenta de nuevo." }
  return { ok: true, data }
}

/** "¿Va a continuar en el siguiente turno?" — la corrida sigue activa, solo marca que este supervisor ya cerró su parte. */
export async function entregarCorrida(usuario: string, turnoId: string, corridaId: string): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("entregar_corrida", { p_usuario: usuario, p_turno_id: turnoId, p_turno_linea_id: corridaId })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo entregar la corrida. Intenta de nuevo." }
  return { ok: true, data }
}

export async function actualizarJustificacionContador(contadorId: string, justificacion: string): Promise<Resultado> {
  const { error } = await supabase.rpc("actualizar_justificacion_contador", { p_contador_id: contadorId, p_justificacion: justificacion })
  if (error) return { ok: false, error: "No se pudo guardar la justificación. Intenta de nuevo." }
  return { ok: true }
}
