import { tieneDatos } from "@/lib/indicadores/calculos"
import type { DatosMes, ModoMes } from "@/lib/indicadores/tipos"
import { SECCIONES, type Seccion } from "@/components/indicadores/secciones"

export const TODAS: Seccion[] = SECCIONES.map((s) => s.valor)

/**
 * Las pantallas que tienen algo que mostrar en el mes elegido (dueña,
 * 2026-10-15: lo que no tiene datos no se ve, ni dice «Sin datos de…»).
 * `datos`: lo calculado o cargado del mes (null = todavía calculando: todas).
 * `aMano`: ausentismo e incidencias, que se cargan siempre a mano.
 */
export function seccionesConDatos(datos: DatosMes | null, modo: ModoMes, aMano: DatosMes | null): Seccion[] {
  if (!datos) return TODAS
  const linea = (l: string) =>
    datos.eficiencia[l] != null || Object.entries(datos.presentaciones).some(([clave, p]) => clave.startsWith(`${l}|`) && tieneDatos(p, modo))
  const tiene: Record<Seccion, boolean> = {
    "1": linea("1"),
    "2": linea("2"),
    "3": linea("3"),
    semi: Object.values(datos.semielaborado).some((v) => v != null),
    aus: !!aMano?.ausentismo,
    inc: (aMano?.incidencias?.length ?? 0) > 0,
  }
  return TODAS.filter((s) => tiene[s])
}
