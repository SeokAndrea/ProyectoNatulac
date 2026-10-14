import type { CSSProperties, ReactNode } from "react"
import { nombreMes, textoSeguimiento } from "@/lib/indicadores/calculos"
import { TITULO_INCIDENCIAS, type Incidencia } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"

const PARTES: { campo: keyof Pick<Incidencia, "quePaso" | "comoPaso" | "accionCorrectiva">; titulo: string }[] = [
  { campo: "quePaso", titulo: "QUÉ PASÓ" },
  { campo: "comoPaso", titulo: "CÓMO PASÓ" },
  { campo: "accionCorrectiva", titulo: "ACCIÓN CORRECTIVA" },
]

const partesDe = (inc: Incidencia) => PARTES.filter((p) => inc[p.campo].trim())

// Letra que crece con la pantalla: se lee proyectada, como una diapositiva (dueña, 2026-10-14).
const TEXTO = "text-[clamp(17px,1.5vw,28px)] leading-snug"
/** El seguimiento es un solo texto: un poco más grande. */
const TEXTO_SEGUIMIENTO = "text-[clamp(19px,1.8vw,32px)] leading-snug"

function Encabezado({ inc }: { inc: Incidencia }) {
  return (
    <header className="flex flex-col gap-2">
      <span
        className={cn(
          "self-start rounded-full px-3 py-1 text-[clamp(13px,1vw,18px)] font-bold tracking-wider",
          inc.tipo === "INCIDENCIA" ? "bg-danger-soft text-danger" : "bg-info/10 text-info",
        )}
      >
        {inc.tipo}
      </span>
      <h3 className="text-[clamp(22px,2vw,36px)] font-bold leading-tight">Evento: {inc.evento.trim() || "—"}</h3>
    </header>
  )
}

/*
 * Incidencias y seguimientos del mes (dueña, 2026-10-14). Los dos llevan el
 * EVENTO de título. La INCIDENCIA sigue el formato del informe: qué pasó,
 * cómo pasó y acción correctiva (solo las partes escritas). El SEGUIMIENTO
 * es un recuadro con su texto. El título de la pantalla lo escribe la
 * analista. Siempre se cargan a mano.
 */
export function VistaIncidencias({ mes, titulo, incidencias, editar }: { mes: string; titulo: string | undefined; incidencias: Incidencia[]; editar: ReactNode }) {
  return (
    <section aria-label="Incidencias y seguimiento" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[clamp(26px,2.4vw,44px)] font-bold uppercase tracking-wide">{titulo?.trim() || TITULO_INCIDENCIAS}</h2>
        <span className="ml-auto">{editar}</span>
      </div>
      {incidencias.length === 0 && <p className={cn("m-auto", TEXTO)}>Sin incidencias ni seguimientos en {nombreMes(mes)}.</p>}
      {incidencias.map((inc, i) =>
        inc.tipo === "INCIDENCIA" ? (
          <article key={i} className="flex flex-col gap-4 rounded-xl border-2 border-danger/40 p-5">
            <Encabezado inc={inc} />
            {/* Solo las partes escritas; las que hay se reparten el ancho. */}
            {partesDe(inc).length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ "--n": partesDe(inc).length } as CSSProperties}>
                {partesDe(inc).map((p) => (
                  <div key={p.campo} className="flex flex-col gap-2 rounded-lg bg-muted/60 p-4">
                    <span className="text-[clamp(13px,1vw,18px)] font-bold tracking-wider">{p.titulo}</span>
                    <p className={cn("whitespace-pre-wrap", TEXTO)}>{inc[p.campo]}</p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ) : (
          <article key={i} className="flex flex-col gap-4 rounded-xl border-2 border-info/40 p-5">
            <Encabezado inc={inc} />
            <p className={cn("whitespace-pre-wrap rounded-lg bg-muted/60 p-4", TEXTO_SEGUIMIENTO)}>{textoSeguimiento(inc) || "—"}</p>
          </article>
        ),
      )}
    </section>
  )
}
