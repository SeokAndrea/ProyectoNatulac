import { Wrench, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TurnoCorregido } from "@/lib/turnoCorreccion"

/** Aviso fijo arriba de las páginas en modo corrección: qué turno cerrado se está corrigiendo y cómo salir. */
export function ModoCorreccionBanner({ turno, onSalir }: { turno: TurnoCorregido; onSalir: () => void }) {
  const cierre = turno.fechaFin && turno.horaFin ? ` al ${turno.fechaFin} ${turno.horaFin.slice(0, 5)}` : ""
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
      <Wrench className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Corrigiendo el turno {turno.codigo}</p>
        <p className="text-xs">
          Del {turno.fecha} {turno.horaInicio.slice(0, 5)}
          {cierre}
          {turno.supervisorNombre ? ` · ${turno.supervisorNombre}` : ""}. Los cambios quedan registrados como corrección.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onSalir}>
        <X className="size-3.5" />
        Salir de corrección
      </Button>
    </div>
  )
}
