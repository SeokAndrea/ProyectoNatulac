// ============================================================
//  lienzo.ts  —  MEDIDAS Y COLORES COMPARTIDOS DE LA CINTA
// ============================================================
//  Lo usan CintaPixel.tsx y escenasCinta.ts, para que la cinta,
//  el CIP, la reparación y el tacho de merma calcen entre sí.
// ============================================================

// Tamaño del "lienzo" en pixeles de pixel art (luego se estira al ancho disponible)
export const ANCHO = 200

// Altura donde está la superficie de la cinta (los envases se paran aquí)
export const ALTURA_CINTA = 32

// Colores de la máquina (metal)
export const METAL_CLARO = "#d9dde2"
export const METAL = "#b8bec6"
export const METAL_OSCURO = "#8a929c"
export const METAL_MUY_OSCURO = "#5f6670"

// ---------- Pinta un rectángulo ----------
export function rectangulo(ctx: CanvasRenderingContext2D, x: number, y: number, ancho: number, alto: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, ancho, alto)
}

// ---------- Pinta un dibujo de letras (cada letra = 1 pixel, "." = vacío) ----------
export function pintarLetras(
  ctx: CanvasRenderingContext2D,
  dibujo: string[],
  colores: Record<string, string>,
  x: number,
  y: number,
) {
  dibujo.forEach((fila, numFila) => {
    ;[...fila].forEach((letra, numColumna) => {
      if (letra === ".") return
      ctx.fillStyle = colores[letra] ?? "#ff00ff"
      ctx.fillRect(x + numColumna, y + numFila, 1, 1)
    })
  })
}
