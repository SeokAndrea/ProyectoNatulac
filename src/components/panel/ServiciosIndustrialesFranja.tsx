import { Droplets, Fuel, Thermometer } from "lucide-react"
import {
  GASOIL_CONSUMO_L_POR_HORA,
  gasoilHorasDisponibles,
  nivelGasoil,
  type LecturaServiciosIndustriales,
} from "@/lib/panelProduccion"
import { cn } from "@/lib/utils"
import { tiempoRelativo } from "./calculosPanel"

/**
 * Servicios Industriales: Temperatura del Quantum / Agua Osmotizada —
 * franja angosta arriba de la grilla de Tanques (adentro del mismo
 * PanelCard, no una tarjeta propia — ver feedback del 2026-09-04:
 * "es muy grande"). Meramente informativo, no alimenta ningún cálculo
 * de merma ni de otro tipo. SOLO LECTURA acá — lo carga Servicios
 * Industriales desde su propia pantalla.
 */
export function ServiciosIndustrialesFranja({ lectura, ahora }: { lectura: LecturaServiciosIndustriales | null; ahora: Date }) {
  return (
    <>
      {lectura?.gasoil !== null && lectura?.gasoil !== undefined && <BannerGasoil litros={lectura.gasoil} />}
      <div className="mb-3 flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-surface/60 px-2.5 py-1.5 text-xs">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Thermometer className="size-4 animate-pulse text-warning" />
            Quantum:{" "}
            <span className="num font-bold text-foreground">
              {lectura?.temperaturaQuantum !== null && lectura?.temperaturaQuantum !== undefined ? `${lectura.temperaturaQuantum}°C` : "—"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Droplets className="size-4 animate-pulse text-info" />
            Agua Osmotizada:{" "}
            <span className="num font-bold text-foreground">
              {lectura?.aguaOsmotizada !== null && lectura?.aguaOsmotizada !== undefined ? `${lectura.aguaOsmotizada.toLocaleString("es-CO")} L` : "—"}
            </span>
          </span>
          {lectura && (
            <span className="text-[11px] text-muted-foreground/70">
              {tiempoRelativo(lectura.actualizadoEn, ahora)}
              {lectura.actualizadoPorNombre ? ` · ${lectura.actualizadoPorNombre}` : ""}
            </span>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Semáforo de Gasoil: banner a todo el ancho de la tarjeta de Tanques
 * (feedback 2026-09-25: la versión chica en la franja "no se entendía
 * sola"). Rojo hasta 12 h de autonomía, amarillo 13-20 h, verde de ahí
 * para arriba - ver umbrales en panelProduccion.ts.
 */
function BannerGasoil({ litros }: { litros: number }) {
  const horas = gasoilHorasDisponibles(litros)
  const nivel = nivelGasoil(horas)

  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold",
        nivel === "danger"
          ? "border-danger/40 bg-danger-soft text-danger-foreground"
          : nivel === "warn"
            ? "border-warning/40 bg-warning-soft text-warning-foreground"
            : "border-success/40 bg-success-soft text-success-foreground",
      )}
    >
      <Fuel className="size-4 shrink-0" />
      {horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} horas de autonomía de gasoil
      <span className="font-normal opacity-70">
        · <span className="font-semibold">{litros.toLocaleString("es-CO")} L</span> a {GASOIL_CONSUMO_L_POR_HORA} L/h
      </span>
    </div>
  )
}
