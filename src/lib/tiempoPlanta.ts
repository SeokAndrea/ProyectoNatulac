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
 *
 * DÍA NORMAL vs. DÍA DE TURNO — elegir siempre a propósito:
 *  - Día de turno (jornada 7:00 → 7:00): para agrupar o filtrar "por
 *    día" (Hoy, reportes, registros). La madrugada es del turno 3 de la
 *    fecha anterior. Front: `fechaJornadaPlanta()` / `franjaDeHora()`.
 *    SQL: `turnos.fecha` (vía turno_id) o `turno_de_hora(ts)`.
 *  - Día normal (calendario): solo para mostrar la fecha/hora real de un
 *    instante o para inputs de fecha-hora. Front: `fechaPlanta()`.
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

/** Turno que corresponde a esta hora de planta (T1 7–15, T2 15–22:30, T3 22:30–7). Mismo criterio que turno_de_hora() en el servidor. */
export function turnoTipoActual(d: Date = new Date()): "TURNO_1" | "TURNO_2" | "TURNO_3" {
  const [h, m] = horaPlanta(d).split(":").map(Number)
  const ahora = h * 60 + m
  if (ahora >= 7 * 60 && ahora < 15 * 60) return "TURNO_1"
  if (ahora >= 15 * 60 && ahora < 22 * 60 + 30) return "TURNO_2"
  return "TURNO_3"
}

/** Turno a iniciar a esta hora: el de ahora, o el siguiente si falta 1 h o menos para que empiece (el supervisor que llega antes). */
export function turnoParaIniciar(d: Date = new Date()): "TURNO_1" | "TURNO_2" | "TURNO_3" {
  return turnoTipoActual(new Date(d.getTime() + 60 * 60 * 1000))
}

/** Turno + fecha operativa de una hora de planta (el T3 de la madrugada es del día anterior). Mismo criterio que turno_de_hora() en el servidor. */
export function franjaDeHora(d: Date = new Date()): { tipo: "TURNO_1" | "TURNO_2" | "TURNO_3"; fecha: string } {
  const tipo = turnoTipoActual(d)
  const fecha = fechaPlanta(d)
  return { tipo, fecha: tipo === "TURNO_3" && horaDelDiaPlanta(d) < 7 ? restarDias(fecha, 1) : fecha }
}

/** Turno + fecha a comenzar ahora: el de ahora, o el siguiente si falta 1 h o menos (ver turnoParaIniciar). */
export function franjaParaIniciar(d: Date = new Date()): { tipo: "TURNO_1" | "TURNO_2" | "TURNO_3"; fecha: string } {
  return franjaDeHora(new Date(d.getTime() + 60 * 60 * 1000))
}

/**
 * Turno + fecha dentro de 4 h: si es otro que el de ahora, el que llega
 * temprano puede comenzarlo ya, o tomar el relevo y el respaldo se lo abre a
 * su nombre al cambio (misma ventana que relevo_de_respaldo_en, 20261108).
 */
export function franjaSiguienteTemprano(d: Date = new Date()): { tipo: "TURNO_1" | "TURNO_2" | "TURNO_3"; fecha: string } {
  return franjaDeHora(new Date(d.getTime() + 4 * 60 * 60 * 1000))
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
  // Postgres manda `time`/`hora pelada` con microsegundos ("15:20:54.528313"),
  // no solo "HH:MM"/"HH:MM:SS" — sin el `(\.\d+)?` esto no matcheaba
  // NINGÚN turno.horaInicio real (la fixture de demo sí es limpia,
  // "07:00:00", por eso /auditoria-demo nunca lo agarró) y caía al
  // último `return`, que arma un string sin fecha → Invalid Date →
  // truena en el primer .format() de toda la Auditoría, página en
  // blanco (sin Error Boundary en la app). Bug real, 2026-09-11.
  if (/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(valor)) {
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
