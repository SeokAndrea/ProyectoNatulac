import { DIAS_SIN_INCIDENTES_AMARILLO, DIAS_SIN_INCIDENTES_VERDE } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"

/**
 * Recuadro "DÍAS SIN INCIDENTES" de la pantalla de Incidencias (dueña,
 * 2026-10-15): el número lo escribe la analista; rojo con menos de
 * DIAS_SIN_INCIDENTES_AMARILLO días, amarillo hasta DIAS_SIN_INCIDENTES_VERDE
 * y verde desde ahí. En amarillo la letra va oscura para que se lea.
 */
export function DiasSinIncidentes({ dias }: { dias: number }) {
  const color =
    dias >= DIAS_SIN_INCIDENTES_VERDE
      ? "bg-success text-white"
      : dias >= DIAS_SIN_INCIDENTES_AMARILLO
        ? "bg-warning text-neutral-900"
        : "bg-danger text-white"
  return (
    <div
      role="status"
      aria-label={`${dias} días sin incidentes`}
      className={cn("flex items-center gap-3 rounded-xl px-5 py-2 shadow-sm", color)}
    >
      <span className="font-mono text-[clamp(34px,3.2vw,60px)] font-bold leading-none tabular-nums">{dias.toLocaleString("es-CO")}</span>
      <span className="text-[clamp(13px,1.05vw,19px)] font-bold leading-tight tracking-wider">
        DÍAS SIN
        <br />
        INCIDENTES
      </span>
    </div>
  )
}
