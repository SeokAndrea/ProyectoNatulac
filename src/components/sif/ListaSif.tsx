import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { codigoParadaSif, fechaHoraSif, NOMBRE_ESTADO_SIF, sifTerminada, type EstadoSif, type Sif } from "@/lib/sif"

const VARIANTE: Record<EstadoSif, "warning" | "muted" | "danger" | "info" | "success"> = {
  INSPECCION: "warning",
  REVISADA: "muted",
  PENDIENTE: "danger",
  EN_REPARACION: "info",
  CERRADA: "success",
}

export function EstadoSifBadge({ estado }: { estado: EstadoSif }) {
  return <Badge variant={VARIANTE[estado]}>{NOMBRE_ESTADO_SIF[estado]}</Badge>
}

/** Como Mis Actas: una tarjeta por solicitud, que se toca entera para abrirla. Abiertas arriba (pendientes primero), terminadas abajo. */
export function ListaSif({ lista, onElegir }: { lista: Sif[]; onElegir: (id: string) => void }) {
  const grupos: [string, Sif[]][] = [
    ["Abiertas", lista.filter((s) => !sifTerminada(s.estado))],
    ["Revisadas y cerradas", lista.filter((s) => sifTerminada(s.estado))],
  ]

  return (
    <div className="flex flex-col gap-3">
      {grupos
        .filter(([, items]) => items.length > 0)
        .map(([titulo, items]) => (
          <section key={titulo} className="flex flex-col gap-3">
            <h2 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
            {items.map((s) => (
              // La tarjeta entera abre la solicitud: con el dedo y con apuro no hay que atinarle a un botón chico.
              <button
                key={s.id}
                type="button"
                onClick={() => onElegir(s.id)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-3.5 text-left text-card-foreground ring-1 ring-foreground/10 transition-[box-shadow,background-color] outline-none hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring active:bg-muted/60"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 break-words text-sm font-semibold text-foreground">
                    {s.lineaNombre} · {s.tipoNombre}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <EstadoSifBadge estado={s.estado} />
                    <span>
                      <span className="num">{s.codigo}</span> · <span className="num">{codigoParadaSif(s)}</span> · {s.fallas}{" "}
                      {s.fallas === 1 ? "falla" : "fallas"} · {fechaHoraSif(s.generadaEn)}
                    </span>
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </section>
        ))}
    </div>
  )
}
