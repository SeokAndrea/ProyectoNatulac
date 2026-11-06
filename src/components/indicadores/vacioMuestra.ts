/*
 * VACÍO (previa, 2026-11-06): datos de EJEMPLO para ver cómo queda la pantalla
 * antes de conectar los datos reales. Nada de esto sale de la base. Las series
 * van del mes más viejo al elegido (3 meses).
 */

export interface PresentacionVacio {
  /** AL-340, V-250… */
  codigo: string
  /** AL-340 se mide en cm³; las demás en g. */
  unidad: "cm³" | "g"
  /** Cajas producidas (un total por mes). */
  cajas: number[]
  /** Merma de empaque, en %. */
  mermaEmpaque: number[]
  /** Merma de semielaborado, en %. */
  mermaSemi: number[]
  /** Fallas de ejemplo con las que arranca la lista (a mano, solo nombres). */
  fallas: string[]
}

export const PRESENTACIONES_VACIO: PresentacionVacio[] = [
  { codigo: "AL-340", unidad: "cm³", cajas: [8200, 9100, 9640], mermaEmpaque: [1.2, 0.9, 0.8], mermaSemi: [2.1, 1.8, 1.9], fallas: ["Cambio de rollo de tapa", "Falla en llenadora", "Ajuste de sellado"] },
  { codigo: "V-250", unidad: "g", cajas: [5400, 6100, 6480], mermaEmpaque: [1.5, 1.7, 1.4], mermaSemi: [2.4, 2.6, 2.2], fallas: ["Falla en cerradora de tapas", "Cambio de formato", "Espera de frascos"] },
  { codigo: "V-114", unidad: "g", cajas: [3100, 2800, 3560], mermaEmpaque: [2.2, 2.6, 1.9], mermaSemi: [3.0, 3.4, 2.7], fallas: ["Falla en etiquetadora", "Frasco quebrado en banda", "Limpieza intermedia"] },
  { codigo: "V-186", unidad: "g", cajas: [4300, 4700, 4390], mermaEmpaque: [1.1, 1.3, 1.6], mermaSemi: [1.9, 2.0, 2.3], fallas: ["Cambio de formato", "Falla en llenadora", "Espera de tapas"] },
]

/** Eficiencia de Vacío (una sola para las dos presentaciones elegidas), en %. */
export const EFICIENCIA_VACIO = [79, 80, 86]

/** Las dos presentaciones con las que abre la pantalla. */
export const ELEGIDAS_VACIO: [string, string] = ["AL-340", "V-250"]
