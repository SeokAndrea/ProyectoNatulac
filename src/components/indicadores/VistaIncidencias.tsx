import type { ReactNode } from "react"
import { nombreMes } from "@/lib/indicadores/calculos"
import { TITULO_INCIDENCIAS, type Incidencia } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"

const PARTES: { campo: keyof Pick<Incidencia, "quePaso" | "comoPaso" | "accionCorrectiva">; titulo: string }[] = [
  { campo: "quePaso", titulo: "QUÉ PASÓ" },
  { campo: "comoPaso", titulo: "CÓMO PASÓ" },
  { campo: "accionCorrectiva", titulo: "ACCIÓN CORRECTIVA" },
]

/*
 * Incidencias y seguimientos del mes, con el formato del informe: evento,
 * qué pasó, cómo pasó y acción correctiva. Pueden ser varias; cada una dice
 * si es incidencia o seguimiento. El título lo escribe la analista (a veces es
 * "Incidencias", a veces "Seguimiento"). Siempre se cargan a mano (dueña, 2026-10-14).
 */
export function VistaIncidencias({ mes, titulo, incidencias, editar }: { mes: string; titulo: string | undefined; incidencias: Incidencia[]; editar: ReactNode }) {
  return (
    <section aria-label="Incidencias y seguimiento" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[28px] font-bold uppercase tracking-wide">{titulo?.trim() || TITULO_INCIDENCIAS}</h2>
        <span className="ml-auto">{editar}</span>
      </div>
      {incidencias.length === 0 && <p className="m-auto text-muted-foreground">Sin incidencias ni seguimientos en {nombreMes(mes)}.</p>}
      {incidencias.map((inc, i) => (
        <article key={i} className="flex flex-col gap-3 rounded-xl border-2 p-4">
          <header className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wider",
                inc.tipo === "INCIDENCIA" ? "bg-danger-soft text-danger" : "bg-info/10 text-info",
              )}
            >
              {inc.tipo === "INCIDENCIA" ? "INCIDENCIA" : "SEGUIMIENTO"}
            </span>
            <h3 className="text-xl font-bold">
              <span className="text-muted-foreground">Evento: </span>
              {inc.evento || "—"}
            </h3>
          </header>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {PARTES.map((p) => (
              <div key={p.campo} className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3">
                <span className="text-xs font-bold tracking-wider text-muted-foreground">{p.titulo}</span>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{inc[p.campo] || "—"}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
