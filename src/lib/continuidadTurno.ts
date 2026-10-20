/**
 * Turno que el sistema le abrió al supervisor como continuación del suyo
 * (12x12 a las 22:30, relevo temprano): el anterior ya quedó cerrado y el
 * supervisor sigue a cargo. El 06/10, el 07/10 y el 19/10 lo finalizaron
 * creyendo que seguían en el T2 (el Hub pintaba Finalizar Turno de rojo), y
 * el 19/10 se cargó dos veces el mismo PT. Mientras dura, Finalizar Turno
 * queda con candado y, si al anterior le falta el PT de una línea entregada,
 * Producto Terminado abre en él (su gracia, ver src/lib/ptTurnoAnterior.ts).
 * finalizar_turno() tampoco lo deja cerrar (migración 20261111190000).
 */
import type { SesionTurno } from "@/lib/sesionTurno"
import { horaCortaPlanta, instantePlanta } from "@/lib/tiempoPlanta"

export const HORAS_CONTINUIDAD = 2

export interface ContinuidadTurno {
  codigo: string
  /** "HH:MM" desde la que se puede finalizar. */
  finalizableDesde: string
}

type DatosSesion = Pick<
  SesionTurno,
  "estado" | "codigo" | "fecha" | "horaInicio" | "aperturaAutomatica" | "sinResponsable" | "supervisorUsuario" | "responsables"
>

export function continuidadReciente(s: DatosSesion, usuario: string | null, ahora: Date = new Date()): ContinuidadTurno | null {
  if (s.estado !== "ABIERTO" || !s.aperturaAutomatica || s.sinResponsable) return null
  if (!usuario || s.supervisorUsuario !== usuario.toLowerCase()) return null
  // Sin responsable se ASUME; la continuidad lo deja a su nombre como INICIO.
  if (s.responsables[0]?.motivo !== "INICIO") return null
  if (!s.codigo || !s.fecha || !s.horaInicio) return null
  const fin = instantePlanta(s.horaInicio, s.fecha).getTime() + HORAS_CONTINUIDAD * 3_600_000
  if (ahora.getTime() >= fin) return null
  return { codigo: s.codigo, finalizableDesde: horaCortaPlanta(new Date(fin).toISOString(), s.fecha) }
}
