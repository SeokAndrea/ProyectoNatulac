import { useEffect, useRef, useState } from "react"
import { CintaPixel } from "@/components/pixel/CintaPixel"
import { interpretarSabor } from "@/components/pixel/armarJugo"
import { ANCHO } from "@/components/pixel/lienzo"
import { cn } from "@/lib/utils"

/**
 * Cinta pixel art según el estado de la línea — la misma en la tabla del
 * Panel de Producción y en las tarjetas de Líneas:
 *   corriendo → envases avanzando (con tacho y baliza si `alertaMerma`)
 *   parada    → cinta quieta con un técnico y los envases de la corrida
 *   detenida  → cinta quieta con un técnico, sin envases (no hay corrida)
 *   cip       → la cinta lavándose
 * Si el sabor no tiene dibujo, la cinta va sin envases.
 *
 * RECORTADA: se dibuja a `escala` y el contenedor muestra solo un tramo,
 * del ancho que tenga. En producción y CIP se ve el final de la cinta
 * (tacho x 124–146 y baliza x 190); en pausa o detenida, centrada en el
 * técnico (caja x 70 → letrero x 161). Ver escenasCinta.ts.
 */
export type EstadoCinta = "corriendo" | "parada" | "detenida" | "cip"

/** Centro de la escena de reparación (entre la caja de herramientas y el letrero). */
const CENTRO_REPARACION = 115

export function CintaEstadoLinea({
  estado,
  saborNombre,
  presentacion,
  alertaMerma = false,
  escala = 1.4,
  className,
}: {
  estado: EstadoCinta
  saborNombre: string | null | undefined
  /** Código de presentación ("1000", "250"...). Sin dato, el envase de 1 litro. */
  presentacion: string | null | undefined
  alertaMerma?: boolean
  /** Pixeles de pantalla por pixel del dibujo. */
  escala?: number
  /** Para fijar el ancho del recorte (ej. "w-36"). */
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [anchoVisible, setAnchoVisible] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observador = new ResizeObserver(([e]) => setAnchoVisible(e.contentRect.width))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const jugo = interpretarSabor(saborNombre)
  const reparacion = estado === "parada" || estado === "detenida"
  // Tramo visible, en pixeles del dibujo
  const visible = anchoVisible === null ? ANCHO : Math.min(ANCHO, anchoVisible / escala)
  const inicio = reparacion
    ? Math.min(Math.max(CENTRO_REPARACION - visible / 2, 0), ANCHO - visible)
    : ANCHO - visible

  return (
    <div ref={ref} className={cn("overflow-hidden rounded-md", className)}>
      <div style={{ width: ANCHO * escala, marginLeft: -inicio * escala }}>
        <CintaPixel
          presentacion={presentacion ?? "1000"}
          familia={jugo?.familia ?? "clasico"}
          sabor={jugo?.sabor ?? "manzana"}
          conEnvases={jugo != null && estado !== "detenida"}
          modo={estado === "cip" ? "cip" : reparacion ? "reparacion" : "produccion"}
          alertaMerma={estado === "corriendo" && alertaMerma}
          conPatas={false}
          separacion={18}
        />
      </div>
    </div>
  )
}
