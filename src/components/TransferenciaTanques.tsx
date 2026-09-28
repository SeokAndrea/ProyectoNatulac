import { ArrowRight } from "lucide-react"
import { TanqueVisual } from "@/components/TanqueVisual"
import type { CondicionTanque, ModoTransferencia } from "@/lib/preparacion/tipos"
import { cn } from "@/lib/utils"

/**
 * Animación de una TRANSFERENCIA entre dos tanques: los dos tanques
 * (TanqueVisual) unidos por una tubería por la que corre el líquido
 * hacia el destino — el origen baja y el destino sube a medida que
 * cambian los volúmenes que se le pasan.
 *
 * Si `porManifold` es true, en el medio de la tubería aparece el
 * manifold (caja con válvulas) por donde pasa el líquido.
 * La animación del tubo es la clase CSS "pipe-flow" (src/index.css).
 */

export interface TanqueEnTransferencia {
  numeroTanque: number
  condicion: CondicionTanque
  volumenL: number | null
  color: string
}

export function TransferenciaTanques({
  origen,
  destino,
  litrosTransferidos,
  caudalLMin = null,
  modo = "LIQUIDO",
  porManifold = false,
  activa = true,
  capacidad = 20000,
}: {
  origen: TanqueEnTransferencia
  destino: TanqueEnTransferencia
  /** Litros que ya pasaron en esta transferencia. */
  litrosTransferidos: number
  caudalLMin?: number | null
  modo?: ModoTransferencia
  porManifold?: boolean
  /** false = la transferencia terminó o está detenida (el tubo se queda quieto). */
  activa?: boolean
  capacidad?: number
}) {
  // El líquido del tubo tiene el color del tanque de origen
  const colorTubo = origen.color

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(64px,0.7fr)_minmax(0,1fr)] items-end">
      <div className="overflow-hidden rounded-xl border border-border">
        <TanqueVisual {...origen} capacidad={capacidad} />
      </div>

      {/* Tubería */}
      <div className="relative h-44">
        {/* Tubo: gris por fuera, con el líquido corriendo por dentro */}
        <div className="absolute inset-x-0 bottom-5 h-3.5 border-y-2 border-foreground/25 bg-muted">
          <div
            className={cn("h-full w-full", activa && "pipe-flow")}
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${colorTubo} 0 10px, color-mix(in oklab, ${colorTubo} 45%, white) 10px 16px)`,
              opacity: activa ? 0.95 : 0.35,
            }}
          />
        </div>

        {/* Válvulas en las puntas */}
        <span className="absolute bottom-3.5 left-1.5 size-2.5 rounded-sm border border-foreground/30 bg-background" />
        <span className="absolute bottom-3.5 right-1.5 size-2.5 rounded-sm border border-foreground/30 bg-background" />

        {/* Manifold en el medio (si pasa por ahí) */}
        {porManifold && (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center">
            <div className="grid h-8 w-10 grid-cols-3 place-items-center gap-0.5 rounded-md border-2 border-foreground/30 bg-background px-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("size-1.5 rounded-full", i === 1 ? "bg-success" : "bg-muted-foreground/40")} />
              ))}
            </div>
          </div>
        )}

        {/* Rótulo: flecha, modo y litros */}
        <div className="absolute inset-x-0 top-6 flex flex-col items-center gap-1 text-center">
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-foreground">
            T{origen.numeroTanque}
            <ArrowRight className={cn("size-3.5", activa && "alert-pulse")} aria-hidden="true" />
            T{destino.numeroTanque}
          </span>
          <span className="rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
            {modo === "LOTE" ? "Lote" : "Líquido"}
            {porManifold ? " · Manifold" : ""}
          </span>
          <span className="num text-xs font-bold text-foreground">{Math.round(litrosTransferidos).toLocaleString("es-CO")} L</span>
          {caudalLMin != null && activa && (
            <span className="num text-[10px] text-muted-foreground">{caudalLMin.toFixed(0)} L/min</span>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <TanqueVisual {...destino} capacidad={capacidad} />
      </div>
    </div>
  )
}
