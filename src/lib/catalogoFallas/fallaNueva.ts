import { supabase } from "@/lib/supabase"
import type { OpcionFalla } from "./paradas"
import type { Resultado } from "./tipos"

/*
 * «Falla nueva» y «Parada nueva» (migración 20261114890000). Cada equipo tiene
 * una falla reservada «Falla nueva» que se elige como cualquier otra y cuenta
 * igual; el detalle va en la observación de la parada. Cada grupo de «Otras
 * paradas» (PP, LNPE, OP…) tiene su «Parada nueva · <prefijo>». La cola
 * «Fallas nuevas» junta las paradas hechas así y sin revisar.
 */

/** Los tipos reservados de «Otras paradas» se reconocen por su código. */
export const PREFIJO_PARADA_NUEVA = "PARADA_NUEVA_"
export const esParadaNueva = (codigoTipo: string) => codigoTipo.startsWith(PREFIJO_PARADA_NUEVA)

/** La «Falla nueva» del equipo elegido (null si no hay equipo elegido o todavía no tiene la reservada). */
export function fallaNuevaDeEquipo(opciones: OpcionFalla[], equipoId: string): OpcionFalla | null {
  if (!equipoId) return null
  return opciones.find((o) => o.equipo.id === equipoId && o.falla.reservada) ?? null
}

/** Una parada sin revisar de la cola. */
export interface FallaNuevaPendiente {
  paradaId: string
  lineaCodigo: string
  lineaNombre: string
  /** Equipo de la «Falla nueva», o el grupo de la «Parada nueva · LNPE». */
  origen: string
  tipoNombre: string
  /** Lo que escribió Producción en «Qué pasó» (máx. 120). */
  nota: string | null
  /** Lo que escribió Mantenimiento al terminarla («¿Qué se realizó?», máx. 1000). */
  solucion: string | null
  creadaPor: string | null
  inicio: string
  fin: string | null
  minutos: number
  /** false = la parada sigue abierta: Mantenimiento todavía no escribe su observación. */
  terminada: boolean
}

interface Fila {
  parada_id: string
  linea_codigo: string
  linea_nombre: string
  origen: string | null
  tipo_nombre: string
  nota: string | null
  solucion: string | null
  creada_por: string | null
  inicio: string
  fin: string | null
  minutos: number | null
  terminada: boolean
}

export const mapearFallaNueva = (f: Fila): FallaNuevaPendiente => ({
  paradaId: f.parada_id,
  lineaCodigo: f.linea_codigo,
  lineaNombre: f.linea_nombre,
  origen: f.origen ?? "—",
  tipoNombre: f.tipo_nombre,
  nota: f.nota,
  solucion: f.solucion,
  creadaPor: f.creada_por,
  inicio: f.inicio,
  fin: f.fin,
  minutos: f.minutos ?? 0,
  terminada: f.terminada,
})

export async function listarFallasNuevas(usuario: string): Promise<Resultado<FallaNuevaPendiente[]>> {
  const { data, error } = await supabase.rpc("listar_fallas_nuevas", { p_usuario: usuario })
  if (error || !Array.isArray(data)) return { ok: false, error: error?.message || "No se pudo leer la cola de fallas nuevas." }
  return { ok: true, valor: (data as Fila[]).map(mapearFallaNueva) }
}

/** Marca como revisadas (sale de la cola). Devuelve cuántas se descartaron. */
export async function descartarFallasNuevas(usuario: string, paradaIds: string[]): Promise<Resultado<number>> {
  const { data, error } = await supabase.rpc("descartar_fallas_nuevas", { p_usuario: usuario, p_ids: paradaIds })
  if (error) return { ok: false, error: error.message || "No se pudo descartar." }
  return { ok: true, valor: Number(data) }
}

export interface GrupoFallaNueva {
  /** El equipo (o el grupo de «Parada nueva»). */
  origen: string
  /** Más reciente primero. */
  items: FallaNuevaPendiente[]
  minutos: number
}

/**
 * Agrupa la cola por equipo para leer sus observaciones juntas: el equipo con
 * más tiempo perdido va primero. Cada parada se descarta sola o todas las del
 * equipo de una vez.
 */
export function agruparFallasNuevas(items: FallaNuevaPendiente[]): GrupoFallaNueva[] {
  const m = new Map<string, GrupoFallaNueva>()
  for (const f of items) {
    const g = m.get(f.origen) ?? { origen: f.origen, items: [], minutos: 0 }
    g.items.push(f)
    g.minutos += f.minutos
    m.set(f.origen, g)
  }
  for (const g of m.values()) g.items.sort((a, b) => b.inicio.localeCompare(a.inicio))
  return [...m.values()].sort((a, b) => b.minutos - a.minutos || b.items.length - a.items.length || a.origen.localeCompare(b.origen, "es"))
}
