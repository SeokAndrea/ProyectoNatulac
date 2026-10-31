/** Sin tildes ni mayúsculas: "Cámara" → "camara". */
export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** 'Cambio de Lote' → 'CAMBIO_DE_LOTE' (códigos internos que no se muestran). */
export const codigoDesdeNombre = (nombre: string) =>
  sinTildes(nombre)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

/**
 * ¿El texto tiene todas las palabras buscadas, en cualquier orden y sin
 * importar tildes ni mayúsculas? ("presion camara" encuentra "Baja presión ·
 * Cámara aséptica"). Búsqueda vacía: sí.
 */
export function tienePalabras(texto: string, busqueda: string): boolean {
  const palabras = sinTildes(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const heno = sinTildes(texto)
  return palabras.every((p) => heno.includes(p))
}
