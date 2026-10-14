import { restarDias } from "@/lib/tiempoPlanta"

/*
 * TURNO COMPLETO (dueña, 2026-10-14): una parada de Línea No Programada /
 * Externa (LNPE) puede cubrir el turno entero, por ejemplo los días en que
 * arreglaron el piso y ninguna línea estuvo planificada. Se registra con el
 * horario del turno: T1 07:00–15:00, T2 15:00–22:30, T3 22:30–07:00 (el mismo
 * de turnoTipoActual). Solo turnos que ya terminaron: el servidor no acepta
 * un fin en el futuro.
 */

export type TipoTurno = "TURNO_1" | "TURNO_2" | "TURNO_3"

export const TURNOS_COMPLETOS: { tipo: TipoTurno; corto: string; desde: string; hasta: string }[] = [
  { tipo: "TURNO_1", corto: "T1", desde: "07:00", hasta: "15:00" },
  { tipo: "TURNO_2", corto: "T2", desde: "15:00", hasta: "22:30" },
  { tipo: "TURNO_3", corto: "T3", desde: "22:30", hasta: "07:00" },
]

/** Más días que esto de una vez, no: evita cargar un mes por error. */
export const MAX_DIAS_TURNO_COMPLETO = 31

/** Las de la familia LNPE (Línea No Programada / Externa) se pueden cargar por turno completo. */
export const esLineaNoProgramada = (t: { prefijoPlanilla: string } | null | undefined) => t?.prefijoPlanilla === "LNPE"

export interface TurnoACargar {
  /** Fecha operativa 'YYYY-MM-DD' (el T3 termina al día siguiente). */
  fecha: string
  tipo: TipoTurno
  corto: string
  /** 'YYYY-MM-DDTHH:MM', hora de planta. */
  inicio: string
  fin: string
  /** Si ya terminó (los que no, no se pueden cargar todavía). */
  termino: boolean
}

/** Días de `desde` a `hasta` inclusive ('YYYY-MM-DD'). Vacío si están al revés. */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = []
  for (let d = hasta; d >= desde && dias.length <= MAX_DIAS_TURNO_COMPLETO; d = restarDias(d, 1)) dias.unshift(d)
  return dias
}

/** Los turnos elegidos de cada día, en orden. `ahora`: 'YYYY-MM-DDTHH:MM' de planta. */
export function turnosACargar(desde: string, hasta: string, tipos: TipoTurno[], ahora: string): TurnoACargar[] {
  return diasEntre(desde, hasta).flatMap((fecha) =>
    TURNOS_COMPLETOS.filter((t) => tipos.includes(t.tipo)).map((t) => {
      const fin = `${t.tipo === "TURNO_3" ? restarDias(fecha, -1) : fecha}T${t.hasta}`
      return { fecha, tipo: t.tipo, corto: t.corto, inicio: `${fecha}T${t.desde}`, fin, termino: fin <= ahora }
    }),
  )
}
