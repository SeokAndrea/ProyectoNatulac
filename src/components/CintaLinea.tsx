import { BroomSparkles, Pause, PauseCircle, RefreshCw, Square } from "lucide-react"
import { colorSabor } from "@/lib/coloresSabor"
import { cn } from "@/lib/utils"

/**
 * Estado visual de una línea para el Panel de Paradas — a diferencia de
 * `EstadoVisualLinea` (LineaVisual.tsx, usado en Preparación/Status y
 * Finalizar Turno, con envases parpadeando quietos), acá las cajas se
 * MUEVEN sobre una cinta (`belt-box`, src/index.css) — es el dashboard,
 * tiene que leerse de lejos y distinguirse de un vistazo.
 */
export type EstadoLineaVista = "CORRIENDO" | "PARADA" | "CIP" | "CAMBIO" | "LIBRE" | "TERMINO"

const CANT_CAJAS = 4

const META: Record<EstadoLineaVista, { etiqueta: string; icono: typeof Pause; tono: string }> = {
  CORRIENDO: { etiqueta: "Corriendo", icono: Pause, tono: "text-success" }, // icono sin uso (hay cajas)
  PARADA: { etiqueta: "Pausa operacional", icono: Pause, tono: "text-warning" },
  CIP: { etiqueta: "CIP", icono: BroomSparkles, tono: "text-info" },
  CAMBIO: { etiqueta: "Cambio Present.", icono: RefreshCw, tono: "text-muted-foreground" },
  LIBRE: { etiqueta: "Libre", icono: PauseCircle, tono: "text-muted-foreground/60" },
  TERMINO: { etiqueta: "Terminó Lote", icono: Square, tono: "text-warning" },
}

export function CintaLinea({
  numeroLinea,
  estado,
  saborNombre,
  lote,
}: {
  numeroLinea: number
  estado: EstadoLineaVista
  saborNombre: string | null
  lote: string | null
}) {
  const meta = META[estado]
  const Icon = meta.icono
  const conCajas = estado === "CORRIENDO" || estado === "PARADA"
  const color = colorSabor(saborNombre)

  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-border bg-muted/30">
      <span className="absolute left-2 top-1.5 z-20 rounded-md border border-border bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
        L{numeroLinea}
      </span>
      <span className={cn("absolute right-2 top-1.5 z-20 flex items-center gap-1.5 text-[10px] font-semibold", meta.tono)}>
        <span className={cn("size-1.5 rounded-full bg-current", estado === "CORRIENDO" && "alert-pulse")} />
        {meta.etiqueta}
      </span>

      {/* Track de la cinta */}
      <div className="absolute inset-x-2 bottom-7 h-5 overflow-hidden rounded-md border-y border-border bg-secondary/60">
        <div className="h-full w-full opacity-40 [background:repeating-linear-gradient(90deg,transparent_0,transparent_10px,var(--border)_11px,var(--border)_13px)]" />
      </div>

      {conCajas ? (
        <div className={cn("absolute inset-0", estado === "PARADA" && "opacity-25")}>
          {Array.from({ length: CANT_CAJAS }).map((_, i) => (
            <div
              key={i}
              className="belt-box absolute bottom-7 left-0 z-10 h-6 w-4 rounded-[3px] border border-foreground/15 shadow-sm"
              style={{ backgroundColor: color, animationDelay: `${i * -1.2}s`, animationPlayState: estado === "PARADA" ? "paused" : "running" }}
            />
          ))}
          {estado === "PARADA" && (
            <span className="absolute bottom-1.5 right-1.5 z-20 grid size-5 place-items-center rounded-full border border-warning/40 bg-background/90 text-warning">
              <PauseCircle className="size-3" aria-hidden="true" />
            </span>
          )}
        </div>
      ) : (
        <div className={cn("absolute inset-0 grid place-items-center", meta.tono)}>
          <Icon className="size-7" strokeWidth={1.7} aria-hidden="true" />
          <span className="absolute inset-x-0 top-[64%] text-center text-[10px] font-medium uppercase tracking-wide">{meta.etiqueta}</span>
        </div>
      )}

      <p className="absolute bottom-1.5 left-2 max-w-[70%] truncate text-[10px] text-muted-foreground">
        {conCajas ? `${saborNombre ?? "Sin sabor"}${lote ? ` · Lote ${lote}` : ""}` : lote ? `Lote ${lote}` : ""}
      </p>
    </div>
  )
}
