/*
 * 12x12 (dueña, 2026-10-06): el Turno 2 se parte a las 19:00. El supervisor
 * del día finaliza su T2 (15:00–19:00) con su acta y el de la noche comienza
 * otro T2 (19:00–22:30). Un día 12x12 tiene dos T2; se distinguen por la
 * hora real en que se abrió cada uno.
 */

/** Desde esta hora (planta) en un T2 del día de 12x12 se ofrece comenzar el T2 de la noche. */
export const HORA_OFRECER_T2_NOCHE = 18

/**
 * Corte para saber de qué tramo es un T2 ya abierto: el del día se abre ~15:00
 * (o ~15:30 por el respaldo) y el de la noche ~18:00–19:30.
 */
const CORTE_TRAMO = "17:00"

export interface TramoTurno {
  desde: string
  hasta: string
  minutos: number
}

const TRAMO_DIA: TramoTurno = { desde: "15:00", hasta: "19:00", minutos: 240 }
const TRAMO_NOCHE: TramoTurno = { desde: "19:00", hasta: "22:30", minutos: 210 }

/** Tramo del T2 en 12x12 (día o noche), o null si el turno no es un T2 de 12x12. */
export function tramoT2(esquema: string | null | undefined, turnoTipo: string | null | undefined, horaInicio: string | null | undefined): TramoTurno | null {
  if (esquema !== "12x12" || turnoTipo !== "TURNO_2" || !horaInicio) return null
  return horaInicio.slice(0, 5) < CORTE_TRAMO ? TRAMO_DIA : TRAMO_NOCHE
}

/** T2 del día de 12x12: a partir de las 18:00 se ofrece cerrarlo y comenzar el de la noche. */
export function esT2DelDia(esquema: string | null | undefined, turnoTipo: string | null | undefined, horaInicio: string | null | undefined): boolean {
  return tramoT2(esquema, turnoTipo, horaInicio) === TRAMO_DIA
}
