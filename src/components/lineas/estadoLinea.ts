import type { EstadoVisualLinea } from "@/components/LineaVisual"
import type { EstadoCinta } from "@/components/CintaEstadoLinea"
import type { CondicionLinea, Corrida } from "@/lib/produccion/tipos"

export const nombreCondicionLinea: Record<CondicionLinea, string> = {
  DETENIDA: "Parada",
  LISTA: "Lista para arrancar",
  CIP: "En CIP",
  CAMBIO_PRESENTACION: "Cambio de Presentación",
  SIN_PROGRAMACION: "Sin programación",
}

type VarianteBadge = "success" | "warning" | "muted" | "danger" | "info"

const badgeVariantCondicionLinea: Record<CondicionLinea, VarianteBadge> = {
  DETENIDA: "danger",
  LISTA: "success",
  CIP: "warning",
  CAMBIO_PRESENTACION: "warning",
  SIN_PROGRAMACION: "info",
}

export interface AspectoLinea {
  badge: string
  variante: VarianteBadge
  /** Ícono de la línea, para los estados sin cinta animada. */
  visual: EstadoVisualLinea
  /** Corriendo, en pausa, CIP y detenida: la cinta animada (misma que el Panel de Producción). null = se usa `visual`. */
  cinta: EstadoCinta | null
}

/**
 * Cómo se ve la línea según su corrida activa (si hay) y su condición.
 * CIP con el lote en pausa, o CIP con una corrida esperando su PT, se
 * muestran "En CIP".
 */
export function aspectoLinea(corrida: Corrida | null, condicion: CondicionLinea, esperandoPt: boolean): AspectoLinea {
  const enCip = condicion === "CIP"
  if (!corrida) {
    return {
      badge: esperandoPt ? (enCip ? "En CIP" : "Esperando PT") : nombreCondicionLinea[condicion],
      variante: esperandoPt ? "warning" : badgeVariantCondicionLinea[condicion],
      visual: enCip ? "cip" : condicion === "CAMBIO_PRESENTACION" ? "cambio_presentacion" : "libre",
      cinta: enCip ? "cip" : condicion === "DETENIDA" ? "detenida" : null,
    }
  }
  if (corrida.loteTerminado != null) {
    return { badge: "Terminó el Lote", variante: "warning", visual: "terminada", cinta: null }
  }
  if (corrida.pausadaEn != null) {
    return enCip
      ? { badge: "En CIP", variante: "warning", visual: "cip", cinta: "cip" }
      : { badge: "Parada", variante: "warning", visual: "parada", cinta: "parada" }
  }
  return { badge: "Corriendo", variante: "success", visual: "corriendo", cinta: "corriendo" }
}
