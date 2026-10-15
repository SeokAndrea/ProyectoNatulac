import { duracionBaseTurnoMin, sinReportarDeLinea, ventanaTurnoMin } from "@/lib/eficiencia"
import { fmtDuracion, minutosPorClaseSinSolape, type Parada } from "@/lib/paradas"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"

/*
 * Minutos que faltan por reportar (dueña, 2026-10-15): la equivalencia en
 * tiempo de lo que se produjo, para ver qué parte del turno nadie explicó.
 *
 *   Producido    = Σ envases del PT de cada corrida ÷ su velocidad elegida
 *   Sin reportar = Ventana − Paradas cargadas (todas las clases, sin solape) − Producido
 *
 * Ventana: el turno completo si ya cerró; si sigue abierto, lo que va. Se
 * mide con el PT (pedido de la dueña), así que una línea con alguna corrida
 * sin PT todavía no se puede medir. La merma y correr más lento que la
 * velocidad elegida también salen como minutos sin reportar.
 *
 * Estos minutos castigan la eficiencia como una no programada (eficiencia.ts,
 * dueña 2026-10-15), con la misma cuenta (sinReportarDeLinea), y se siguen
 * mostrando acá como "sin reportar".
 */

export interface EntradaSinReportar {
  turnoTipo: string
  esquema?: string | null
  horaInicio?: string | null
  estado: "ABIERTO" | "CERRADO"
  /** Horas desde el inicio del turno (solo importa con el turno abierto). */
  horasTranscurridas: number
  corridas: Corrida[]
  productoTerminado: ProductoTerminadoRegistro[]
  /** Paradas del turno (las de Mantenimiento ya recortadas a su ventana). */
  paradas: Parada[]
  ahora?: Date
}

export interface SinReportarLinea {
  /** "1", "2", "3". */
  linea: string
  ventanaMin: number
  paradasMin: number
  producidoMin: number
  /** null = falta el PT de alguna corrida de la línea. */
  sinReportarMin: number | null
}

const numero = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/** Envases de un PT a partir de sus litros (guardados al cargarlo) y el volumen de la presentación. */
function envasesPt(pt: ProductoTerminadoRegistro): number {
  const ml = Number(pt.presentacion)
  return ml > 0 ? (pt.litrosProducidos * 1000) / ml : 0
}

/** Una fila por línea que corrió en el turno, en orden de línea. Sin base de turno (tipo desconocido), vacío. */
export function minutosSinReportar(e: EntradaSinReportar): SinReportarLinea[] {
  const turnoMin = duracionBaseTurnoMin(e.turnoTipo, e)
  if (turnoMin === null) return []
  const ventanaMin = ventanaTurnoMin(turnoMin, e.estado, e.horasTranscurridas)
  const ahora = e.ahora ?? new Date()

  const lineas = [...new Set(e.corridas.map((c) => numero(c.linea)))].sort()
  return lineas.map((linea) => {
    const corridas = e.corridas.filter((c) => numero(c.linea) === linea)
    const minutos = minutosPorClaseSinSolape(
      e.paradas.filter((p) => numero(p.lineaCodigo) === linea),
      ahora,
    )
    const paradasMin = minutos.PROGRAMADA + minutos.NO_PROGRAMADA + minutos.OCIOSO

    let faltaPt = false
    let producidoMin = 0
    for (const c of corridas) {
      const pt = e.productoTerminado.find((p) => p.corridaId === c.id)
      if (!pt) faltaPt = true
      else if (c.envasesHora > 0) producidoMin += (envasesPt(pt) / c.envasesHora) * 60
    }
    producidoMin = Math.round(producidoMin)

    return {
      linea,
      ventanaMin,
      paradasMin,
      producidoMin,
      sinReportarMin: sinReportarDeLinea(ventanaMin, paradasMin, producidoMin, faltaPt),
    }
  })
}

/** Minutos para el desglose: 0 se lee "0 min", no "< 1 min". */
export const dur = (min: number) => (min === 0 ? "0 min" : fmtDuracion(min))

/** Hasta esto se toma como "al día": la velocidad real nunca es exacta. */
export const TOLERANCIA_SIN_REPORTAR_MIN = 10

/** Texto y color de una línea: minutos sin reportar, al día, o falta el PT. */
export function textoSinReportar(f: SinReportarLinea): { texto: string; alerta: boolean } {
  if (f.sinReportarMin === null) return { texto: "falta cargar el PT", alerta: false }
  if (f.sinReportarMin <= TOLERANCIA_SIN_REPORTAR_MIN) return { texto: "al día", alerta: false }
  return { texto: `faltan ${fmtDuracion(f.sinReportarMin)} por reportar`, alerta: true }
}

