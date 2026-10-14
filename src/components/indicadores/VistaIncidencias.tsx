import type { CSSProperties, ReactNode } from "react"
import { nombreMes } from "@/lib/indicadores/calculos"
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
/** La incidencia es un solo texto: un poco más grande. */
const TEXTO_INCIDENCIA = "text-[clamp(19px,1.8vw,32px)] leading-snug"

function Etiqueta({ tipo }: { tipo: Incidencia["tipo"] }) {
  return (
    <span
      className={cn(
        "self-start rounded-full px-3 py-1 text-[clamp(13px,1vw,18px)] font-bold tracking-wider",
        tipo === "INCIDENCIA" ? "bg-danger-soft text-danger" : "bg-info/10 text-info",
      )}
    >
      {tipo}
    </span>
  )
}

/*
 * Incidencias y seguimientos del mes. La INCIDENCIA es un recuadro con su
 * texto; el SEGUIMIENTO, el formato del informe: evento, qué pasó, cómo pasó
 * y acción correctiva. El título lo escribe la analista. Siempre se cargan a
 * mano (dueña, 2026-10-14).
 */
export function VistaIncidencias({ mes, titulo, incidencias, editar }: { mes: string; titulo: string | undefined; incidencias: Incidencia[]; editar: ReactNode }) {
  return (
    <section aria-label="Incidencias y seguimiento" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[clamp(26px,2.4vw,44px)] font-bold uppercase tracking-wide">{titulo?.trim() || TITULO_INCIDENCIAS}</h2>
        <span className="ml-auto">{editar}</span>
      </div>
      {incidencias.length === 0 && <p className={cn("m-auto text-muted-foreground", TEXTO)}>Sin incidencias ni seguimientos en {nombreMes(mes)}.</p>}
      {incidencias.map((inc, i) =>
        inc.tipo === "INCIDENCIA" ? (
          <article key={i} className="flex flex-col gap-3 rounded-xl border-2 border-danger/40 p-5">
            <Etiqueta tipo={inc.tipo} />
            <p className={cn("whitespace-pre-wrap", TEXTO_INCIDENCIA)}>{inc.texto?.trim() || "—"}</p>
          </article>
        ) : (
          <article key={i} className="flex flex-1 flex-col gap-4 rounded-xl border-2 p-5">
            <header className="flex flex-col gap-2">
              <Etiqueta tipo={inc.tipo} />
              <h3 className="text-[clamp(22px,2vw,36px)] font-bold leading-tight">
                <span className="text-muted-foreground">Evento: </span>
                {inc.evento || "—"}
              </h3>
            </header>
            {/* Solo las partes escritas; las que hay se reparten el ancho. */}
            <div className="grid flex-1 grid-cols-1 gap-4 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ "--n": Math.max(1, partesDe(inc).length) } as CSSProperties}>
              {partesDe(inc).map((p) => (
                <div key={p.campo} className="flex flex-col gap-2 rounded-lg bg-muted/60 p-4">
                  <span className="text-[clamp(13px,1vw,18px)] font-bold tracking-wider text-muted-foreground">{p.titulo}</span>
                  <p className={cn("whitespace-pre-wrap", TEXTO)}>{inc[p.campo]}</p>
                </div>
              ))}
            </div>
          </article>
        ),
      )}
    </section>
  )
}
