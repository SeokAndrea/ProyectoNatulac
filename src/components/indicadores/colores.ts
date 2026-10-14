import type { CSSProperties } from "react"

/*
 * Colores de Indicadores (tokens --ind-* al final de src/index.css). Cada
 * bloque recibe tres variables y los componentes solo usan esas:
 *   --c        relleno (barras, anillos, bordes)
 *   --c-texto  texto en ese color, legible
 *   --c-cab    letra sobre la cabecera rellena
 */

const vars = (base: string, relleno = `var(${base})`, texto = `var(${base}-texto)`): CSSProperties =>
  ({ "--c": relleno, "--c-texto": texto, "--c-cab": `var(${base}-cab)` }) as CSSProperties

/** Color de la línea ("1", "2", "3"). */
export const colorLinea = (linea: string) => vars(`--ind-l${linea}`)

/** Cada presentación de la línea, un tono distinto: la primera el color de la línea, las otras más oscuras (más claras en modo oscuro). */
const MEZCLA = [100, 68, 48]
export function colorPresentacion(linea: string, indice: number): CSSProperties {
  const p = MEZCLA[Math.min(indice, MEZCLA.length - 1)]
  const tono = (v: string) => (p === 100 ? `var(${v})` : `color-mix(in srgb, var(${v}) ${p}%, var(--ind-mezcla))`)
  return vars(`--ind-l${linea}`, tono(`--ind-l${linea}`), tono(`--ind-l${linea}-texto`))
}

const CLAVE_FAMILIA: Record<string, string> = { clasicos: "clasicos", selecto: "selecto", jucosa: "jucosa", premium: "premium", especiales: "especiales" }
const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** Color del envase de la familia (familias_producto). Una familia nueva usa el de Especiales. */
export const colorFamilia = (familia: string) => vars(`--ind-${CLAVE_FAMILIA[sinTildes(familia)] ?? "especiales"}`)

/** Nombres para la pantalla: "Clasicos" → "Néctar clásico", como en el informe; "Especiales" → "Té" (dueña, 2026-10-14). */
const NOMBRES_FAMILIA: Record<string, string> = { clasicos: "Néctar clásico", especiales: "Té" }
export const nombreFamilia = (familia: string) => NOMBRES_FAMILIA[sinTildes(familia)] ?? familia
