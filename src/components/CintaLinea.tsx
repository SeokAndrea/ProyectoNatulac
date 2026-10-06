import { BroomSparkles, Pause, PauseCircle, RefreshCw, Square, Wrench } from "lucide-react"
import { colorSabor } from "@/lib/coloresSabor"
import { cn } from "@/lib/utils"
import { CintaPixel } from "@/components/pixel/CintaPixel"
import { interpretarSabor } from "@/components/pixel/armarJugo"

/**
 * Estado visual de una línea para el Panel de Paradas — a diferencia de
 * `EstadoVisualLinea` (LineaVisual.tsx, usado en Preparación/Status y
 * Finalizar Turno, con envases parpadeando quietos), acá las cajas se
 * MUEVEN sobre una cinta — es el dashboard, tiene que leerse de lejos y
 * distinguirse de un vistazo.
 *
 * Si el sabor se reconoce (ver interpretarSabor en
 * src/components/pixel/armarJugo.ts), la cinta es PIXEL ART con el envase
 * real de ese sabor/familia/presentación (src/components/pixel/). Si no
 * se reconoce, quedan las cajitas lisas del color del sabor (`belt-box`,
 * src/index.css) como antes.
 *
 * CIP, PARADA y DETENIDA también son pixel art: la cinta lavándose, y la
 * cinta quieta con un técnico atendiéndola (modo "cip" / "reparacion" de
 * CintaPixel) — en PARADA con los envases de la corrida arriba.
 */
export type EstadoLineaVista = "CORRIENDO" | "PARADA" | "DETENIDA" | "CIP" | "CAMBIO" | "LIBRE" | "TERMINO"

const CANT_CAJAS = 4

const META: Record<EstadoLineaVista, { etiqueta: string; icono: typeof Pause; tono: string }> = {
  CORRIENDO: { etiqueta: "Corriendo", icono: Pause, tono: "text-success" }, // icono sin uso (hay cajas)
  PARADA: { etiqueta: "Parada", icono: Pause, tono: "text-warning" },
  DETENIDA: { etiqueta: "Detenida", icono: Wrench, tono: "text-danger" },
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
  presentacion = null,
  paradaLarga = false,
}: {
  numeroLinea: number
  estado: EstadoLineaVista
  saborNombre: string | null
  lote: string | null
  /** Código de presentación de la corrida ("1000", "500"...). Si no llega, se dibuja el de 1 litro. */
  presentacion?: string | null
  /** Parada en curso hace más de 15 min: baliza roja y rótulo en rojo (solo indicador, no es un aviso). */
  paradaLarga?: boolean
}) {
  const larga = paradaLarga && estado === "PARADA"
  const meta = larga ? { ...META.PARADA, etiqueta: "Parada +15 min", tono: "text-danger" } : META[estado]
  const Icon = meta.icono
  const conCajas = estado === "CORRIENDO" || estado === "PARADA"
  const color = colorSabor(saborNombre)
  const jugoPixel = interpretarSabor(saborNombre)
  const escenaPixel = estado === "CIP" || estado === "DETENIDA"

  return (
    <div className={cn("relative h-28 overflow-hidden rounded-xl border bg-muted/30", larga ? "border-danger/60 bg-danger/5" : "border-border")}>
      <span className="absolute left-2 top-1.5 z-20 rounded-md border border-border bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
        L{numeroLinea}
      </span>
      <span className={cn("absolute right-2 top-1.5 z-20 flex items-center gap-1.5 text-[10px] font-semibold", meta.tono)}>
        <span className={cn("size-1.5 rounded-full bg-current", (estado === "CORRIENDO" || larga) && "alert-pulse")} />
        {meta.etiqueta}
      </span>

      {/* Track de la cinta (solo para las cajitas lisas — la pixel art trae su propia cinta) */}
      {!(conCajas && jugoPixel) && !escenaPixel && (
        <div className="absolute inset-x-2 bottom-7 h-5 overflow-hidden rounded-md border-y border-border bg-secondary/60">
          <div className="h-full w-full opacity-40 [background:repeating-linear-gradient(90deg,transparent_0,transparent_10px,var(--border)_11px,var(--border)_13px)]" />
        </div>
      )}

      {escenaPixel ? (
        <div className="absolute inset-x-2 bottom-6">
          <CintaPixel
            presentacion={presentacion ?? "1000"}
            familia={jugoPixel?.familia ?? "clasico"}
            sabor={jugoPixel?.sabor ?? "manzana"}
            modo={estado === "CIP" ? "cip" : "reparacion"}
            conEnvases={false}
            conPatas={false}
          />
        </div>
      ) : conCajas && jugoPixel ? (
        <div className="absolute inset-x-2 bottom-6">
          <CintaPixel
            presentacion={presentacion ?? "1000"}
            familia={jugoPixel.familia}
            sabor={jugoPixel.sabor}
            modo={estado === "PARADA" ? "reparacion" : "produccion"}
            baliza={larga}
            conPatas={false}
            separacion={18}
          />
        </div>
      ) : conCajas ? (
        <div className={cn("absolute inset-0", estado === "PARADA" && "opacity-25", larga && "animate-pulse")}>
          {Array.from({ length: CANT_CAJAS }).map((_, i) => (
            <div
              key={i}
              className="belt-box absolute bottom-7 left-0 z-10 h-6 w-4 rounded-[3px] border border-foreground/15 shadow-sm"
              style={{ backgroundColor: color, animationDelay: `${i * -1.2}s`, animationPlayState: estado === "PARADA" ? "paused" : "running" }}
            />
          ))}
          {estado === "PARADA" && (
            <span
              className={cn(
                "absolute bottom-1.5 right-1.5 z-20 grid size-5 place-items-center rounded-full border bg-background/90",
                larga ? "border-danger/60 text-danger" : "border-warning/40 text-warning",
              )}
            >
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
