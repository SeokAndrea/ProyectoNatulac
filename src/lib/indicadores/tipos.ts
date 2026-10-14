/*
 * Indicadores (prototipo aprobado 2026-10-14): tablero mensual por línea y
 * presentación. Cada mes es AUTOMÁTICO (lo calcula la app, ver
 * automatico.ts) o MANUAL (lo cargan a mano el jefe o la analista). Las
 * dos formas dan un DatosMes, así la pantalla no distingue de dónde vino.
 * Un número vacío (null) se muestra "—".
 */

export type ModoMes = "AUTO" | "MANUAL"

/** Una causa de parada no programada en el mes. */
export interface ParadaMes {
  causa: string
  minutos: number | null
  veces: number | null
}

export interface DatosPresentacion {
  /** Si no se corrió (y no tiene plan), no aparece. */
  corrio: boolean
  /** Cajas producidas (Producto Terminado). */
  prod: number | null
  /** Cajas planeadas (Programación). */
  plan: number | null
  /** Merma de envases, %. */
  merma: number | null
  paradas: ParadaMes[]
}

export interface DatosMes {
  /** Eficiencia de cada línea, %. Clave: número de línea ("1", "2", "3"). */
  eficiencia: Record<string, number | null>
  /** Clave: claveP() — "1|1000". */
  presentaciones: Record<string, DatosPresentacion>
  /** Rendimiento del semielaborado, %. Clave: nombre de la familia (familias_producto). */
  semielaborado: Record<string, number | null>
}

/** Lo guardado de un mes (tabla indicadores_mes). */
export interface RegistroMes {
  /** 'YYYY-MM-01' */
  mes: string
  modo: ModoMes
  /** Lo cargado a mano; null = nunca se cargó. */
  datos: DatosMes | null
  /** Clave: claveP() o claveSemi(). */
  observaciones: Record<string, string>
}

/** Presentación dentro de una línea: "1|1000". */
export const claveP = (linea: string, ml: string | number) => `${linea}|${ml}`
/** Producto de semielaborado, para las observaciones: "semi|Selecto". */
export const claveSemi = (familia: string) => `semi|${familia}`

export const mesVacio = (): DatosMes => ({ eficiencia: {}, presentaciones: {}, semielaborado: {} })
export const presentacionVacia = (): DatosPresentacion => ({ corrio: false, prod: null, plan: null, merma: null, paradas: [] })
