import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { textoSeguimiento } from "@/lib/indicadores/calculos"
import { incidenciaVacia, TITULO_INCIDENCIAS, type DatosMes, type Incidencia } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { CampoNumero } from "./CampoNumero"

const TEXTOS: { campo: keyof Pick<Incidencia, "quePaso" | "comoPaso" | "accionCorrectiva">; titulo: string }[] = [
  { campo: "quePaso", titulo: "Qué pasó" },
  { campo: "comoPaso", titulo: "Cómo pasó" },
  { campo: "accionCorrectiva", titulo: "Acción correctiva" },
]

/** Pestaña de incidencias y seguimientos: una o varias, con evento. Incidencia = formato del informe; seguimiento = un texto. */
export function EditorIncidencias({ datos, onCambio }: { datos: DatosMes; onCambio: (d: DatosMes) => void }) {
  const lista = datos.incidencias ?? []
  const guardar = (nueva: Incidencia[]) => onCambio({ ...datos, incidencias: nueva })
  const cambiar = (i: number, cambio: Partial<Incidencia>) => guardar(lista.map((x, j) => (j === i ? { ...x, ...cambio } : x)))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 max-w-md flex-1 flex-col gap-1 text-[11.5px] font-semibold text-muted-foreground">
          Título de la pantalla
          <Input
            value={datos.tituloIncidencias ?? ""}
            onChange={(e) => onCambio({ ...datos, tituloIncidencias: e.target.value })}
            placeholder={TITULO_INCIDENCIAS}
            maxLength={60}
          />
        </label>
        <CampoNumero
          etiqueta="Días sin incidentes"
          entero
          valor={datos.diasSinIncidentes ?? null}
          onCambio={(v) => onCambio({ ...datos, diasSinIncidentes: v })}
          className="w-40"
        />
      </div>
      {lista.map((inc, i) => (
        <section key={i} className="flex flex-col gap-2.5 rounded-xl border-2 bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Tipo" className="inline-flex rounded-full border p-0.5">
              {(["INCIDENCIA", "SEGUIMIENTO"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={inc.tipo === t}
                  onClick={() => cambiar(i, { tipo: t })}
                  className={cn("rounded-full px-3 py-1 text-xs font-bold tracking-wider text-muted-foreground", inc.tipo === t && "bg-primary text-primary-foreground")}
                >
                  {t === "INCIDENCIA" ? "Incidencia" : "Seguimiento"}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="ml-auto gap-1 text-muted-foreground" onClick={() => guardar(lista.filter((_, j) => j !== i))}>
              <X className="size-4" /> Quitar
            </Button>
          </div>
          {/* Los dos llevan evento. Incidencia: el formato del informe; seguimiento: un texto (dueña, 2026-10-14). */}
          <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted-foreground">
            Evento
            <Input value={inc.evento} onChange={(e) => cambiar(i, { evento: e.target.value })} placeholder="Ej.: Bobina TPA-200 en llenadora con formato TPA-250" />
          </label>
          {inc.tipo === "INCIDENCIA" ? (
            <div className="grid gap-2 md:grid-cols-3">
              {TEXTOS.map((t) => (
                <label key={t.campo} className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted-foreground">
                  {t.titulo}
                  <Textarea value={inc[t.campo]} onChange={(e) => cambiar(i, { [t.campo]: e.target.value })} className="min-h-28 text-sm" />
                </label>
              ))}
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-muted-foreground">
              Texto
              {/* Uno cargado antes con qué pasó / cómo pasó / acción arranca con eso junto. */}
              <Textarea value={inc.texto ?? textoSeguimiento(inc)} onChange={(e) => cambiar(i, { texto: e.target.value })} className="min-h-36 text-sm" />
            </label>
          )}
        </section>
      ))}
      <Button variant="outline" size="sm" className="self-start" onClick={() => guardar([...lista, incidenciaVacia()])}>
        + Agregar incidencia o seguimiento
      </Button>
    </div>
  )
}
