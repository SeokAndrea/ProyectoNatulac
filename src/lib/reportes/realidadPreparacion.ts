/**
 * Realidad de Preparación: qué lotes/tramos entran al cálculo de merma
 * de semielaborado, y cuáles quedan sin contraste. Ver
 * plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraído de mermaSemielaboradoTurno() (antes en
 * src/lib/panelProduccion.ts) — mismo comportamiento exacto, mismo
 * guardrail (plan-rework-auditoria.md §7), leyendo de los tipos nuevos de
 * Preparación/Producción/Producto Terminado en vez de un TurnoActivo
 * combinado. La fórmula final (consumo → %) se queda en index.ts, que es
 * el único que le habla a teorico.ts — acá solo se decide QUÉ entra.
 */
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { DesvaseLoteRegistro, PreparacionRegistro, TransferenciaRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"

/** El PT de un lote no puede superar el volumen que ese lote tuvo — MARGEN_REDONDEO cubre el ruido de litros_x_caja y paletas parciales. */
const MARGEN_REDONDEO = 1.05
/** Tolerancia para que el Contador 2 (envases buenos) corrobore un PT que excede el volumen preparado (relleno de tanque a mitad de corrida). */
const TOLERANCIA_ENVASES_BUENOS = 0.05

/**
 * Litros "buenos" (Contador 2) de todas las corridas de ESTE turno que
 * alimentaron `loteId`, convertidos por la presentación de cada corrida.
 * null si ninguna trajo esa lectura (nada que corroborar).
 */
function litrosBuenosDeLote(
  loteId: string,
  corridas: Corrida[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
): number | null {
  let litros = 0
  let algunaLectura = false
  for (const corrida of corridas) {
    if (corrida.loteId !== loteId) continue
    const pres = presentaciones.find((p) => p.codigo === corrida.presentacion)
    if (!pres) continue
    for (const c of contadores) {
      if (c.corridaId !== corrida.id || c.envasesBuenos === null) continue
      litros += (c.envasesBuenos * pres.volumenMl) / 1000
      algunaLectura = true
    }
  }
  return algunaLectura ? litros : null
}

export interface ConsumoYProducido {
  /** Denominador: Σ (inicio − fin) SOLO de los lotes con tramo de consumo confiable. */
  consumo: number
  /** Numerador: Σ litros de PT SOLO de los lotes que entraron al denominador (mismo conjunto). */
  producido: number
  /** true si algún lote que el turno tocó sigue abierto. */
  hayLoteAbierto: boolean
  /** Litros de PT que quedaron fuera: lotes sin `inicio`, con `fin ≥ inicio`, PT que excede el volumen preparado (sin corroborar), o sin lote asociado. */
  litrosSinContraste: number
}

/**
 * Litros que un lote entregó a otro lado (transferencia, desvase o salida
 * a Vacío, que llega en `desvases`, ver salidasComoDesvases) — NO son merma, así que se restan de su tramo antes de compararlo
 * contra el Producto Terminado. Ver plan de "restar transferencias y
 * desvases del consumo".
 */
function litrosSalientesPorLote(
  transferencias: TransferenciaRegistro[],
  desvases: DesvaseLoteRegistro[],
): Map<string, number> {
  const saliente = new Map<string, number>()
  for (const tr of transferencias) {
    if (tr.loteIdOrigen === null) continue
    saliente.set(tr.loteIdOrigen, (saliente.get(tr.loteIdOrigen) ?? 0) + tr.litros)
  }
  for (const d of desvases) {
    if (d.loteIdOrigen === null) continue
    saliente.set(d.loteIdOrigen, (saliente.get(d.loteIdOrigen) ?? 0) + d.litros)
  }
  return saliente
}

/**
 * Litros que un lote YA EXISTENTE absorbió de una transferencia a
 * mitad de turno — su "inicio" quedó fijo antes de eso, así que hay
 * que sumárselos para no subestimar lo que tuvo disponible para
 * producir. Un lote NUEVO (creado por la misma transferencia, modo
 * LIMPIO) NO entra acá: nace con el monto ya incluido en
 * `volumenPreparadoL`, sumarlo de nuevo sería contarlo dos veces — se
 * distingue comparando `creadoEn` del lote contra `creadoEn` de la
 * transferencia (nacen en la MISMA transacción, mismo instante).
 */
function litrosEntrantesPorLote(transferencias: TransferenciaRegistro[], preparaciones: PreparacionRegistro[]): Map<string, number> {
  const entrante = new Map<string, number>()
  for (const tr of transferencias) {
    if (tr.loteIdDestino === null) continue
    const loteDestino = preparaciones.find((p) => p.id === tr.loteIdDestino)
    if (!loteDestino) continue
    if (new Date(loteDestino.creadoEn).getTime() >= new Date(tr.creadoEn).getTime()) continue
    entrante.set(tr.loteIdDestino, (entrante.get(tr.loteIdDestino) ?? 0) + tr.litros)
  }
  return entrante
}

/** Por qué un lote no entra en la merma del turno. */
export type MotivoSinContraste = "SIN_LOTE" | "SIN_TRAMO" | "PT_EXCEDE"

/**
 * Un lote que el turno tocó, con su tramo de consumo y su PT. `excluido` =
 * por qué no entra en la merma (null = entra). Los lotes de Vacío no
 * aparecen (no son de Aséptico, migración 20261109490000).
 */
export interface TramoLote {
  loteId: string
  lote: PreparacionRegistro | null
  /** Volumen al empezar el turno (o el preparado, si nació en él). */
  inicio: number | null
  /** Volumen al terminar el turno. */
  fin: number
  /** Transferido, desvasado o entregado a Vacío desde este lote. */
  salientes: number
  /** Absorbido a mitad de turno desde otro lote. */
  entrantes: number
  /** inicio − fin − salientes + entrantes; null sin inicio. */
  tramo: number | null
  /** Litros de PT de las corridas de este lote. */
  pt: number
  excluido: MotivoSinContraste | null
}

/**
 * Lotes que este turno tocó (alimentaron una corrida, o nacieron en el
 * turno), con su tramo de consumo (inicio − fin, ajustado por lo
 * transferido/desvasado) y el PT que produjeron. El guardrail: un lote
 * que no es confiable queda marcado en `excluido` y afuera de los dos
 * lados de la merma. `ptSinLote`: PT de corridas sin lote.
 */
export function tramosPorLote(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
  transferencias: TransferenciaRegistro[] = [],
  desvases: DesvaseLoteRegistro[] = [],
): { tramos: TramoLote[]; ptSinLote: number } {
  const litrosSalientes = litrosSalientesPorLote(transferencias, desvases)
  const litrosEntrantes = litrosEntrantesPorLote(transferencias, preparaciones)

  // Lotes que este turno tocó: los que alimentaron una corrida, más los
  // que nacieron en el turno (preparados aunque todavía sin correr).
  const loteIds = new Set<string>()
  for (const c of corridas) if (c.loteId !== null) loteIds.add(c.loteId)
  for (const p of preparaciones) if (p.turnoId === turnoId) loteIds.add(p.id)

  // Litros de PT atribuidos a cada lote (PT → corrida → lote_id). Lo que
  // no se puede atribuir (corrida sin lote_id) queda sin contraste.
  const ptPorLote = new Map<string, number>()
  let ptSinLote = 0
  for (const pt of productoTerminado) {
    const corrida = pt.corridaId ? corridas.find((c) => c.id === pt.corridaId) : null
    const loteId = corrida?.loteId ?? null
    if (loteId === null) {
      ptSinLote += pt.litrosProducidos
      continue
    }
    ptPorLote.set(loteId, (ptPorLote.get(loteId) ?? 0) + pt.litrosProducidos)
    loteIds.add(loteId)
  }

  const tramos: TramoLote[] = []
  for (const loteId of loteIds) {
    const lote = preparaciones.find((p) => p.id === loteId) ?? null
    const ptLote = ptPorLote.get(loteId) ?? 0
    const salientes = litrosSalientes.get(loteId) ?? 0
    const entrantes = litrosEntrantes.get(loteId) ?? 0
    if (!lote) {
      tramos.push({ loteId, lote: null, inicio: null, fin: 0, salientes, entrantes, tramo: null, pt: ptLote, excluido: "SIN_LOTE" })
      continue
    }
    // Lote de Vacío: no es de Aséptico, no entra en su merma (migración 20261109490000).
    if (lote.paraVacio) continue

    const inicio = lote.volumenAlIniciarTurnoL ?? lote.volumenPreparadoL
    const fin = lote.volumenActualL ?? 0
    const vi = lote.volumenPreparadoL // volumen preparado, para el chequeo físico
    // Lo transferido/desvasado no se perdió — se restó del tramo del que
    // lo entrega; lo absorbido a mitad de turno por un lote ya existente
    // no está en su "inicio" fijo — se le suma. Ver litrosSalientesPorLote
    // / litrosEntrantesPorLote arriba.
    const tramo = inicio === null ? null : inicio - fin - salientes + entrantes
    const ptExcedeVi = vi !== null && vi > 0 && ptLote > vi * MARGEN_REDONDEO

    let ptExcedeViCorroborado = false
    if (ptExcedeVi) {
      const litrosBuenos = litrosBuenosDeLote(loteId, corridas, contadores, presentaciones)
      ptExcedeViCorroborado = litrosBuenos !== null && Math.abs(litrosBuenos - ptLote) <= ptLote * TOLERANCIA_ENVASES_BUENOS
    }

    // PT que supera el propio tramo consumido del lote (más allá del ruido
    // de redondeo) = dato inconsistente: no puede salir más Producto
    // Terminado del que bajó del tanque. Fuera del %, así no lo empuja por
    // encima de 100. El arreglo de fondo vive en la migración 20261034
    // (preparar encima / transferir ya no encogen volumen_inicial_l del
    // lote que cierra); esto es la red de seguridad para datos viejos.
    const ptExcedeTramo =
      tramo !== null && tramo > 0 && ptLote > tramo * MARGEN_REDONDEO && !ptExcedeViCorroborado

    const excluido: MotivoSinContraste | null =
      tramo === null || tramo <= 0 ? "SIN_TRAMO" : (ptExcedeVi && !ptExcedeViCorroborado) || ptExcedeTramo ? "PT_EXCEDE" : null
    tramos.push({ loteId, lote, inicio, fin, salientes, entrantes, tramo, pt: ptLote, excluido })
  }

  return { tramos, ptSinLote }
}

/**
 * Totales de merma de semielaborado del turno (ver tramosPorLote). El
 * guardrail: numerador y denominador cubren SIEMPRE los mismos lotes —
 * uno que no es confiable queda afuera de los dos lados, sus litros
 * van a `litrosSinContraste`.
 */
export function calcularConsumoYProducido(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
  transferencias: TransferenciaRegistro[] = [],
  desvases: DesvaseLoteRegistro[] = [],
): ConsumoYProducido {
  const { tramos, ptSinLote } = tramosPorLote(
    turnoId,
    preparaciones,
    corridas,
    productoTerminado,
    contadores,
    presentaciones,
    transferencias,
    desvases,
  )

  let consumo = 0
  let producido = 0
  let litrosSinContraste = ptSinLote
  let hayLoteAbierto = false

  for (const t of tramos) {
    if (t.lote && t.lote.cerradoEn === null) hayLoteAbierto = true
    if (t.excluido !== null || t.tramo === null) {
      litrosSinContraste += t.pt
      continue
    }
    consumo += t.tramo
    producido += t.pt
  }

  return { consumo, producido, hayLoteAbierto, litrosSinContraste: Math.round(litrosSinContraste) }
}
