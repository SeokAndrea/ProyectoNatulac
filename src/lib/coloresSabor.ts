/*
 * Color de un sabor — UNA sola implementación, compartida por Panel de
 * Producción, Preparación/Status y Finalizar Turno (antes había tres
 * `colorSabor` distintas y no coincidían).
 *
 * Modelo:
 *   1. HUE por fruta reconocida en el nombre (Manzana → rojo, Pera →
 *      verde, Durazno → amarillo, Naranja → naranja, Limón → lima).
 *      Lo que no se reconoce (Mango, Coctel, …) cicla una paleta fija
 *      por hash del nombre, para que sea estable.
 *   2. La FAMILIA aclara u oscurece esa fruta:
 *        Jucosa   → bastante más clara
 *        Selecto  → un poco más clara
 *        Clásicos / Premium / Especiales / sin familia → color base (el más oscuro)
 *   3. "Té de X" (Té de Durazno, Té de Limón) → versión muy oscura,
 *      "entintada", del color de su fruta — bien distinta del sabor normal.
 *
 * Recibe el nombre para mostrar (`sabor_display`): "Manzana",
 * "Manzana (Selecto)", "Pera (Jucosa)", "Té de Durazno". Devuelve un
 * color CSS (una var o un `color-mix`) — sirve en cualquier `color` /
 * `backgroundColor`.
 */

const HUE_POR_FRUTA: Array<[RegExp, string]> = [
  [/manzana/i, "var(--flavor-red)"],
  [/durazno/i, "var(--flavor-yellow)"],
  [/naranja/i, "var(--flavor-orange)"],
  [/lim[oó]n/i, "var(--flavor-lime)"],
  [/pera/i, "var(--flavor-green)"],
]

/** Sabores sin fruta reconocida ciclan esta paleta según su nombre (estable). */
const CICLO = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]

function hueBase(nombre: string): string {
  const fruta = HUE_POR_FRUTA.find(([re]) => re.test(nombre))
  if (fruta) return fruta[1]
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return CICLO[hash % CICLO.length]
}

/** " (Familia)" al final del nombre para mostrar, o null (Clásicos/Especiales/Premium no lo llevan). */
function familiaDe(nombre: string): string | null {
  const m = nombre.match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : null
}

export function colorSabor(nombre: string | null | undefined): string {
  if (!nombre) return "var(--muted-foreground)"
  const base = hueBase(nombre)

  // "Té de X": entintado, mucho más oscuro que el sabor normal de esa fruta.
  if (/^t[eé]\s+de\b/i.test(nombre.trim())) {
    return `color-mix(in oklab, ${base}, black 55%)`
  }

  switch (familiaDe(nombre)) {
    case "Jucosa":
      return `color-mix(in oklab, ${base}, white 48%)`
    case "Selecto":
      return `color-mix(in oklab, ${base}, white 22%)`
    default:
      return base
  }
}
