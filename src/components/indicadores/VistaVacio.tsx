import { useState, type CSSProperties } from "react"
import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { capital, nombreMes, sumarMeses } from "@/lib/indicadores/calculos"
import { colorVacio } from "@/components/indicadores/colores"
import { GraficoEficiencia } from "@/components/indicadores/GraficoEficiencia"
import { Kpi } from "@/components/indicadores/Kpi"
import { Observacion } from "@/components/indicadores/Observacion"
import { EFICIENCIA_VACIO, ELEGIDAS_VACIO, PRESENTACIONES_VACIO } from "@/components/indicadores/vacioMuestra"

const Titulo = ({ children }: { children: string }) => <h3 className="text-center text-[0.9375rem] font-bold tracking-wide text-[var(--c-texto)]">{children}</h3>

const porCodigo = (codigo: string) => PRESENTACIONES_VACIO.find((p) => p.codigo === codigo) ?? PRESENTACIONES_VACIO[0]

/** Lista de fallas a mano, solo nombres numerados: se escribe, se quita y se agrega. */
function ListaFallas({ nombres, onCambio }: { nombres: string[]; onCambio: (nombres: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {nombres.map((n, i) => (
        <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-1.5">
          <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
          <Input value={n} aria-label={`Falla ${i + 1}`} placeholder="Nombre de la falla" onChange={(e) => onCambio(nombres.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" aria-label={`Quitar falla ${i + 1}`} className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => onCambio(nombres.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button type="button" className="inline-flex w-fit items-center gap-1 rounded-sm border border-dashed px-2.5 py-1 text-xs font-semibold" onClick={() => onCambio([...nombres, ""])}>
        <Plus className="size-3.5" /> Agregar falla
      </button>
    </div>
  )
}

/*
 * Vacío (previa con datos de ejemplo): una sola eficiencia, las fallas a mano y
 * una columna por cada una de las dos presentaciones elegidas (AL-340, V-250,
 * V-114 o V-186, cualquiera en cualquiera). Cada columna: cajas producidas (el
 * número más grande), merma de empaque y merma de semielaborado, sin
 * comparación con otros meses. Sin TOTAL ASÉPTICO. Nada se guarda todavía.
 */
export function VistaVacio({ mes, puedeEditar }: { mes: string; puedeEditar: boolean }) {
  const [elegidas, setElegidas] = useState<[string, string]>(ELEGIDAS_VACIO)
  const [fallas, setFallas] = useState<Record<string, string[]>>(() => Object.fromEntries(PRESENTACIONES_VACIO.map((p) => [p.codigo, p.fallas])))
  const [observaciones, setObservaciones] = useState<Record<string, string>>({})

  const meses = [sumarMeses(mes, -2), sumarMeses(mes, -1), mes]
  const serie = (valores: number[]) => meses.map((m, i) => ({ mes: m, valor: valores[i] ?? null }))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-xs text-muted-foreground">Vista previa con datos de ejemplo: lo que se escribe aquí todavía no se guarda.</p>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]" style={colorVacio(0)}>
        <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
          <section aria-label="Eficiencia de Vacío" className="flex h-[38%] min-h-[190px] flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5">
            <h2 className="flex items-baseline gap-2 text-base font-bold tracking-wider text-[var(--c-texto)]">
              EFICIENCIA <span className="text-xs font-medium tracking-normal text-foreground">Vacío</span>
            </h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-[var(--c)]" />
                {capital(nombreMes(mes))}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-[var(--c)] opacity-45" />
                Meses anteriores
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block w-3.5 border-t-2 border-dashed border-muted-foreground" />
                Estándar 85 %
              </span>
            </div>
            <GraficoEficiencia serie={serie(EFICIENCIA_VACIO)} />
          </section>
          <section aria-label="Fallas" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border bg-card px-3 py-2.5">
            <h2 className="text-[0.92em] font-semibold uppercase tracking-wider text-foreground">Fallas</h2>
            {elegidas.map((codigo, i) => (
              <div key={i} style={colorVacio(i)} className="flex flex-col gap-1.5 border-l-4 border-[var(--c)] py-1 pl-2.5">
                <span className="text-[1.2em] font-bold text-[var(--c-texto)]">{codigo}</span>
                <ListaFallas nombres={fallas[codigo] ?? []} onCambio={(lista) => setFallas({ ...fallas, [codigo]: lista })} />
              </div>
            ))}
          </section>
        </div>

        {elegidas.map((codigo, i) => {
          const p = porCodigo(codigo)
          return (
            <section
              key={i}
              aria-label={`Presentación ${i + 1}`}
              data-ajusta-texto
              style={colorVacio(i) as CSSProperties}
              className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border-2 border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_8%,var(--card))] px-3 pb-3"
            >
              <h2 className="-mx-3 flex items-baseline gap-2 rounded-t-[10px] bg-[var(--c)] px-3 py-1.5 text-[1.375rem] font-bold text-[var(--c-cab)]">
                <select
                  aria-label={`Presentación de la columna ${i + 1}`}
                  value={codigo}
                  onChange={(e) => setElegidas(i === 0 ? [e.target.value, elegidas[1]] : [elegidas[0], e.target.value])}
                  className="cursor-pointer rounded-md border-2 border-dashed border-[var(--c-cab)]/60 bg-transparent px-1 text-[1.375rem] font-bold text-[var(--c-cab)]"
                >
                  {PRESENTACIONES_VACIO.map((o) => (
                    <option key={o.codigo} value={o.codigo} className="bg-background text-base font-normal text-foreground">
                      {o.codigo} · {o.unidad}
                    </option>
                  ))}
                </select>
              </h2>
              <Titulo>CAJAS PRODUCIDAS</Titulo>
              <Kpi serie={serie(p.cajas)} mayorEsMejor horizontal sinComparacion claseValor="text-[clamp(2.4rem,17cqi,4.5rem)]" />
              <Titulo>MERMA DE EMPAQUE</Titulo>
              <Kpi serie={serie(p.mermaEmpaque)} decimales={1} unidad=" %" mayorEsMejor={false} horizontal sinComparacion />
              <Titulo>MERMA DE SEMIELABORADO</Titulo>
              <Kpi serie={serie(p.mermaSemi)} decimales={1} unidad=" %" mayorEsMejor={false} horizontal sinComparacion />
              <Observacion
                titulo={<Titulo>OBSERVACIONES</Titulo>}
                texto={observaciones[`${i}|${codigo}`]}
                placeholder="Qué pasó en el mes con esta presentación"
                puedeEditar={puedeEditar}
                onGuardar={async (texto) => {
                  setObservaciones((o) => ({ ...o, [`${i}|${codigo}`]: texto }))
                  return { ok: true as const }
                }}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
