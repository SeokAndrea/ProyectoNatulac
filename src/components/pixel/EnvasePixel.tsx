// ============================================================
//  EnvasePixel.tsx  —  UN SOLO ENVASE PIXEL ART, QUIETO
// ============================================================
//
//  Muestra un envase suelto (sin cinta). Lo usa LineaVisual.tsx
//  para las cajitas que parpadean en Status y Finalizar Turno.
//
//  Uso:
//    <EnvasePixel presentacion="1000" familia="clasico" sabor="pera" zoom={2} />
//
//  zoom = cuántos pixeles de pantalla mide cada pixel del dibujo.
// ============================================================

import { useEffect, useRef, type CSSProperties } from "react"
import { armarJugo } from "./armarJugo"

export function EnvasePixel({
  presentacion,
  familia,
  sabor,
  zoom = 2,
  className,
  style,
}: {
  presentacion: string
  familia: string
  sabor: string
  zoom?: number
  className?: string
  style?: CSSProperties
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const lienzo = canvasRef.current
    const ctx = lienzo?.getContext("2d")
    if (!lienzo || !ctx) return

    // Copiamos el envase ya pintado a este lienzo
    const jugo = armarJugo(presentacion, familia, sabor)
    lienzo.width = jugo.width
    lienzo.height = jugo.height
    ctx.clearRect(0, 0, jugo.width, jugo.height)
    ctx.drawImage(jugo, 0, 0)
    lienzo.style.width = `${jugo.width * zoom}px`
    lienzo.style.height = `${jugo.height * zoom}px`
  }, [presentacion, familia, sabor, zoom])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
    />
  )
}
