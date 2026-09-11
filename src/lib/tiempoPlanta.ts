/**
 * Hora de la PLANTA: America/Caracas, UTC−4 fijo (Venezuela no usa
 * horario de verano desde 2016).
 *
 * Regla: toda fecha/hora que se muestre, se compare o se use para
 * agrupar pasa por acá. NO se usa el reloj local del navegador (que
 * puede estar en otra zona) ni `now()` de Postgres crudo (que corre en
 * UTC). Ver zona_horaria_ccs / rework_tiempos_turno.
 *
 * `turnos.fecha` / `hora_inicio` / `hora_fin` los calcula el servidor
 * (migración 20261032, `now() at time zone 'America/Caracas'`). Los
 * timestamps de mutación (`activada_en`, `creado_en`, …) llegan de
 * Postgres en ISO con offset — instantes absolutos — y se MUESTRAN en
 * hora de planta.
 */
export const ZONA_PLANTA = "America/Caracas"
const OFFSET_PLANTA = "-04:00"

const FMT_FECHA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_PLANTA }) // YYYY-MM-DD
const FMT_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_PLANTA,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
}) // HH:MM:SS
const FMT_HORA_CORTA = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA_PLANTA,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
}) // HH:MM
const FMT_DIA_MES = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_PLANTA, day: "2-digit", month: "2-digit" }) // DD/MM

/** "YYYY-MM-DD" del instante, en hora de planta. */
export function fechaPlanta(d: Date = new Date()): string {
  return FMT_FECHA.format(d)
}

/** "HH:MM:SS" del instante, en hora de planta. */
export function horaPlanta(d: Date = new Date()): string {
  return FMT_HORA.format(d)
}

/** Hora del día (0–23) del instante, en hora de planta. */
export function horaDelDiaPlanta(d: Date = new Date()): number {
  return Number(FMT_HORA_CORTA.format(d).slice(0, 2))
}

/**
 * Date real a partir de un valor que puede ser:
 *  - "HH:MM" o "HH:MM:SS" (hora pelada, ej. `turno.horaInicio`) → se
 *    ancla a `fechaAncla` ("YYYY-MM-DD") interpretada en hora de planta.
 *  - un datetime completo: si trae zona (Postgres manda +00:00), tal
 *    cual; si viene SIN zona, se interpreta en hora de planta, NO en la
 *    del navegador.
 */
export function instantePlanta(valor: string, fechaAncla: string): Date {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(valor)) {
    const hora = valor.length === 5 ? `${valor}:00` : valor
    return new Date(`${fechaAncla}T${hora}${OFFSET_PLANTA}`)
  }
  if (/[zZ]$|[+-]\d{2}(:?\d{2})?$/.test(valor)) return new Date(valor)
  return new Date(`${valor}${OFFSET_PLANTA}`)
}

/** "HH:MM" en hora de planta. Acepta ISO o hora pelada (anclada a `fechaAncla`). */
export function horaCortaPlanta(valor: string, fechaAncla: string): string {
  return FMT_HORA_CORTA.format(instantePlanta(valor, fechaAncla))
}

/** "DD/MM" del instante, en hora de planta. */
export function diaMesPlanta(d: Date): string {
  return FMT_DIA_MES.format(d)
}

/** ¿El instante cae, en hora de planta, en la fecha `fecha` ("YYYY-MM-DD")? */
export function mismaFechaPlanta(d: Date, fecha: string): boolean {
  return fechaPlanta(d) === fecha
}

/** "YYYY-MM-DD" − N días. Aritmética de calendario pura (sin zona). */
export function restarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d) - n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Fecha de la JORNADA de planta (día operativo 7:00 → 7:00) del
 * instante dado. Antes de las 7:00 (hora de planta) pertenece a la
 * jornada del día anterior.
 */
export function fechaJornadaPlanta(d: Date = new Date()): string {
  const fecha = fechaPlanta(d)
  return horaDelDiaPlanta(d) >= 7 ? fecha : restarDias(fecha, 1)
}
