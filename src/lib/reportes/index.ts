/**
 * Reportes — la única capa que le lee a los 3 módulos de dominio a la
 * vez (Preparación, Producción, Producto Terminado). Ninguno de los 3
 * calcula ningún %: exponen números crudos, acá se hace la resta/división.
 * Ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Extraído en su momento de src/lib/panelProduccion.ts y del ya
 * retirado src/lib/calculosPruebas.ts — mismo comportamiento exacto
 * (mismos números), solo que ahora arma el cálculo a partir de las
 * porciones de cada módulo en vez de un TurnoActivo combinado. La
 * verificación es src/lib/reportes/pruebas.test.ts contra el CSV
 * (17/17 casos, byte a byte contra la versión vieja al migrar).
 */
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { horaPlanta } from "@/lib/tiempoPlanta"
import { pctCumplimiento, pctRendimiento } from "./teorico"
import { calcularConsumoYProducido } from "./realidadPreparacion"
import { mermaCorrida, mermaEnvasesDeCorridas } from "./realidadProduccion"

export { mermaCorrida }

/** Horas transcurridas desde el inicio del turno (hasta ahora si sigue abierto, o hasta el cierre si ya cerró). */
export function horasTranscurridasTurno(horaInicio: string, estado: "ABIERTO" | "CERRADO", horaFin: string | null): number {
  const [h1, m1] = horaInicio.split(":").map(Number)
  // Turno cerrado: se mide hasta su hora de cierre (dato fijo), no hasta
  // "ahora". Así la meta de un turno viejo deja de moverse en cada
  // refresco del Panel y se puede reproducir/verificar contra un valor
  // cargado a mano (ver src/lib/reportes/pruebas.ts y su CSV).
  const finReloj = estado === "CERRADO" && horaFin ? horaFin : horaPlanta()
  const [h2, m2] = finReloj.split(":").map(Number)
  let minutos = h2 * 60 + m2 - (h1 * 60 + m1)
  if (minutos < 0) minutos += 24 * 60
  return Math.max(minutos / 60, 0.1)
}

export interface MermaEnvasesTurno {
  pct: number | null
}

/** Merma de ENVASES de todo el turno (todas las corridas juntas) — no necesita `corridas`, solo lo que ya tiene contador cargado. */
export function mermaEnvasesTurno(
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
): MermaEnvasesTurno {
  const corridaIds = contadores.map((c) => c.corridaId).filter((id): id is string => id !== null)
  return mermaEnvasesDeCorridas(corridaIds, contadores, productoTerminado, presentaciones)
}

/** Merma de ENVASES de una línea puntual, agregando todas sus corridas del turno que ya sean comparables. */
export function mermaLineaTurno(
  corridas: Corrida[],
  lineaCodigo: string,
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
): { pct: number | null } {
  const corridaIds = corridas.filter((c) => c.linea === lineaCodigo).map((c) => c.id)
  return mermaEnvasesDeCorridas(corridaIds, contadores, productoTerminado, presentaciones)
}

export interface MermaSemielaboradoTurno {
  pct: number | null
  consumo: number
  litrosProducidos: number
  /** Alias de `consumo` — se mantiene por compatibilidad con el desglose. */
  litrosConsumidos: number
  hayLoteAbierto: boolean
  litrosSinContraste: number
  hayLoteSinContraste: boolean
}

/**
 * Merma de SEMIELABORADO — modelo repartido por turno (ver
 * plan-debug-merma-semielaborado.md §23/§33/§41 y el guardrail de
 * plan-rework-auditoria.md §7). `calcularConsumoYProducido` decide QUÉ
 * lotes entran (realidadPreparacion.ts); acá solo se hace la división.
 */
export function mermaSemielaboradoTurno(
  turnoId: string,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
): MermaSemielaboradoTurno {
  const { consumo, producido, hayLoteAbierto, litrosSinContraste } = calcularConsumoYProducido(
    turnoId,
    preparaciones,
    corridas,
    productoTerminado,
    contadores,
    presentaciones,
  )

  const pctCrudo = pctRendimiento(consumo, producido)

  return {
    // Nunca por debajo de 0 (rendimiento > 100 %). Con el guardrail de
    // calcularConsumoYProducido, un negativo residual solo puede venir de
    // ruido de medición sub-margen: se muestra como 0 (sin pérdida
    // medible), no como un número imposible.
    pct: pctCrudo !== null && pctCrudo < 0 ? 0 : pctCrudo,
    consumo,
    litrosProducidos: producido,
    litrosConsumidos: consumo,
    hayLoteAbierto,
    litrosSinContraste,
    hayLoteSinContraste: litrosSinContraste > 0,
  }
}

export interface MetaLinea {
  linea: string
  cajasEsperadas: number
  cajasReales: number
}

/**
 * Cajas que DEBERÍAN haber salido de cada línea activa, según la
 * velocidad elegida y las horas transcurridas del turno.
 */
export function calcularMeta(
  corridas: Corrida[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
  horas: number,
): { porLinea: MetaLinea[]; totalEsperadas: number; totalReales: number; pctCumplimiento: number | null } {
  // Solo las corridas ACTIVAS ahora mismo — las que ya se finalizaron
  // durante este turno (historial) no cuentan para la meta en curso.
  const porLinea: MetaLinea[] = corridas
    .filter((c) => c.activa)
    .map((c) => {
      const pres = presentaciones.find((p) => p.codigo === c.presentacion)
      const cajasHora = pres && pres.envasesXCaja > 0 ? c.envasesHora / pres.envasesXCaja : 0
      const cajasEsperadas = Math.round(cajasHora * horas)

      const envasesLlenadora = contadores
        .filter((cont) => cont.corridaId === c.id && !cont.parcial)
        .reduce((a, cont) => a + cont.envasesLlenadora, 0)
      const cajasReales = pres && pres.envasesXCaja > 0 ? Math.round(envasesLlenadora / pres.envasesXCaja) : 0

      return { linea: c.linea, cajasEsperadas, cajasReales }
    })

  const totalEsperadas = porLinea.reduce((a, m) => a + m.cajasEsperadas, 0)
  const totalReales = porLinea.reduce((a, m) => a + m.cajasReales, 0)

  return { porLinea, totalEsperadas, totalReales, pctCumplimiento: pctCumplimiento(totalEsperadas, totalReales) }
}

// ------------------------------------------------------------
// Desglose — números crudos detrás de cada %, para el Panel (Área de
// Pruebas) y para el test CSV. Antes en el ya retirado src/lib/calculosPruebas.ts.
// ------------------------------------------------------------

export interface DesgloseCorrida {
  corridaId: string
  linea: string
  presentacionMl: number | null
  lote: string | null
  activa: boolean
  envasesLlenadora: number
  envasesProductoTerminado: number | null
  mermaEnvasePct: number | null
  cajasEsperadas: number | null
  cajasReales: number | null
}

export interface DesgloseCalculos {
  horasTranscurridas: number
  porCorrida: DesgloseCorrida[]
  mermaEnvaseTurnoPct: number | null
  litrosConsumidos: number
  volumenInicial: number
  litrosProducidos: number
  rendimientoTurnoPct: number | null
  hayLoteAbierto: boolean
  cajasEsperadasTotal: number
  cajasRealesTotal: number
  cumplimientoTurnoPct: number | null
}

export function desglosarCalculos(
  turnoId: string,
  horaInicio: string,
  estado: "ABIERTO" | "CERRADO",
  horaFin: string | null,
  preparaciones: PreparacionRegistro[],
  corridas: Corrida[],
  productoTerminado: ProductoTerminadoRegistro[],
  contadores: ContadorRegistro[],
  presentaciones: PresentacionLive[],
): DesgloseCalculos {
  const horas = horasTranscurridasTurno(horaInicio, estado, horaFin)
  const meta = calcularMeta(corridas, contadores, presentaciones, horas)
  // meta.porLinea sale en el MISMO orden que este filtro: calcularMeta()
  // hace corridas.filter(c => c.activa).map(...) sin reordenar.
  const activas = corridas.filter((c) => c.activa)

  const porCorrida: DesgloseCorrida[] = corridas.map((c) => {
    const pres = presentaciones.find((p) => p.codigo === c.presentacion) ?? null
    const m = mermaCorrida(c.id, contadores, productoTerminado, presentaciones)
    const idxActiva = activas.indexOf(c)
    const metaLinea = idxActiva >= 0 ? (meta.porLinea[idxActiva] ?? null) : null
    const envasesLlenadora = contadores
      .filter((cont) => cont.corridaId === c.id && !cont.parcial)
      .reduce((a, cont) => a + cont.envasesLlenadora, 0)

    return {
      corridaId: c.id,
      linea: c.linea,
      presentacionMl: pres?.volumenMl ?? null,
      lote: c.lote,
      activa: c.activa,
      envasesLlenadora,
      envasesProductoTerminado: m?.envasesProductoTerminado ?? null,
      mermaEnvasePct: m?.pct ?? null,
      cajasEsperadas: metaLinea?.cajasEsperadas ?? null,
      cajasReales: metaLinea?.cajasReales ?? null,
    }
  })

  const mermaEnvase = mermaEnvasesTurno(contadores, productoTerminado, presentaciones)
  const mermaSemi = mermaSemielaboradoTurno(turnoId, preparaciones, corridas, productoTerminado, contadores, presentaciones)

  return {
    horasTranscurridas: Math.round(horas * 100) / 100,
    porCorrida,
    mermaEnvaseTurnoPct: mermaEnvase.pct,
    litrosConsumidos: mermaSemi.litrosConsumidos,
    volumenInicial: mermaSemi.consumo,
    litrosProducidos: mermaSemi.litrosProducidos,
    rendimientoTurnoPct: mermaSemi.pct,
    hayLoteAbierto: mermaSemi.hayLoteAbierto,
    cajasEsperadasTotal: meta.totalEsperadas,
    cajasRealesTotal: meta.totalReales,
    cumplimientoTurnoPct: meta.pctCumplimiento,
  }
}
