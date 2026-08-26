import type { LineaEnTurno } from "@/lib/turno"

export interface GrupoLote {
  key: string
  loteId: string | null
  lote: string | null
  corridas: LineaEnTurno[]
}

export interface GrupoSabor {
  key: string
  saborNombre: string | null
  lotes: GrupoLote[]
}

/**
 * Sabor → Lote, con las líneas de cada lote SIEMPRE en el mismo orden
 * (Línea 1, 2, 3...) sin importar cuál se activó primero — para que
 * la posición de cada línea en la lista no salte de un momento a otro.
 * Compartido entre Producto Terminado (src/pages/apps/ProductoTerminado.tsx)
 * y el acta en PDF (src/lib/actaPdf.ts).
 */
export function agruparPorSaborYLote(corridas: LineaEnTurno[]): GrupoSabor[] {
  const porSabor = new Map<string, LineaEnTurno[]>()
  for (const l of corridas) {
    const key = l.saborId ?? `sin-sabor-${l.saborNombre ?? "?"}`
    porSabor.set(key, [...(porSabor.get(key) ?? []), l])
  }

  return [...porSabor.entries()].map(([key, grupo]) => {
    const porLote = new Map<string, LineaEnTurno[]>()
    for (const l of grupo) {
      const loteKey = l.loteId ?? l.id
      porLote.set(loteKey, [...(porLote.get(loteKey) ?? []), l])
    }

    const lotes: GrupoLote[] = [...porLote.entries()].map(([loteKey, corridasLote]) => ({
      key: loteKey,
      loteId: corridasLote[0].loteId,
      lote: corridasLote[0].lote,
      corridas: [...corridasLote].sort((a, b) => a.linea.localeCompare(b.linea)),
    }))

    return { key, saborNombre: grupo[0].saborNombre, lotes }
  })
}
