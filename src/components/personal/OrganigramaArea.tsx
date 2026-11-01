import { useEffect, useRef } from "react"
import { agruparPorNivel } from "@/lib/estructura"
import type { PersonalRegistrado } from "@/lib/personal"
import { cn } from "@/lib/utils"

/** Una franja por nivel (Jefatura, Coordinación, Operación, Apoyo) con una tarjeta por persona. */
export function OrganigramaArea({
  personas,
  elegida,
  resaltadas,
  onElegir,
}: {
  personas: PersonalRegistrado[]
  elegida: string | null
  /** Ids que coinciden con el buscador. */
  resaltadas: Set<string>
  onElegir: (id: string) => void
}) {
  const grupos = agruparPorNivel(personas)
  const primeraResaltada = personas.find((p) => resaltadas.has(p.id))?.id ?? null
  const refs = useRef(new Map<string, HTMLButtonElement>())

  // Al buscar, lleva la vista a la primera tarjeta que coincide.
  useEffect(() => {
    if (primeraResaltada) refs.current.get(primeraResaltada)?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [primeraResaltada])

  if (personas.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-foreground">Esta área no tiene personas todavía.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {grupos.map((g) => (
        <section key={g.nivel ?? "sin"} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <h3>{g.nombre}</h3>
            <span className="font-normal tabular-nums">{g.items.length}</span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {g.items.map((p) => (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) refs.current.set(p.id, el)
                  else refs.current.delete(p.id)
                }}
                type="button"
                data-resaltada={resaltadas.has(p.id) ? "true" : undefined}
                aria-pressed={elegida === p.id}
                onClick={() => onElegir(p.id)}
                className={cn(
                  "flex min-h-16 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                  elegida === p.id ? "border-2 border-primary" : "border-border",
                  resaltadas.has(p.id) && "bg-warning-soft ring-2 ring-warning",
                  !p.activo && "opacity-45",
                )}
              >
                <span className="text-sm font-semibold text-foreground">{p.nombre}</span>
                <span className="text-sm text-foreground">{p.puesto}</span>
                {p.titulo && <span className="text-xs font-medium text-info-foreground">{p.titulo}</span>}
                {!p.activo && <span className="text-xs font-medium text-foreground">Inactiva</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
