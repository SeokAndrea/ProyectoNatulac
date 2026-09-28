// ============================================================
//  PaletaPixel.tsx  —  PALETA ARMÁNDOSE CAJA POR CAJA
// ============================================================
//
//  Muestra una paleta de madera con las cajas apiladas por camadas.
//  La última caja que llegó cae desde arriba. Cuando la paleta se
//  completa, se "envuelve" con film (brillitos).
//
//  Uso:
//    <PaletaPixel cajas={51} cajasXCamada={17} cantCamada={5} />
//
//  Los números salen de la tabla de presentaciones de la app
//  (cajas_x_camada y cant_camada), así que cada presentación arma
//  su paleta con su propia forma.
//
//  Como de costado no se ven las 17 cajas de una camada, se dibujan
//  6 "columnas" por camada que se van llenando en proporción.
// ============================================================

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { pintarLetras, rectangulo } from "./lienzo"

const COLUMNAS = 6 // cajas que se ven por camada (de costado)
const CAJA_ANCHO = 9
const CAJA_ALTO = 6
const MADERA_ALTO = 5
const MARGEN_ARRIBA = 14 // espacio para que la caja nueva caiga

// Caja de cartón (9 x 6)
const CAJA = [
  "KKKKKKKKK",
  "KccCCCccK",
  "KcccCcccK",
  "KcnncccbK",
  "KcnncccbK",
  "KKKKKKKKK",
]
const COLORES_CAJA: Record<string, string> = {
  K: "#7a5530", // borde
  c: "#c8965a", // cartón
  C: "#e8c890", // cinta adhesiva
  n: "#2d3b8f", // logo azul
  b: "#a87a45", // sombra
}

export function PaletaPixel({
  cajas,
  cajasXCamada,
  cantCamada,
  className,
}: {
  /** Cajas que ya están en la paleta. */
  cajas: number
  cajasXCamada: number
  cantCamada: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ancho = COLUMNAS * CAJA_ANCHO + 6
  const alto = MARGEN_ARRIBA + cantCamada * CAJA_ALTO + MADERA_ALTO

  // Cuántas "cajas dibujadas" hay (proporcional a las cajas reales)
  const total = cajasXCamada * cantCamada
  const completa = cajas >= total
  const dibujadas = Math.min(COLUMNAS * cantCamada, Math.round((Math.min(cajas, total) / cajasXCamada) * COLUMNAS))

  // Para animar la caída solo cuando llega una caja nueva
  const anterior = useRef(dibujadas)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return

    const llegoUnaNueva = dibujadas > anterior.current
    anterior.current = dibujadas
    const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let cuadro = 0
    let id = 0

    function dibujar() {
      if (!ctx) return
      ctx.clearRect(0, 0, ancho, alto)

      // Paleta de madera
      const piso = alto - MADERA_ALTO
      rectangulo(ctx, 1, piso, ancho - 2, 2, "#b07a3c")
      rectangulo(ctx, 1, piso, ancho - 2, 1, "#d19a58")
      for (const x of [2, Math.floor(ancho / 2) - 2, ancho - 7]) rectangulo(ctx, x, piso + 2, 5, 3, "#8a5a28")

      // Cajas, camada por camada, de abajo hacia arriba
      for (let i = 0; i < dibujadas; i++) {
        const camada = Math.floor(i / COLUMNAS)
        const columna = i % COLUMNAS
        const x = 3 + columna * CAJA_ANCHO
        let y = piso - (camada + 1) * CAJA_ALTO

        // La última caja cae desde arriba (dura ~0,5 s)
        const esLaUltima = i === dibujadas - 1
        if (esLaUltima && llegoUnaNueva && !sinMovimiento) {
          const avance = Math.min(1, cuadro / 30)
          y = Math.round(y - (1 - avance) * (y + CAJA_ALTO))
        }
        pintarLetras(ctx, CAJA, COLORES_CAJA, x, y)
      }

      // Paleta completa: film brillando por encima
      if (completa) {
        const arribaCajas = piso - cantCamada * CAJA_ALTO
        ctx.fillStyle = "rgba(200, 230, 255, 0.28)"
        ctx.fillRect(2, arribaCajas, ancho - 4, piso - arribaCajas)
        const brillo = (cuadro * 0.6) % (ancho + 20)
        for (let y = arribaCajas; y < piso; y++) {
          ctx.fillStyle = "rgba(255,255,255,0.55)"
          ctx.fillRect(Math.floor(brillo - (y - arribaCajas) * 0.5) - 10, y, 2, 1)
        }
      }
    }

    function animar() {
      dibujar()
      cuadro++
      const sigueCayendo = llegoUnaNueva && cuadro <= 30
      if (sigueCayendo || completa) id = requestAnimationFrame(animar)
    }

    if (sinMovimiento) dibujar()
    else animar()
    return () => cancelAnimationFrame(id)
  }, [dibujadas, completa, ancho, alto, cantCamada])

  return (
    <canvas
      ref={canvasRef}
      width={ancho}
      height={alto}
      aria-hidden="true"
      className={cn("block h-auto w-full", className)}
      style={{ imageRendering: "pixelated" }}
    />
  )
}
