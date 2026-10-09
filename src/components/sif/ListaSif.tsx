import { Badge } from "@/components/ui/badge"
import { codigoParadaSif, fechaHoraSif, NOMBRE_ESTADO_SIF, type EstadoSif, type Sif } from "@/lib/sif"
import { cn } from "@/lib/utils"

const VARIANTE: Record<EstadoSif, "warning" | "info" | "success"> = {
  PENDIENTE: "warning",
  EN_REPARACION: "info",
  CERRADA: "success",
}

export function EstadoSifBadge({ estado }: { estado: EstadoSif }) {
  return <Badge variant={VARIANTE[estado]}>{NOMBRE_ESTADO_SIF[estado]}</Badge>
}

/** Abiertas arriba (pendientes primero), cerradas abajo. */
export function ListaSif({ lista, seleccionada, onElegir }: { lista: Sif[]; seleccionada: string | null; onElegir: (id: string) => void }) {
  const grupos: [string, Sif[]][] = [
    ["Abiertas", lista.filter((s) => s.estado !== "CERRADA")],
    ["Cerradas", lista.filter((s) => s.estado === "CERRADA")],
  ]

  return (
    <div className="flex flex-col gap-2">
      {grupos
        .filter(([, items]) => items.length > 0)
        .map(([titulo, items]) => (
          <section key={titulo} className="flex flex-col gap-2">
            <h2 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
            {items.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onElegir(s.id)}
                aria-current={s.id === seleccionada}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg border bg-card px-3.5 py-3 text-left transition-colors",
                  s.id === seleccionada ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="num text-sm font-semibold">{s.codigo}</span>
                  <EstadoSifBadge estado={s.estado} />
                </span>
                <span className="text-sm font-medium text-foreground">
                  {s.lineaNombre} · {s.tipoNombre}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="num">{codigoParadaSif(s)}</span> · {s.fallas} {s.fallas === 1 ? "falla" : "fallas"} · generada{" "}
                  {fechaHoraSif(s.generadaEn)}
                </span>
              </button>
            ))}
          </section>
        ))}
    </div>
  )
}
