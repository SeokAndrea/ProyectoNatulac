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
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
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
      if (c.corridaId !== corrida.id || c.parcial || c.envasesBuenos === null) continue
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
 * Lotes que este turno tocó (alimentaron una corrida, o nacieron en el
 * turno), con su tramo de consumo (inicio − fin) si es confiable, y el
 * PT que produjeron. El guardrail: numerador y denominador cubren
 * SIEMPRE los mismos lotes — uno que no es confiable queda afuera de los
 * dos lados, sus litros van a `litrosSinContraste`.
 */
export function calcularConsumoYProducido(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
): ConsumoYProducido {
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

  let consumo = 0
  let producido = 0
  let litrosSinContraste = ptSinLote
  let hayLoteAbierto = false

  for (const loteId of loteIds) {
    const lote = preparaciones.find((p) => p.id === loteId)
    const ptLote = ptPorLote.get(loteId) ?? 0
    if (!lote) {
      litrosSinContraste += ptLote
      continue
    }
    if (lote.cerradoEn === null) hayLoteAbierto = true

    const inicio = lote.volumenAlIniciarTurnoL ?? lote.volumenPreparadoL
    const fin = lote.volumenActualL ?? 0
    const vi = lote.volumenPreparadoL // volumen preparado, para el chequeo físico
    const tramo = inicio === null ? null : inicio - fin
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

    if (tramo === null || tramo <= 0 || (ptExcedeVi && !ptExcedeViCorroborado) || ptExcedeTramo) {
      litrosSinContraste += ptLote
      continue
    }
    consumo += tramo
    producido += ptLote
  }

  return { consumo, producido, hayLoteAbierto, litrosSinContraste: Math.round(litrosSinContraste) }
}
