/*
 * «Cubrir» lo sin reportar de una línea en el Modo Paradas (dueña, 2026-10-25).
 *
 * Lo que falta cubrir sale de la cuenta del PT (minutosSinReportar.ts): se
 * sabe CUÁNTO falta, no CUÁNDO. Las paradas, en cambio, se cuentan por su
 * posición en el reloj y sin solape (minutosPorClaseSinSolape): si la que
 * cubre cae encima de otra, ese tramo no suma y lo sin cubrir no baja. Por
 * eso la parada que cubre va a tramos del turno donde no hay ninguna otra
 * parada, empezando por lo más reciente; si no hay un tramo tan largo, se
 * reparte en varios. La hora queda aproximada (nadie la sabía); el tiempo,
 * completo.
 */

export interface TramoHora {
  /** Hora de planta 'YYYY-MM-DDTHH:MM:SS'. */
  inicio: string
  fin: string
}

const MIN = 60_000
const dd = (n: number) => String(n).padStart(2, "0")

/** ms → 'YYYY-MM-DDTHH:MM:SS' en el mismo reloj con el que se leen las paradas. */
export function aHoraPlanta(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}:00`
}

/**
 * Tramos [desde, hasta) sin ninguna parada, en minutos enteros. Una parada
 * abierta (fin null) ocupa hasta `hasta`.
 */
export function tramosLibres(paradas: { inicio: string; fin: string | null }[], desdeMs: number, hastaMs: number): [number, number][] {
  const ocupados = paradas
    .map((p) => [new Date(p.inicio).getTime(), p.fin ? new Date(p.fin).getTime() : hastaMs] as [number, number])
    .map(([a, b]) => [Math.max(a, desdeMs), Math.min(b, hastaMs)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  const libres: [number, number][] = []
  let cursor = desdeMs
  for (const [a, b] of ocupados) {
    if (a > cursor) libres.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < hastaMs) libres.push([cursor, hastaMs])
  // Solo minutos enteros: lo que queda de menos de un minuto no sirve para una parada.
  return libres
    .map(([a, b]) => [Math.ceil(a / MIN) * MIN, Math.floor(b / MIN) * MIN] as [number, number])
    .filter(([a, b]) => b - a >= MIN)
}

/**
 * Dónde guardar `minutos` de parada dentro de los tramos libres, desde el más
 * reciente hacia atrás. Devuelve uno o más tramos que suman `minutos`, o
 * vacío si no entran.
 */
export function ubicarMinutos(libres: [number, number][], minutos: number): TramoHora[] {
  const total = libres.reduce((s, [a, b]) => s + (b - a) / MIN, 0)
  if (minutos <= 0 || minutos > total) return []
  const tramos: TramoHora[] = []
  let falta = minutos
  for (const [a, b] of [...libres].reverse()) {
    if (falta <= 0) break
    const usa = Math.min(falta, (b - a) / MIN)
    tramos.unshift({ inicio: aHoraPlanta(b - usa * MIN), fin: aHoraPlanta(b) })
    falta -= usa
  }
  return tramos
}
