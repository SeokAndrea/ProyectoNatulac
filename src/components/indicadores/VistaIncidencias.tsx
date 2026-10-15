import { Fragment, type ReactNode } from "react"
import { ArrowRight, CircleCheck, Search, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react"
import { nombreMes, textoSeguimiento } from "@/lib/indicadores/calculos"
import { TITULO_INCIDENCIAS, type Incidencia } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { DiasSinIncidentes } from "./DiasSinIncidentes"

/** Los pasos de la incidencia, del problema a la solución: rojo → ámbar → verde. */
const PASOS: { campo: keyof Pick<Incidencia, "quePaso" | "comoPaso" | "accionCorrectiva">; titulo: string; icono: LucideIcon; fondo: string; tinta: string }[] = [
  { campo: "quePaso", titulo: "QUÉ PASÓ", icono: TriangleAlert, fondo: "bg-danger-soft", tinta: "text-danger-foreground" },
  { campo: "comoPaso", titulo: "CÓMO PASÓ", icono: Search, fondo: "bg-warning-soft", tinta: "text-warning-foreground" },
  { campo: "accionCorrectiva", titulo: "ACCIÓN CORRECTIVA", icono: ShieldCheck, fondo: "bg-success-soft", tinta: "text-success-foreground" },
]

// Letra que crece con la pantalla: se lee proyectada, como una diapositiva (dueña, 2026-10-14).
const TEXTO = "text-[clamp(17px,1.5vw,28px)] leading-snug"
const TEXTO_LISTA = "text-[clamp(19px,1.8vw,32px)] leading-snug"

function Encabezado({ inc }: { inc: Incidencia }) {
  return (
    <header className="flex flex-col gap-2">
      <span
        className={cn(
          "self-start rounded-full px-3 py-1 text-[clamp(13px,1vw,18px)] font-bold tracking-wider",
          inc.tipo === "INCIDENCIA" ? "bg-danger-soft text-danger-foreground" : "bg-info/10 text-info",
        )}
      >
        {inc.tipo}
      </span>
      <h3 className="text-[clamp(24px,2.3vw,40px)] font-bold leading-tight [text-wrap:balance]">{inc.evento.trim() || "—"}</h3>
    </header>
  )
}

/** Incidencia: qué pasó → cómo pasó → acción correctiva, con flechas. Solo los pasos escritos. */
function Camino({ inc }: { inc: Incidencia }) {
  const pasos = PASOS.filter((p) => inc[p.campo].trim())
  if (pasos.length === 0) return null
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
      {pasos.map((p, i) => (
        <Fragment key={p.campo}>
          {i > 0 && <ArrowRight aria-hidden className="size-7 shrink-0 self-center max-lg:rotate-90" strokeWidth={2.6} />}
          <div className={cn("flex flex-1 flex-col gap-2 rounded-xl p-4", p.fondo)}>
            <span className={cn("flex items-center gap-2 text-[clamp(13px,1vw,18px)] font-bold tracking-wider", p.tinta)}>
              <p.icono className="size-[1.6em] shrink-0" strokeWidth={2.4} />
              {p.titulo}
            </span>
            <p className={cn("whitespace-pre-wrap", TEXTO)}>{inc[p.campo]}</p>
          </div>
        </Fragment>
      ))}
    </div>
  )
}

/** Seguimiento: una acción por renglón, cada una con su tilde. */
function ListaSeguimiento({ inc }: { inc: Incidencia }) {
  const renglones = textoSeguimiento(inc)
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
  if (renglones.length === 0) return <p className={TEXTO_LISTA}>—</p>
  return (
    <ul className="flex flex-col gap-3">
      {renglones.map((r, i) => (
        <li key={i} className={cn("flex items-start gap-3", TEXTO_LISTA)}>
          <CircleCheck aria-hidden className="mt-[0.12em] size-[1.1em] shrink-0 fill-info text-card" strokeWidth={2.6} />
          {r}
        </li>
      ))}
    </ul>
  )
}

/*
 * Incidencias y seguimientos del mes, con la propuesta A elegida por la dueña
 * (2026-10-14). Los dos llevan el EVENTO de título. La INCIDENCIA va como un
 * camino con flechas: qué pasó (rojo) → cómo pasó (ámbar) → acción correctiva
 * (verde). El SEGUIMIENTO es una lista con tildes, un renglón por acción. El
 * título de la pantalla lo escribe la analista. Siempre se cargan a mano.
 */
export function VistaIncidencias({
  mes,
  titulo,
  incidencias,
  diasSinIncidentes,
  editar,
}: {
  mes: string
  titulo: string | undefined
  incidencias: Incidencia[]
  /** null = la analista no lo cargó: no hay recuadro. */
  diasSinIncidentes: number | null
  editar: ReactNode
}) {
  const sinNada = incidencias.length === 0 && diasSinIncidentes == null
  return (
    <section aria-label="Incidencias y seguimiento" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <h2 className="text-[clamp(26px,2.4vw,44px)] font-bold uppercase tracking-wide">{titulo?.trim() || TITULO_INCIDENCIAS}</h2>
        <span className="ml-auto flex items-center gap-3">
          {diasSinIncidentes != null && <DiasSinIncidentes dias={diasSinIncidentes} />}
          {editar}
        </span>
      </div>
      {sinNada && <p className={cn("m-auto", TEXTO)}>Todavía no se cargaron incidencias de {nombreMes(mes)}. Esta pantalla no sale al presentar.</p>}
      {incidencias.map((inc, i) => (
        <article key={i} className="flex flex-col gap-4 rounded-xl border p-5">
          <Encabezado inc={inc} />
          {inc.tipo === "INCIDENCIA" ? <Camino inc={inc} /> : <ListaSeguimiento inc={inc} />}
        </article>
      ))}
    </section>
  )
}
