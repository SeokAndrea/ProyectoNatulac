// ============================================================
//  escenasCinta.ts  —  LO QUE SE DIBUJA ENCIMA DE LA CINTA
// ============================================================
//
//  CintaPixel.tsx dibuja la cinta y los envases. Este archivo agrega
//  las "escenas" especiales:
//    - CIP: tubo con rociadores, gotas de agua y espuma en la cinta.
//    - Reparación: un técnico con llave, chispas, cono y caja de herramientas.
//    - Merma: tacho de descarte y baliza roja parpadeando.
//
//  "cuadro" es un contador que sube en cada cuadro de la animación
//  (unos 60 por segundo). Se usa para que las cosas parpadeen o se muevan.
// ============================================================

import { ALTURA_CINTA, ANCHO, METAL, METAL_CLARO, METAL_MUY_OSCURO, METAL_OSCURO, pintarLetras, rectangulo } from "./lienzo"

export type ModoCinta = "produccion" | "cip" | "reparacion"

// ============================================================
//  CIP (limpieza)
// ============================================================
const AGUA = "#6fb8ff"
const AGUA_CLARA = "#bfe0ff"
const ESPUMA = "#f4f9ff"

export function dibujarCIP(ctx: CanvasRenderingContext2D, cuadro: number, avance: number) {
  // Tubo de rociadores arriba de la cinta
  rectangulo(ctx, 0, 5, ANCHO, 2, METAL)
  rectangulo(ctx, 0, 5, ANCHO, 1, METAL_CLARO)
  rectangulo(ctx, 0, 7, ANCHO, 1, METAL_OSCURO)

  // Boquillas cada 16 pixeles, y de cada una caen gotas
  for (let n = 0, x = 8; x < ANCHO; n++, x += 16) {
    rectangulo(ctx, x, 8, 2, 1, METAL_MUY_OSCURO) // boquilla
    for (let k = 0; k < 3; k++) {
      // Cada gota baja desde la boquilla hasta la cinta y vuelve a empezar
      const y = 9 + ((cuadro * 0.7 + n * 7 + k * 8) % 22)
      const lado = (k - 1) * 2 // unas un poco a la izquierda, otras a la derecha
      rectangulo(ctx, x + lado, Math.floor(y), 1, 2, k === 1 ? AGUA : AGUA_CLARA)
    }
  }

  // Espuma sobre la cinta, que avanza con ella
  for (let x = 0; x < ANCHO + 8; x += 7) {
    const px = Math.floor((x + avance) % (ANCHO + 8)) - 4
    const alto = 1 + ((x / 7) % 3) // burbujas de distinto tamaño
    rectangulo(ctx, px, ALTURA_CINTA - alto, 3, alto, ESPUMA)
    rectangulo(ctx, px + 1, ALTURA_CINTA - alto - 1, 1, 1, ESPUMA)
  }
  // Brillo de agua sobre la superficie de la cinta
  for (let x = 0; x < ANCHO; x += 5) {
    if ((x + cuadro) % 20 < 10) rectangulo(ctx, x, ALTURA_CINTA, 2, 1, AGUA_CLARA)
  }
}

// ============================================================
//  REPARACIÓN (línea parada)
// ============================================================
// Técnico: casco amarillo, chaleco naranja, overol azul
const TECNICO = [
  "....YYYY....",
  "...YYYYYY...",
  "..YYYYYYYY..",
  "..hhhhhhhh..",
  "...SSSSSS...",
  "...SkSSkS...",
  "...SSSSSS...",
  "....SSSS....",
  "..OOOOOOOO..",
  ".OOBBBBBBOO.",
  ".OOBBBBBBOO.",
  ".SOBBBBBBO..",
  ".S.BBBBBB...",
  "...BBBBBB...",
  "...GGGGGG...",
  "...BBBBBB...",
  "...BB..BB...",
  "...BB..BB...",
  "...BB..BB...",
  "...BB..BB...",
  "..KKK..KKK..",
  "..KKK..KKK..",
]
const COLORES_TECNICO: Record<string, string> = {
  Y: "#f5c518", // casco
  h: "#c99a0a", // visera del casco
  S: "#e0a878", // piel
  k: "#2b1b10", // ojos
  O: "#f07f1a", // chaleco
  B: "#2f5fa8", // overol
  G: "#d9dde2", // cinta reflectiva
  K: "#2b2b2b", // botas
}

// Cono de seguridad
const CONO = [
  "...o...",
  "...o...",
  "..oWo..",
  "..oWo..",
  ".ooooo.",
  ".oWWWo.",
  "ooooooo",
  "KKKKKKK",
]
const COLORES_CONO: Record<string, string> = { o: "#f26a1b", W: "#ffffff", K: "#3a3a3a" }

// Caja de herramientas
const CAJA_HERRAMIENTAS = [
  "..KKKK..",
  "..K..K..",
  "RRRRRRRR",
  "RrrrrrrR",
  "RRRRRRRR",
  "RRRRRRRR",
]
const COLORES_CAJA: Record<string, string> = { K: "#3a3a3a", R: "#d8202a", r: "#9e1219" }

export function dibujarReparacion(ctx: CanvasRenderingContext2D, cuadro: number, alto: number) {
  const piso = alto // el técnico, el cono y la caja se paran en el piso

  // Tapa de la máquina abierta (hueco oscuro en la estructura)
  rectangulo(ctx, 98, ALTURA_CINTA + 4, 12, 4, "#2a2e33")
  // La tapa quitada, apoyada en el piso
  rectangulo(ctx, 112, piso - 7, 2, 7, METAL)
  rectangulo(ctx, 112, piso - 7, 1, 7, METAL_CLARO)

  // Cono y caja de herramientas
  pintarLetras(ctx, CONO, COLORES_CONO, 44, piso - CONO.length)
  pintarLetras(ctx, CAJA_HERRAMIENTAS, COLORES_CAJA, 70, piso - CAJA_HERRAMIENTAS.length)

  // Técnico
  const tx = 84
  const ty = piso - TECNICO.length
  pintarLetras(ctx, TECNICO, COLORES_TECNICO, tx, ty)

  // Brazo con llave: sube y baja (golpea cada ~0,4 segundos)
  const abajo = Math.floor(cuadro / 12) % 2 === 1
  const manoX = tx + 10
  const manoY = ty + (abajo ? 12 : 9)
  rectangulo(ctx, tx + 9, ty + 10, 2, 2, COLORES_TECNICO.O) // hombro
  rectangulo(ctx, manoX, manoY, 1, 2, COLORES_TECNICO.S) // mano
  // Llave (gris): mango diagonal + cabeza
  const llave = "#9aa3ad"
  rectangulo(ctx, manoX + 1, manoY - 1, 1, 1, llave)
  rectangulo(ctx, manoX + 2, manoY - 2, 1, 1, llave)
  rectangulo(ctx, manoX + 3, manoY - 3, 1, 1, llave)
  rectangulo(ctx, manoX + 3, manoY - 5, 1, 2, llave)
  rectangulo(ctx, manoX + 5, manoY - 5, 1, 2, llave)
  rectangulo(ctx, manoX + 4, manoY - 4, 1, 1, llave)

  // Chispas cuando la llave golpea
  if (abajo) {
    const chispas = ["#ffd23f", "#ff9f1a", "#fff4b0"]
    for (let i = 0; i < 5; i++) {
      // posición "al azar" pero que cambia con el cuadro
      const sx = manoX + 4 + ((cuadro * 7 + i * 13) % 7) - 2
      const sy = manoY - 6 - ((cuadro * 5 + i * 11) % 5)
      rectangulo(ctx, sx, sy, 1, 1, chispas[i % 3])
    }
  }

  // Letrero de advertencia amarillo, parado en el piso
  const lx = 150
  const ly = piso - 17
  rectangulo(ctx, lx + 5, ly + 9, 1, 8, METAL_OSCURO) // palito
  rectangulo(ctx, lx + 3, piso - 1, 5, 1, METAL_MUY_OSCURO) // base
  for (let fila = 0; fila < 9; fila++) {
    const mitad = Math.floor(fila / 1.6)
    rectangulo(ctx, lx + 5 - mitad, ly + fila, mitad * 2 + 1, 1, "#f5c518") // triángulo
  }
  rectangulo(ctx, lx + 5, ly + 3, 1, 3, "#2b2b2b") // signo "!"
  rectangulo(ctx, lx + 5, ly + 7, 1, 1, "#2b2b2b")
}

// ============================================================
//  MERMA (tacho de descarte + baliza)
// ============================================================
/** Dónde está el tacho: los envases defectuosos se caen cuando llegan aquí. */
export const TACHO = { x: 124, ancho: 22 }

export function dibujarTachoFrente(ctx: CanvasRenderingContext2D, alto: number) {
  const arriba = alto - 12
  const { x, ancho } = TACHO
  // Envases aplastados asomándose
  rectangulo(ctx, x + 4, arriba - 2, 5, 2, "#2d3b8f")
  rectangulo(ctx, x + 11, arriba - 1, 6, 1, "#d8202a")
  // Cuerpo del tacho (gris oscuro con franja roja)
  rectangulo(ctx, x, arriba, ancho, 12, "#4a4f57")
  rectangulo(ctx, x, arriba, ancho, 1, "#6b717a") // borde
  rectangulo(ctx, x + 1, arriba + 4, ancho - 2, 2, "#d8202a") // franja roja
  rectangulo(ctx, x + ancho - 2, arriba + 1, 1, 11, "#3a3e45") // sombra
}

export function dibujarBaliza(ctx: CanvasRenderingContext2D, cuadro: number) {
  const x = 190
  // Poste
  rectangulo(ctx, x, 10, 2, ALTURA_CINTA - 10, METAL_OSCURO)
  // Luz: prende y apaga (unas 2 veces por segundo)
  const prendida = Math.floor(cuadro / 15) % 2 === 0
  if (prendida) {
    ctx.fillStyle = "rgba(255, 60, 60, 0.25)" // resplandor
    ctx.fillRect(x - 4, 1, 10, 10)
  }
  rectangulo(ctx, x - 1, 4, 4, 5, prendida ? "#ff3b3b" : "#8a1c1c")
  rectangulo(ctx, x, 5, 1, 1, prendida ? "#ffd0d0" : "#a83232") // brillo
  rectangulo(ctx, x - 2, 9, 6, 1, METAL_MUY_OSCURO) // base
}
