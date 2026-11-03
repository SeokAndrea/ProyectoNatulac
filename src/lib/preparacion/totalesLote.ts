/**
 * Totales de cada lote en TODOS los turnos — preparado, entrantes,
 * salientes y envasado — leídos de rendimiento_lotes() (migración
 * 20261115090000). Con eso sale el rendimiento de semielaborado:
 * envasado / preparado (ver src/lib/reportes/realidadPreparacion.ts).
 *
 * Se piden aparte de turno_json porque un lote cruza turnos: el PT y las
 * transferencias de los otros turnos no vienen en el turno que se mira.
 */
import { supabase } from "@/lib/supabase"
import type { PreparacionRegistro, TotalesLote } from "./tipos"

interface FilaTotalesLote {
  lote_id: string
  preparado_l: number
  entrantes_l: number
  salientes_l: number
  envasado_l: number
  cerrado: boolean
}

export async function leerTotalesLotes(loteIds: string[]): Promise<Map<string, TotalesLote>> {
  const ids = [...new Set(loteIds)]
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.rpc("rendimiento_lotes", { p_lote_ids: ids })
  if (error || !Array.isArray(data)) return new Map()
  return new Map(
    (data as FilaTotalesLote[]).map((f) => [
      f.lote_id,
      {
        preparadoL: Number(f.preparado_l),
        entrantesL: Number(f.entrantes_l),
        salientesL: Number(f.salientes_l),
        envasadoL: Number(f.envasado_l),
        cerrado: f.cerrado,
      },
    ]),
  )
}

/** Mismas preparaciones, cada una con sus totales (null si no vinieron). */
export function conTotales(preparaciones: PreparacionRegistro[], totales: Map<string, TotalesLote>): PreparacionRegistro[] {
  return preparaciones.map((p) => ({ ...p, totales: totales.get(p.id) ?? null }))
}

/** Lee y adjunta los totales a las preparaciones de uno o varios turnos, con una sola consulta. */
export async function adjuntarTotales<T extends { preparaciones: PreparacionRegistro[] }>(turnos: T[]): Promise<T[]> {
  const totales = await leerTotalesLotes(turnos.flatMap((t) => t.preparaciones.map((p) => p.id)))
  return turnos.map((t) => ({ ...t, preparaciones: conTotales(t.preparaciones, totales) }))
}
