import type { Parada } from "@/lib/paradas"

/** Ventana de un turno. Fechas ISO local `YYYY-MM-DDTHH:MM:SS` (hora de planta). */
export interface VentanaTurno {
  id: string
  etiqueta: string
  desde: string
  hasta: string
}

const MIN = 60000

/** Milisegundos de la parada dentro de la ventana (la abierta cuenta hasta ahora). */
function msEnVentana(
  p: Pick<Parada, "inicio" | "fin">,
  v: Pick<VentanaTurno, "desde" | "hasta">,
  ahora: Date,
): number {
  const ini = Math.max(new Date(p.inicio).getTime(), new Date(v.desde).getTime())
  const fin = Math.min(
    p.fin ? new Date(p.fin).getTime() : ahora.getTime(),
    ahora.getTime(),
    new Date(v.hasta).getTime(),
  )
  return Math.max(0, fin - ini)
}

/** Minutos de la parada dentro de la ventana de un turno. */
export function tramoEnTurno(
  p: Pick<Parada, "inicio" | "fin">,
  v: Pick<VentanaTurno, "desde" | "hasta">,
  ahora: Date,
): number {
  return Math.round(msEnVentana(p, v, ahora) / MIN)
}

/** Reparte la parada entre los turnos; el último tramo absorbe el redondeo. */
export function desgloseEnTurnos(
  p: Pick<Parada, "inicio" | "fin">,
  ventanas: VentanaTurno[],
  ahora: Date,
): { total: number; tramos: { etiqueta: string; min: number }[] } {
  const partes = ventanas
    .map((v) => ({ etiqueta: v.etiqueta, ms: msEnVentana(p, v, ahora) }))
    .filter((x) => x.ms > 0)
  const total = Math.round(partes.reduce((a, x) => a + x.ms, 0) / MIN)
  let acumulado = 0
  const tramos = partes.map((x, i) => {
    const min = i === partes.length - 1 ? total - acumulado : Math.round(x.ms / MIN)
    acumulado += min
    return { etiqueta: x.etiqueta, min }
  })
  return { total, tramos }
}

/** La parada empezó en un turno ya cerrado y sigue abierta pasado su cierre. */
export function cruzaTurnoCerrado(
  p: Pick<Parada, "inicio"> & { fin?: string | null },
  ventanas: (VentanaTurno & { cerrado: boolean })[],
): boolean {
  const ini = new Date(p.inicio).getTime()
  const v = ventanas.find((w) => ini >= new Date(w.desde).getTime() && ini < new Date(w.hasta).getTime())
  if (!v || !v.cerrado) return false
  return !p.fin || new Date(p.fin).getTime() > new Date(v.hasta).getTime()
}
