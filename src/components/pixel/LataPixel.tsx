// ============================================================
//  LataPixel.tsx  —  LA LATA DE 340 ml DE VACÍO, EN PIXEL ART
// ============================================================
//
//  Vacío envasa en latas. Esta lata marca un tanque de Aséptico que
//  guarda producto de Vacío (TanqueVisual, Preparación en Modo Vacío).
//  Mismo sistema de letras que presentaciones.ts, con colores propios
//  (cuerpo azul Natulac, logo rojo con letras blancas). La fruta sale
//  de sabores.ts, igual que en los envases de la cinta.
//
//  Uso:
//    <LataPixel saborNombre="Coctel" zoom={2} />
// ============================================================

import { useEffect, useRef } from "react"
import { pintarLetras } from "./lienzo"
import { interpretarSabor } from "./armarJugo"
import { SABORES } from "./sabores"

//  Z / z = metal (tapa y fondo)   K = contorno   A / a = azul y costado
//  Y = sol   W = óvalo del logo   R = letras   X = "Néctar de"
//  N = nombre del sabor           P = fondo detrás de la fruta
const LATA = [
  "...ZZZZZZ...",
  ".zZZZzzZZZz.",
  "KzzzzzzzzzzK",
  "KAAAAAAAAAaK",
  "KAAAYYYYAAaK",
  "KAWWWWWWWAaK",
  "KWRRRRRRRWaK",
  "KAWWWWWWWAaK",
  "KAAXXAXXXAaK",
  "KANNNNNNNAaK",
  "KAAAAAAAAAaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KPPPPPPPPPaK",
  "KAAAAAAAAAaK",
  "KzzzzzzzzzzK",
  ".zZZZZZZZZz.",
]

/** Dónde se pega la fruta de 8 x 8. */
const FRUTA = { x: 2, y: 11 }

const COLORES: Record<string, string> = {
  Z: "#e4e7eb",
  z: "#9aa1ab",
  K: "#141a45",
  A: "#2d3b8f",
  a: "#1f2a6b",
  Y: "#f2b632",
  W: "#d8202a",
  R: "#ffffff",
  X: "#ffffff",
  N: "#f2b632",
  P: "#4a5cc0",
}

export const ANCHO_LATA = LATA[0].length
export const ALTO_LATA = LATA.length

export function LataPixel({ saborNombre, zoom = 1, className }: { saborNombre: string | null; zoom?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const lienzo = canvasRef.current
    const ctx = lienzo?.getContext("2d")
    if (!lienzo || !ctx) return
    ctx.clearRect(0, 0, ANCHO_LATA, ALTO_LATA)
    pintarLetras(ctx, LATA, COLORES, 0, 0)
    // Sabor que no se reconoce: la lata va sin fruta (solo el fondo azul).
    const fruta = SABORES[interpretarSabor(saborNombre)?.sabor ?? ""]
    if (fruta) pintarLetras(ctx, fruta.dibujo, { ...COLORES, ...fruta.colores }, FRUTA.x, FRUTA.y)
  }, [saborNombre])

  return (
    <canvas
      ref={canvasRef}
      width={ANCHO_LATA}
      height={ALTO_LATA}
      aria-hidden="true"
      className={className}
      style={{ width: ANCHO_LATA * zoom, height: ALTO_LATA * zoom, imageRendering: "pixelated" }}
    />
  )
}
