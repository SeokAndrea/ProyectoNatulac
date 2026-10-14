/*
 * Indicadores (prototipo aprobado 2026-10-14): tablero mensual por línea y
 * presentación. Cada mes es AUTOMÁTICO (lo calcula la app, ver
 * automatico.ts) o MANUAL (lo carga a mano la analista). Las dos formas
 * dan un DatosMes, así la pantalla no distingue de dónde vino. Ausentismo
 * e incidencias son siempre a mano: salen de lo guardado aunque el mes
 * sea automático.
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
  /** Envases perdidos ("Equivalencia en unidades" del Excel). */
  mermaUnidades?: number | null
  /** % de cumplimiento cargado a mano cuando no hay cajas (ej. julio y agosto del Excel). Con cajas, manda prod ÷ plan. */
  cumplimiento?: number | null
  paradas: ParadaMes[]
}

/** Ausentismo de un grupo, como en el informe (siempre a mano). */
export interface AusentismoGrupo {
  /** "1", "2", "3". */
  grupo: string
  /** % de ausentismo del grupo. */
  porcentaje: number | null
  /** % de las horas perdidas del mes que fueron de este grupo. */
  partePerdidas: number | null
  /** Quién incidió más y cuántos días. */
  quien: string
  dias: number | null
}

export interface Ausentismo {
  /** Horas planificadas del período. */
  horasTeoricas: number | null
  horasPerdidas: number | null
  grupos: AusentismoGrupo[]
}

/** Una incidencia o un seguimiento del mes (formato del informe, siempre a mano). */
export interface Incidencia {
  tipo: "INCIDENCIA" | "SEGUIMIENTO"
  evento: string
  quePaso: string
  comoPaso: string
  accionCorrectiva: string
}

export interface DatosMes {
  /** Eficiencia de cada línea, %. Clave: número de línea ("1", "2", "3"). */
  eficiencia: Record<string, number | null>
  /** Clave: claveP() — "1|1000". */
  presentaciones: Record<string, DatosPresentacion>
  /** Rendimiento del semielaborado, %. Clave: nombre de la familia (familias_producto). */
  semielaborado: Record<string, number | null>
  /** Siempre a mano, también en los meses automáticos. */
  ausentismo?: Ausentismo | null
  /** Siempre a mano, también en los meses automáticos. */
  incidencias?: Incidencia[]
  /** Título de esa pantalla, escrito por la analista ("INCIDENCIAS", "SEGUIMIENTO"…). Vacío = TITULO_INCIDENCIAS. */
  tituloIncidencias?: string
}

export const TITULO_INCIDENCIAS = "INCIDENCIAS Y SEGUIMIENTO"

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
export const GRUPOS_AUSENTISMO = ["1", "2", "3"]
export const ausentismoVacio = (): Ausentismo => ({
  horasTeoricas: null,
  horasPerdidas: null,
  grupos: GRUPOS_AUSENTISMO.map((grupo) => ({ grupo, porcentaje: null, partePerdidas: null, quien: "", dias: null })),
})
export const incidenciaVacia = (): Incidencia => ({ tipo: "INCIDENCIA", evento: "", quePaso: "", comoPaso: "", accionCorrectiva: "" })
export const presentacionVacia = (): DatosPresentacion => ({ corrio: false, prod: null, plan: null, merma: null, paradas: [] })
