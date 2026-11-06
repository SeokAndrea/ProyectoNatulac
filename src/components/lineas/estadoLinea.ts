import type { EstadoVisualLinea } from "@/components/LineaVisual"
import type { EstadoCinta } from "@/components/CintaEstadoLinea"
import type { EstadoLineaVista } from "@/components/CintaLinea"
import type { EstadoLinea, LineaConEstado } from "@/components/panel/calculosPanel"

/*
 * CÓMO SE VE UNA LÍNEA — una sola tabla para las cuatro pantallas: la
 * tarjeta de Líneas, el Modo Paradas, el Panel de Producción y el Panel de
 * Paradas (dueña, 2026-11-05: «el estado debería ser igual en todas»).
 *
 * El estado sale de estadoDeLineas + aplicarParadasEnVivo (o de
 * estadoDeUnaLinea), en src/components/panel/calculosPanel.ts; acá solo se
 * decide la etiqueta, el color y el dibujo. Antes cada pantalla tenía su
 * propio cálculo y su propia tabla, y cada arreglo dejaba distintas a las
 * otras. Un estado nuevo se agrega acá UNA vez (el tipo Record obliga).
 */

export type VarianteLinea = "success" | "warning" | "muted" | "danger" | "info"

/** Lo que se pinta: el estado, o «Terminó el Lote» (corrida en marcha con el lote terminado). */
export type ClaveAspecto = EstadoLinea | "lote_terminado"

export interface AspectoLinea {
  /** Texto del estado, igual en todas las pantallas. */
  badge: string
  variante: VarianteLinea
  /** Dibujo de la línea (LineaVisual) cuando no hay cinta. */
  visual: EstadoVisualLinea
  /** Cinta pixel art (CintaEstadoLinea): tarjeta, Modo Paradas y Panel de Producción. null = se usa `visual`. */
  cinta: EstadoCinta | null
  /** Escena del Panel de Paradas (CintaLinea). */
  vista: EstadoLineaVista
}

export const ASPECTO_LINEA: Record<ClaveAspecto, AspectoLinea> = {
  activa: { badge: "Corriendo", variante: "success", visual: "corriendo", cinta: "corriendo", vista: "CORRIENDO" },
  lote_terminado: { badge: "Terminó el Lote", variante: "warning", visual: "terminada", cinta: null, vista: "TERMINO" },
  parada: { badge: "Parada", variante: "warning", visual: "parada", cinta: "parada", vista: "PARADA" },
  // Rojo con el técnico: solo esta (dueña, 2026-11-05), distinta de Parada (con corrida) y de Libre.
  detenida_por_parada: { badge: "Detenida por parada", variante: "danger", visual: "parada", cinta: "detenida", vista: "DETENIDA" },
  cip: { badge: "En CIP", variante: "warning", visual: "cip", cinta: "cip", vista: "CIP" },
  cambio_presentacion: {
    badge: "Cambio de Presentación",
    variante: "warning",
    visual: "cambio_presentacion",
    cinta: null,
    vista: "CAMBIO",
  },
  sin_programacion: { badge: "Sin programación", variante: "info", visual: "libre", cinta: null, vista: "SIN_PROGRAMACION" },
  libre: { badge: "Libre", variante: "muted", visual: "libre", cinta: null, vista: "LIBRE" },
}

export function claveAspecto(l: Pick<LineaConEstado, "estado" | "corrida">): ClaveAspecto {
  return l.estado === "activa" && l.corrida?.loteTerminado != null ? "lote_terminado" : l.estado
}

/** Cómo se ve esta línea, en cualquiera de las cuatro pantallas. */
export function aspectoDeLinea(l: Pick<LineaConEstado, "estado" | "corrida">): AspectoLinea {
  return ASPECTO_LINEA[claveAspecto(l)]
}

/** El aspecto de cada escena del Panel de Paradas (cada vista sale de un solo estado). */
export const ASPECTO_DE_VISTA = Object.fromEntries(Object.values(ASPECTO_LINEA).map((a) => [a.vista, a])) as Record<
  EstadoLineaVista,
  AspectoLinea
>

/** Color del texto de cada variante (Panel de Paradas). */
export const TEXTO_VARIANTE: Record<VarianteLinea, string> = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger",
  info: "text-info",
  muted: "text-muted-foreground",
}

/** Color del punto de cada variante (tabla «Líneas activas» del Panel de Producción). */
export const PUNTO_VARIANTE: Record<VarianteLinea, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-muted-foreground",
}
