/**
 * Realidad de Preparación: qué lotes entran al cálculo de merma de
 * semielaborado del turno, y con cuánto.
 *
 * Fórmula (dueña, 2026-11-03):
 *   Rendimiento = Total envasado / Total preparado × 100
 *   Merma       = 100 − Rendimiento
 *
 * Ya NO se compara contra el volumen vivo del tanque (inicio − fin): ese
 * volumen es un libro (preparado − PT) y sin "Medir tanque" daba siempre
 * 100 %. Ahora cada lote CERRADO aporta:
 *   preparado = volumen_inicial_l + transferencias recibidas
 *             − transferido/desvasado/a Vacío − resto que pasó al lote siguiente
 *   envasado  = su PT
 * repartido entre los turnos que lo envasaron en proporción al PT de
 * cada uno (los totales vienen de rendimiento_lotes(), migración
 * 20261115090000 — ver src/lib/preparacion/totalesLote.ts). Un lote abierto
 * queda "EN_CURSO": su rendimiento sale al cerrarlo. Sin filtros de "PT
 * excede" ni "sin consumo": el número se muestra tal cual.
 */
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { DesvaseLoteRegistro, PreparacionRegistro, TransferenciaRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"

export interface ConsumoYProducido {
  /** Denominador: Σ preparado (la parte de este turno) de los lotes cerrados. */
  consumo: number
  /** Numerador: Σ litros de PT de esos mismos lotes. */
  producido: number
  /** true si algún lote que el turno tocó sigue abierto. */
  hayLoteAbierto: boolean
  /** Litros de PT sin lote asociado, o de lotes sin totales leídos. Los lotes en curso NO cuentan acá. */
  litrosSinContraste: number
}

/**
 * Por qué un lote no entra en la merma del turno. EN_CURSO = lote abierto
 * (todavía se envasa). SIN_TRAMO = no se pudieron leer sus totales.
 * PT_EXCEDE ya no se usa (se quitó el filtro); queda por datos viejos.
 */
export type MotivoSinContraste = "SIN_LOTE" | "SIN_TRAMO" | "PT_EXCEDE" | "EN_CURSO"

/**
 * Un lote que el turno tocó, con la parte del lote que le toca al turno y
 * su PT. `excluido` = por qué no entra en la merma (null = entra). Los
 * lotes de Vacío no aparecen (no son de Aséptico, migración 20261109490000).
 */
export interface TramoLote {
  loteId: string
  lote: PreparacionRegistro | null
  /** Preparado del lote (la parte de este turno). */
  inicio: number | null
  /** Volumen vivo del tanque al terminar el turno — solo informativo, no entra al cálculo. */
  fin: number
  /** Transferido, desvasado o entregado a Vacío (la parte de este turno). */
  salientes: number
  /** Absorbido desde otro lote (la parte de este turno). */
  entrantes: number
  /** inicio + entrantes − salientes: lo preparado que le toca al turno; null si no entra. */
  tramo: number | null
  /** Litros de PT de las corridas de este lote en este turno. */
  pt: number
  excluido: MotivoSinContraste | null
}

/**
 * Lotes que este turno tocó (alimentaron una corrida, o nacieron en el
 * turno), con lo preparado que le toca al turno y el PT que envasó.
 * `ptSinLote`: PT de corridas sin lote.
 *
 * Los parámetros contadores/presentaciones/transferencias/desvases ya no
 * se usan (los totales del lote vienen de la base); se dejan para no
 * cambiar a quien llama.
 */
export function tramosPorLote(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  _contadores: ContadorRegistro[] = [],
  _presentaciones: PresentacionLive[] = [],
  _transferencias: TransferenciaRegistro[] = [],
  _desvases: DesvaseLoteRegistro[] = [],
): { tramos: TramoLote[]; ptSinLote: number } {
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
    if (!lote) {
      tramos.push({ loteId, lote: null, inicio: null, fin: 0, salientes: 0, entrantes: 0, tramo: null, pt: ptLote, excluido: "SIN_LOTE" })
      continue
    }
    // Lote de Vacío: no es de Aséptico, no entra en su merma (migración 20261109490000).
    if (lote.paraVacio) continue

    const fin = lote.volumenActualL ?? 0
    const tot = lote.totales ?? null
    // Sin los totales del lote (no se leyeron o falta la migración) no hay contra qué comparar.
    if (!tot) {
      tramos.push({ loteId, lote, inicio: null, fin, salientes: 0, entrantes: 0, tramo: null, pt: ptLote, excluido: "SIN_TRAMO" })
      continue
    }
    // Lote abierto: todavía se está envasando — el rendimiento sale al cerrarlo.
    if (!tot.cerrado) {
      tramos.push({ loteId, lote, inicio: null, fin, salientes: 0, entrantes: 0, tramo: null, pt: ptLote, excluido: "EN_CURSO" })
      continue
    }

    // Parte del lote que le toca a este turno: en proporción a lo que
    // envasó. Si el lote no envasó nada en ningún turno, todo lo preparado
    // se perdió y va al turno donde nació.
    const parte = tot.envasadoL > 0 ? ptLote / tot.envasadoL : lote.turnoId === turnoId ? 1 : 0
    const inicio = tot.preparadoL * parte
    const entrantes = tot.entrantesL * parte
    const salientes = tot.salientesL * parte
    // Lo transferido/desvasado/entregado a Vacío no se perdió: no cuenta como preparado de este lote.
    const tramo = inicio + entrantes - salientes
    tramos.push({ loteId, lote, inicio, fin, salientes, entrantes, tramo, pt: ptLote, excluido: null })
  }

  return { tramos, ptSinLote }
}

/** Totales de merma de semielaborado del turno (ver tramosPorLote). */
export function calcularConsumoYProducido(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[] = [],
  presentaciones: PresentacionLive[] = [],
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
    if (t.excluido === "EN_CURSO") {
      hayLoteAbierto = true
      continue
    }
    if (t.excluido !== null || t.tramo === null) {
      litrosSinContraste += t.pt
      continue
    }
    consumo += t.tramo
    producido += t.pt
  }

  return { consumo, producido, hayLoteAbierto, litrosSinContraste: Math.round(litrosSinContraste) }
}
