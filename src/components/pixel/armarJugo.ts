// ============================================================
//  armarJugo.ts  —  JUNTA LAS 3 PIEZAS Y DIBUJA UN ENVASE
// ============================================================
//
//  Un envase pixel art se arma con:
//    presentaciones.ts → la FORMA   ("1000", "500", "330", "250", "200")
//    familias.ts       → los COLORES (clasico, jucosa, selecto, premium, te)
//    sabores.ts        → la FRUTA   (manzana, pera, durazno...)
//
//  Aquí también está "interpretarSabor", que convierte el nombre del
//  sabor tal como lo guarda la app ("Pera (Jucosa)", "Manzana 35%",
//  "Té de Durazno"...) en la familia y el sabor del dibujo.
// ============================================================

import { PRESENTACIONES } from "./presentaciones"
import { FAMILIAS, COLORES_COMUNES } from "./familias"
import { SABORES } from "./sabores"

export interface JugoPixel {
  familia: string
  sabor: string
}

// ---------- Qué fruta es, según palabras del nombre ----------
//  El orden importa: "Agua de Coco" tiene que encontrar "coco" y no otra cosa.
const FRUTA_POR_PALABRA: Array<[RegExp, string]> = [
  [/coco/i, "coco"],
  [/c[oó]ctel/i, "coctel"],
  [/manzana/i, "manzana"],
  [/pera/i, "pera"],
  [/durazno/i, "durazno"],
  [/naranja/i, "naranja"],
  [/mango/i, "mango"],
  [/lim[oó]n/i, "limon"],
]

/**
 * "Pera (Jucosa)"      → { familia: "jucosa",  sabor: "pera" }
 * "Manzana 35%"        → { familia: "selecto", sabor: "manzana" }
 * "Té de Durazno"      → { familia: "te",      sabor: "durazno" }
 * "Agua de Coco"       → { familia: "premium", sabor: "coco" }
 * "Manzana"            → { familia: "clasico", sabor: "manzana" }
 * Si no reconoce la fruta, devuelve null (y la cinta usa cajitas de color).
 */
export function interpretarSabor(saborNombre: string | null | undefined): JugoPixel | null {
  if (!saborNombre) return null
  const nombre = saborNombre.trim()

  const fruta = FRUTA_POR_PALABRA.find(([palabra]) => palabra.test(nombre))
  if (!fruta) return null
  const sabor = fruta[1]

  let familia = "clasico"
  if (/^t[eé]\s+de\b/i.test(nombre)) familia = "te"
  else if (/\(jucosa\)/i.test(nombre)) familia = "jucosa"
  else if (/35\s*%|\(selecto\)/i.test(nombre)) familia = "selecto"
  else if (/\(premium\)|clarificad|100\s*%|agua de coco/i.test(nombre)) familia = "premium"

  return { familia, sabor }
}

// Guardamos los envases ya pintados para no repetir el trabajo
const yaPintados = new Map<string, HTMLCanvasElement>()

/**
 * Devuelve un lienzo pequeño con el envase ya pintado (1 pixel = 1 pixel).
 * Si la familia no tiene esa presentación o ese sabor, usa el primero de
 * su lista y avisa en la consola.
 */
export function armarJugo(presentacion: string, nombreFamilia: string, nombreSabor: string): HTMLCanvasElement {
  // Si la familia está mal escrita, usamos la clásica para que no se rompa
  const familia = FAMILIAS[nombreFamilia] ?? FAMILIAS.clasico

  if (!familia.presentaciones.includes(presentacion)) {
    console.warn(`La familia ${familia.nombre} no tiene la presentación "${presentacion}". Uso "${familia.presentaciones[0]}".`)
    presentacion = familia.presentaciones[0]
  }
  if (!familia.sabores.includes(nombreSabor)) {
    console.warn(`La familia ${familia.nombre} no tiene el sabor "${nombreSabor}". Uso "${familia.sabores[0]}".`)
    nombreSabor = familia.sabores[0]
  }

  const llave = `${presentacion}|${nombreFamilia}|${nombreSabor}`
  const guardado = yaPintados.get(llave)
  if (guardado) return guardado

  const forma = PRESENTACIONES[presentacion]
  const sabor = SABORES[nombreSabor]

  // Juntamos todos los colores en una sola lista
  const colores: Record<string, string> = { ...COLORES_COMUNES, ...familia.colores, ...sabor.colores }

  // Donde la familia dice "acento", ponemos el color del sabor
  for (const letra in colores) {
    if (colores[letra] === "acento") colores[letra] = sabor.acento
  }

  // Creamos un lienzo pequeño del tamaño del envase
  const imagen = document.createElement("canvas")
  imagen.width = forma.dibujo[0].length
  imagen.height = forma.dibujo.length
  const ctx = imagen.getContext("2d")
  if (ctx) {
    // 1) Pintamos el envase
    pintarDibujo(ctx, forma.dibujo, colores, 0, 0)
    // 2) Encima, pintamos la fruta en su lugar
    pintarDibujo(ctx, sabor.dibujo, colores, forma.fruta.x, forma.fruta.y)
  }

  yaPintados.set(llave, imagen)
  return imagen
}

// ---------- Pinta un dibujo de letras en la posición (x, y) ----------
function pintarDibujo(ctx: CanvasRenderingContext2D, dibujo: string[], colores: Record<string, string>, x: number, y: number) {
  dibujo.forEach((fila, numFila) => {
    ;[...fila].forEach((letra, numColumna) => {
      if (letra === ".") return // vacío: no se pinta
      ctx.fillStyle = colores[letra] ?? "#ff00ff" // rosado = letra sin color (¡revisar!)
      ctx.fillRect(x + numColumna, y + numFila, 1, 1)
    })
  })
}
