import type { CSSProperties } from "react"
import type { VelocidadLive } from "@/lib/catalogosLive"
import { numeroDeLinea } from "@/lib/programacionSemanal"

/** Cajas: "5.000". */
export const fmt = (n: number) => Math.round(n).toLocaleString("es-CO")

/** El color de cada línea, el mismo de Indicadores (--ind-l1…). */
export const colorLinea = (codigo: string | null) => ({ "--lc": codigo ? `var(--ind-l${numeroDeLinea(codigo)})` : "var(--border)" }) as CSSProperties

/** Las líneas que llenan una presentación (velocidades activas), en orden. */
export function lineasQueLlenan(ml: number, velocidades: VelocidadLive[]): string[] {
  return [...new Set(velocidades.filter((v) => v.activo && v.presentacion === String(ml)).map((v) => v.linea))].sort()
}

/** "Lun 12". */
export const diaCorto = (nombre: string, fecha: string) => `${nombre.slice(0, 3)} ${Number(fecha.slice(8, 10))}`
