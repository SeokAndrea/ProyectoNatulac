import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { urlPublicaActa } from "@/lib/historialTurnos"
import type { TurnoDelDia } from "@/lib/resumenDiario"

const miles = (n: number) => n.toLocaleString("es-CO")

/** Un botón por turno con datos: abre su acta vigente (el mismo PDF de Mis Actas) para verla o imprimirla. */
export function ActasDelDia({ turnos }: { turnos: TurnoDelDia[] }) {
  if (turnos.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      {turnos.map((t) => (
        <div key={t.turno.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Acta {t.etiqueta}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t.turno.supervisorNombre} · <span className="num">{miles(t.cajas)}</span> cajas
            </p>
          </div>
          {t.actaStoragePath ? (
            <Button size="sm" onClick={() => window.open(urlPublicaActa(t.actaStoragePath!), "_blank", "noopener")}>
              <FileText className="size-3.5" />
              Ver acta
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Acta pendiente
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
