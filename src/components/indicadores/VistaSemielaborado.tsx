import type { CSSProperties, ReactNode } from "react"
import { capital, nombreMes } from "@/lib/indicadores/calculos"
import { claveSemi } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { colorFamilia, nombreFamilia } from "@/components/indicadores/colores"
import { GraficoFamilia } from "@/components/indicadores/GraficoFamilia"
import { Kpi } from "@/components/indicadores/Kpi"
import { TablaSemielaborado } from "@/components/indicadores/TablaSemielaborado"
import type { MesIndicadores } from "@/components/indicadores/useIndicadores"
import { fmt } from "@/components/indicadores/formato"

export type VistaSemi = "graficas" | "tabla"

export interface PropsFamilias {
  /** Productos con dato en el mes elegido, en orden. */
  familias: string[]
  /** La observación de un producto; `titulo` se esconde con ella si está vacía. */
  renderObservacion: (clave: string, titulo?: ReactNode) => ReactNode
}

/** Orden del informe; las familias nuevas van al final. */
const ORDEN = ["Clasicos", "Clásicos", "Selecto", "Jucosa", "Premium", "Especiales"]
const posicion = (f: string) => (ORDEN.includes(f) ? ORDEN.indexOf(f) : ORDEN.length)

/*
 * Semielaborado: rendimiento por producto (familia) contra el 100 %, en
 * gráficas o en tabla. Cada producto con el color de su envase. Un producto
 * sin dato en el mes elegido no aparece.
 */
export function VistaSemielaborado({
  meses,
  vista,
  onVista,
  renderObservacion,
}: {
  meses: MesIndicadores[]
  vista: VistaSemi
  onVista: (v: VistaSemi) => void
  renderObservacion: (clave: string, titulo?: ReactNode) => ReactNode
}) {
  const elegido = meses[meses.length - 1]
  const familias = Object.entries(elegido.datos?.semielaborado ?? {})
    .filter(([, v]) => v != null)
    .map(([f]) => f)
    .sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b))

  return (
    <section aria-label="Semielaborado" className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-xl border bg-card p-3" style={colorFamilia("Clasicos")}>
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[28px] font-bold tracking-wide text-[var(--c-texto)]">SEMIELABORADO</h2>
        <span className="text-sm text-foreground">Rendimiento por producto · estándar 100 %</span>
        <div role="group" aria-label="Ver como" className="ml-auto inline-flex rounded-full border bg-card p-0.5">
          {(["graficas", "tabla"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => onVista(v)}
              className={cn("rounded-full px-3.5 py-1 text-[12.5px] font-semibold text-foreground", vista === v && "bg-[var(--c)] text-[var(--c-cab)]")}
            >
              {v === "graficas" ? "Gráficas" : "Tabla"}
            </button>
          ))}
        </div>
      </div>

      {familias.length === 0 ? (
        <p className="m-auto text-foreground">Todavía no hay semielaborado de {nombreMes(elegido.mes)}. Esta pantalla no sale al presentar.</p>
      ) : vista === "tabla" ? (
        <TablaSemielaborado familias={familias} meses={meses} renderObservacion={renderObservacion} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:[grid-template-columns:var(--columnas)]" style={{ "--columnas": `repeat(${familias.length}, minmax(0, 1fr))` } as CSSProperties}>
          {familias.map((f) => {
            const serie = meses.map((m) => ({ mes: m.mes, valor: m.datos?.semielaborado[f] ?? null }))
            const v = serie[serie.length - 1].valor
            return (
              <div key={f} data-ajusta-texto style={colorFamilia(f)} className="flex min-h-0 flex-col gap-2 rounded-xl border-2 border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_7%,var(--card))] px-3 pb-3">
                <h3 className="-mx-3 flex items-baseline justify-between rounded-t-[10px] bg-[var(--c)] px-3 py-1.5 text-xl font-bold text-[var(--c-cab)]">
                  {nombreFamilia(f)} <span className="text-xs font-semibold opacity-85">{capital(nombreMes(elegido.mes))}</span>
                </h3>
                <Kpi
                  serie={serie}
                  decimales={1}
                  unidad=" %"
                  mayorEsMejor
                  centrado
                  grande
                  estado={v == null ? null : { ok: v >= 99, texto: v >= 99 ? "≈100 %" : "<99 %" }}
                  detalle={v == null ? undefined : <>Merma <b>{fmt(100 - v, 1)} %</b></>}
                />
                <GraficoFamilia serie={serie} />
                {renderObservacion(claveSemi(f), <h4 className="text-[13px] font-bold tracking-wide text-[var(--c-texto)]">OBSERVACIONES</h4>)}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
