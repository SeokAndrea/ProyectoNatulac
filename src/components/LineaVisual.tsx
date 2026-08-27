import { BroomSparkles, PauseCircle, RefreshCw, Square } from "lucide-react"
import { cn } from "@/lib/utils"

export type EstadoVisualLinea = "corriendo" | "parada" | "terminada" | "cip" | "cambio_presentacion" | "libre"

const CANT_ENVASES = 4

/**
 * Dibujo de la llenadora — a propósito bien distinto del tanque
 * (TanqueVisual.tsx, un vidrio vertical con líquido, con marco
 * cuadrado): acá NO hay marco/recuadro ni cabezal — es solo una fila
 * de cajas tetra pak centrada, flotando directo sobre el fondo de la
 * tarjeta, coloreadas por el sabor que está pasando. Corriendo = las
 * cajas van llenándose una a una (parpadeo escalonado, ver
 * "alert-pulse" en src/index.css); el resto de los estados usa solo
 * un ícono + texto, sin fondo propio. Se usa en Preparación/Status
 * (EstadoPlantaTabs.tsx) y Finalizar Turno — a propósito NO en el
 * Panel de Producción (dashboard).
 */
export function LineaVisual({
  numeroLinea,
  estado,
  color,
  square = false,
}: {
  numeroLinea: number
  estado: EstadoVisualLinea
  color: string
  square?: boolean
}) {
  const corriendo = estado === "corriendo"
  const conEnvases = corriendo || estado === "parada"

  return (
    <div className={cn("relative shrink-0", square ? "size-32" : "h-44 w-full")}>
      {conEnvases && (
        <div className="absolute inset-0 flex items-center justify-center gap-[9%]">
          {Array.from({ length: CANT_ENVASES }).map((_, i) => (
            <div
              key={i}
              className={cn("relative h-8 w-5 rounded-[2px] border border-border/70", corriendo && "alert-pulse")}
              style={{ backgroundColor: color, opacity: corriendo ? 0.85 : 0.25, animationDelay: `${i * 0.35}s` }}
            >
              <div className="absolute inset-x-0 top-[5px] h-px bg-background/50" />
            </div>
          ))}
        </div>
      )}

      {estado === "terminada" && (
        <div className="absolute inset-0 grid place-items-center">
          <Square className={cn("text-warning", square ? "size-9" : "size-12")} aria-hidden="true" />
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Terminó Lote
          </span>
        </div>
      )}

      {estado === "cip" && (
        <div className="absolute inset-0 grid place-items-center">
          <BroomSparkles className={cn("text-foreground/70", square ? "size-10" : "size-11")} aria-hidden="true" />
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            CIP
          </span>
        </div>
      )}

      {estado === "cambio_presentacion" && (
        <div className="absolute inset-0 grid place-items-center">
          <RefreshCw className={cn("text-muted-foreground", square ? "size-9" : "size-12")} aria-hidden="true" />
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Cambio Present.
          </span>
        </div>
      )}

      {estado === "libre" && (
        <div className="absolute inset-0 grid place-items-center">
          <PauseCircle className={cn("text-muted-foreground/50", square ? "size-9" : "size-12")} aria-hidden="true" />
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Libre
          </span>
        </div>
      )}

      <span className="absolute left-2 top-2 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
        L{numeroLinea}
      </span>

      {estado === "parada" && (
        <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full border border-warning/40 bg-background/85 text-warning">
          <PauseCircle className="size-3" aria-hidden="true" />
        </span>
      )}
    </div>
  )
}
