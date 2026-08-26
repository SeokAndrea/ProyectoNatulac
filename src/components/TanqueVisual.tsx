import { Clock3 } from "lucide-react"
import type { CondicionTanque } from "@/lib/turno"
import { cn } from "@/lib/utils"

/** Posiciones fijas de las gotas/pegostes de Sucio — variadas para que no se vean en fila prolija, pero estables (no cambian en cada render). */
const GOTAS_SUCIO = [
  { left: "18%", bottom: "6%", size: 10 },
  { left: "62%", bottom: "14%", size: 7 },
  { left: "40%", bottom: "3%", size: 13 },
  { left: "80%", bottom: "8%", size: 6 },
  { left: "8%", bottom: "22%", size: 5 },
  { left: "55%", bottom: "30%", size: 6 },
]

/**
 * "Vidrio" del tanque: líquido con olas/burbujas + marcas de nivel +
 * reflejo — nació en el Panel de Producción (src/pages/apps/PanelProduccion.tsx)
 * y se comparte acá para poder usarse también en Status/Preparación
 * (src/components/EstadoPlantaTabs.tsx), con `square` para el tamaño
 * compacto que necesita esa grilla de 3 columnas. Las animaciones
 * (liquid-wave, liquid-bubble, tank-glass, alert-pulse) son clases
 * CSS globales — ver el final de src/index.css.
 */
export function TanqueVisual({
  numeroTanque,
  condicion,
  volumenL,
  color,
  capacidad = 20000,
  square = false,
}: {
  numeroTanque: number
  condicion: CondicionTanque
  volumenL: number | null
  color: string
  capacidad?: number
  square?: boolean
}) {
  const tieneLiquido = condicion === "LISTO" || condicion === "STANDBY"
  const pct = tieneLiquido ? Math.min(100, ((volumenL ?? 0) / capacidad) * 100) : 0

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        square ? "size-24 rounded-xl border border-border" : "h-44 w-full",
      )}
    >
      {tieneLiquido && (
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out"
          style={{ height: `${pct}%`, backgroundColor: color, opacity: condicion === "STANDBY" ? 0.55 : 0.92 }}
        >
          <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
          <div
            className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
            style={{ backgroundColor: color, opacity: 0.55 }}
          />
          <span className="liquid-bubble absolute bottom-2 left-1/3 size-1 rounded-full bg-background/70" />
          <span
            className="liquid-bubble absolute bottom-3 left-2/3 size-1.5 rounded-full bg-background/60"
            style={{ animationDelay: "1.4s" }}
          />
        </div>
      )}

      {condicion === "EN_PREPARACION" && (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, var(--muted))` }}
        >
          <div
            className={cn("mixing-vortex rounded-full border-2", square ? "size-10" : "size-14")}
            style={{
              borderColor: color,
              background: `conic-gradient(from 20deg, transparent 0 16%, ${color} 18% 31%, transparent 34% 52%, ${color} 55% 68%, transparent 72%)`,
            }}
          />
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full border border-warning/40 bg-background/85 text-warning">
            <Clock3 className="size-3" aria-hidden="true" />
          </span>
        </div>
      )}

      {condicion === "SUCIO" && (
        <>
          {GOTAS_SUCIO.map((g, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{ left: g.left, bottom: g.bottom, width: g.size, height: g.size, backgroundColor: color, opacity: 0.65 }}
            />
          ))}
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Sucio
          </span>
        </>
      )}

      {condicion === "VACIO" && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Vacío</span>
        </div>
      )}

      {/* Marcas de nivel + reflejo */}
      {[25, 50, 75].map((m) => (
        <div
          key={m}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
          style={{ bottom: `${m}%` }}
        />
      ))}
      <div className="tank-glass pointer-events-none absolute inset-0" />

      <span className="absolute left-2 top-2 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
        T{numeroTanque}
      </span>

      {tieneLiquido && (
        <span className="num absolute inset-x-0 bottom-1.5 text-center text-sm font-bold text-foreground drop-shadow">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  )
}
