import { Button } from "@/components/ui/button"
import type { TurnoActivo } from "@/lib/turno"
import { tramoT2 } from "@/lib/turno12x12"

/** "15:00–19:00" para el T2 de 12x12; si no, la hora real de inicio y fin. */
function etiquetaTramo(t: TurnoActivo): string {
  const tramo = tramoT2(t.esquema, t.turnoTipo, t.horaInicio)
  if (tramo) return `${tramo.desde}–${tramo.hasta}`
  return `${t.horaInicio.slice(0, 5)}–${t.horaFin ? t.horaFin.slice(0, 5) : "ahora"}`
}

/**
 * 12x12: el T2 se parte a las 19:00 y una misma fecha tiene dos. Botones para
 * ver uno u otro. No se muestra si la búsqueda trajo un solo turno.
 */
export function ElegirTramoTurno({
  tramos,
  turnoId,
  onElegir,
}: {
  tramos: TurnoActivo[]
  turnoId: string | undefined
  onElegir: (id: string) => void
}) {
  if (tramos.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Este turno tiene {tramos.length} partes:</span>
      {tramos.map((t) => (
        <Button key={t.id} size="sm" variant={t.id === turnoId ? "default" : "outline"} onClick={() => onElegir(t.id)}>
          {etiquetaTramo(t)} · {t.supervisorNombre}
        </Button>
      ))}
    </div>
  )
}
