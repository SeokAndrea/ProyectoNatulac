/**
 * Tipos del módulo Producción — dueño de las líneas, las corridas y los
 * contadores (`turno_lineas`, `lineas_estado`, `contadores`). Ver
 * plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Renombre aplicado (Revisión de nombres del plan): `LineaEnTurno`/
 * `turnoLineaId` → `Corrida`/`corridaId` — el propio comentario del código
 * viejo (src/lib/turno.tsx) decía que ya no es "una línea", es una corrida.
 */
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"

export type CondicionLinea = "DETENIDA" | "LISTA" | "CIP" | "CAMBIO_PRESENTACION" | "SIN_PROGRAMACION"

export type Resultado = { ok: true } | { ok: false; error: string }

/**
 * Una corrida: una línea produciendo un lote/sabor concreto. Puede haber
 * varias corridas por línea a lo largo de un turno (se archivan, no se
 * pisan).
 */
export interface Corrida {
  id: string
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
  saborId: string | null
  saborNombre: string | null
  lote: string | null
  /** Lote (preparación, módulo Preparación) del que está tomando esta corrida, si corresponde. */
  loteId: string | null
  activa: boolean
  activadaEn: string
  /** Parada reversible (se puede Continuar) — la corrida sigue activa=true mientras está pausada. */
  pausadaEn: string | null
  /**
   * El lote que alimentaba esta corrida se cerró (el supervisor inició una
   * preparación nueva sobre el mismo tanque) — la corrida sigue
   * activa=true, pero en Líneas se le ofrecen 2 opciones: Terminó Lote o
   * Continuar al siguiente lote (ver continuarSiguienteLote).
   */
  loteTerminado: string | null
  finalizadaEn: string | null
  /** Terminar Lote ya se apretó (activa=false) pero todavía no se registró su contador — no está realmente cerrada. */
  esperandoCierre: boolean
  /** El supervisor ya cerró SU parte con "¿Va a continuar en el siguiente turno?" — la corrida sigue activa=true igual. */
  entregadaEn: string | null
  /** null = falta revisar (Confirmar o Corregir) al abrir el turno — solo aplica a una corrida activa heredada. */
  confirmadoInicioEn: string | null
}

/** Condición continua de una línea SIN corrida activa — "Corriendo" no es un valor acá, se deriva de que exista una Corrida activa. */
export interface LineaEstado {
  linea: LineaCodigo
  condicion: CondicionLinea
  activadaEn: string
  cipIniciadoEn: string | null
  cipFinalizadoEn: string | null
  /** Falla u observación libre (máx. 140) que se carga al dejar la línea en DETENIDA. */
  observacion: string | null
}

/**
 * Contador: un solo valor por registro (envases que salieron de la
 * llenadora), ligado a la corrida que lo generó. La merma no se calcula
 * acá — sale de comparar esto contra el módulo de Producto Terminado.
 */
export interface ContadorRegistro {
  id: string
  linea: LineaCodigo
  corridaId: string | null
  envasesLlenadora: number
  /** Contador 2 (envases buenos), obligatorio junto con el contador de la llenadora. No entra en la merma de envase; corrobora el PT y la merma de semielaborado (Reportes). */
  envasesBuenos: number | null
  justificacion: string
  /** Lectura de una entrega parcial: solo referencia, NO cuenta para merma. */
  parcial: boolean
  creadoEn: string
}

export interface DatosActivarLinea {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
  /** Tanque Liberado del que va a tomar esta corrida — sabor y lote se derivan de ahí. */
  numeroTanque: 1 | 2 | 3
  /** Si viene en true, la corrida nace ya confirmada. */
  confirmarInicio?: boolean
}

export interface DatosCambiarLinea {
  linea: LineaCodigo
  condicion: CondicionLinea
  /** Solo se usa con condicion === "DETENIDA": falla u observación libre, máx. 140. */
  observacion?: string | null
}

export interface DatosNuevoContador {
  corridaId: string
  linea: LineaCodigo
  envasesLlenadora: number
  envasesBuenos?: number | null
  justificacion: string
  parcial?: boolean
}

// ------------------------------------------------------------
// Formas crudas que devuelve turno_json() — redeclaradas acá, mismo
// patrón que src/lib/preparacion/tipos.ts.
// ------------------------------------------------------------

export interface FilaCorrida {
  id: string
  linea_codigo: string
  presentacion_volumen_ml: number | null
  envases_hora: number | null
  sabor_id: string | null
  sabor_nombre: string | null
  lote: string | null
  lote_id: string | null
  activa: boolean
  activada_en: string
  pausada_en: string | null
  lote_terminado_en: string | null
  entregada_en: string | null
  finalizada_en: string | null
  confirmado_inicio_en: string | null
}

export interface FilaLineaEstado {
  linea_codigo: string
  condicion: CondicionLinea
  activada_en: string
  cip_iniciado_en: string | null
  cip_finalizado_en: string | null
  observacion: string | null
}

export interface FilaContador {
  id: string
  linea_codigo: string
  turno_linea_id: string | null
  envases_llenadora: number
  envases_buenos: number | null
  justificacion: string | null
  parcial: boolean
  creado_en: string
}
