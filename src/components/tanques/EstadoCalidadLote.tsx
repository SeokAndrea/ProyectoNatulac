import { Link } from "react-router-dom"
import { FlaskConical } from "lucide-react"
import type { AnalisisCalidad } from "@/lib/calidad"
import { cn } from "@/lib/utils"

/** En Preparación: el lote espera a Calidad, o el resultado de su último análisis (si no fue conforme, hay que ajustar). */
export function EstadoCalidadLote({ ultimo, puedeIrACalidad }: { ultimo: AnalisisCalidad | null; puedeIrACalidad: boolean }) {
  const noConforme = ultimo !== null && !ultimo.conforme
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-2.5 text-xs",
        noConforme ? "border-destructive/40 bg-destructive/5" : "border-info/30 bg-info/5",
      )}
    >
      <p className={cn("flex items-center gap-1.5 font-semibold", noConforme ? "text-destructive" : "text-info")}>
        <FlaskConical className="size-3.5 shrink-0" />
        {noConforme ? "No conforme: ajustar y volver a pedir análisis" : "Esperando análisis de Calidad"}
      </p>
      {noConforme && ultimo && (
        <p className="text-muted-foreground">
          Brix {ultimo.brix} · Acidez {ultimo.acidez}
          {ultimo.observacion ? ` · ${ultimo.observacion}` : ""} — {ultimo.analistaNombre}
        </p>
      )}
      {puedeIrACalidad && (
        <Link to="/calidad" className="self-start font-medium text-primary underline-offset-2 hover:underline">
          Ir a Calidad
        </Link>
      )}
    </div>
  )
}
