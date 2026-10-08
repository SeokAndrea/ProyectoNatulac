import { Check, ChevronRight, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface PuntoCierre {
  /** id de la sección a la que lleva. */
  seccion: string
  titulo: string
  texto: string
  /** "ok" listo · "falta" no deja cerrar · "aviso" recomendado. */
  estado: "ok" | "falta" | "aviso"
}

const MARCA = {
  ok: { clase: "bg-success-soft text-success-foreground", icono: <Check className="size-3.5" /> },
  falta: { clase: "bg-danger-soft text-danger-foreground", icono: <X className="size-3.5" /> },
  aviso: { clase: "bg-warning-soft text-warning-foreground", icono: <span className="text-xs font-bold">!</span> },
} as const

/** Lo que hay que revisar antes de cerrar; cada punto lleva a su sección. */
export function AntesDeCerrar({ puntos }: { puntos: PuntoCierre[] }) {
  const faltan = puntos.filter((p) => p.estado === "falta").length
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 pb-2">
        <CardTitle className="text-base">Antes de cerrar</CardTitle>
        <span className="text-sm text-muted-foreground">
          {faltan === 0 ? "Listo para finalizar" : `Faltan ${faltan} ${faltan === 1 ? "cosa" : "cosas"} para poder cerrar`}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col p-0 pb-1">
        {puntos.map((p) => (
          <button
            key={p.seccion}
            type="button"
            onClick={() => document.getElementById(p.seccion)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-6 py-2.5 text-left first:border-t-0 hover:bg-muted/50"
          >
            <span className={`grid size-6 place-items-center rounded-full ${MARCA[p.estado].clase}`} aria-hidden="true">
              {MARCA[p.estado].icono}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{p.titulo}</span>
              <span className="block text-sm text-muted-foreground">{p.texto}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
