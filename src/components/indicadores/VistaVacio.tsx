import { useState, type ReactNode } from "react"
import { capital, nombreMes } from "@/lib/indicadores/calculos"
import type { DatosMes } from "@/lib/indicadores/tipos"
import { claveVacio, elegidasPorDefecto, PRESENTACIONES_VACIO, tieneVacio } from "@/lib/indicadores/vacio"
import { colorVacio } from "@/components/indicadores/colores"
import { GraficoEficiencia } from "@/components/indicadores/GraficoEficiencia"
import { Kpi } from "@/components/indicadores/Kpi"
import { Observacion } from "@/components/indicadores/Observacion"

const Titulo = ({ children }: { children: string }) => <h3 className="text-center text-[0.9375rem] font-bold tracking-wide text-[var(--c-texto)]">{children}</h3>

/** Paradas cargadas a mano: solo los nombres, numerados. */
function ListaParadas({ nombres }: { nombres: string[] }) {
  return (
    <ol className="flex flex-col gap-1 leading-snug">
      {nombres.map((n, i) => (
        <li key={`${i}-${n}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
          <span className="break-words" title={n}>
            {n}
          </span>
        </li>
      ))}
    </ol>
  )
}

/*
 * Vacío (todo a mano, dueña 2026-11-05): una sola eficiencia, las paradas de
 * las dos presentaciones elegidas y una columna por cada una (AL-340, V-250,
 * V-114 o V-186, cualquiera en cualquiera). Cada columna: cajas producidas (el
 * número más grande), cajas planificadas, merma de empaque y merma de
 * semielaborado, sin comparación con otros meses. Sin TOTAL ASÉPTICO.
 * `meses` va del más viejo al elegido (lo guardado a mano).
 */
export function VistaVacio({
  meses,
  observaciones,
  puedeEditar,
  onGuardarObservacion,
  editar,
}: {
  meses: { mes: string; datos: DatosMes | null }[]
  observaciones: Record<string, string>
  puedeEditar: boolean
  onGuardarObservacion: (clave: string, texto: string) => Promise<{ ok: true } | { ok: false; error: string }>
  editar: ReactNode
}) {
  const elegido = meses[meses.length - 1]
  const [elegidas, setElegidas] = useState<[string, string]>(() => elegidasPorDefecto(elegido.datos))

  if (!tieneVacio(elegido.datos)) {
    return (
      <section aria-label="Vacío" className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-baseline gap-x-3.5">
          <h2 className="text-[1.75rem] font-bold tracking-wide text-[var(--ind-vacio-texto)]">VACÍO</h2>
          <span className="ml-auto">{editar}</span>
        </div>
        <p className="m-auto text-foreground">Todavía no se cargó Vacío de {nombreMes(elegido.mes)}. Esta pantalla no sale al presentar.</p>
      </section>
    )
  }

  const deMes = (m: { datos: DatosMes | null }, codigo: string) => m.datos?.vacio?.presentaciones?.[codigo]
  const serie = (valor: (m: { datos: DatosMes | null }) => number | null | undefined) => meses.map((m) => ({ mes: m.mes, valor: valor(m) ?? null }))
  const nombresParadas = (codigo: string) => (deMes(elegido, codigo)?.paradas ?? []).map((p) => p.causa.trim()).filter(Boolean)
  const verParadas = elegidas.some((c) => nombresParadas(c).length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {editar && <div className="flex justify-end">{editar}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]" style={colorVacio(0)}>
        <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
          <section aria-label="Eficiencia de Vacío" className={`flex min-h-[190px] flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5 ${verParadas ? "h-[38%]" : "flex-1"}`}>
            <h2 className="flex items-baseline gap-2 text-base font-bold tracking-wider text-[var(--c-texto)]">
              EFICIENCIA <span className="text-xs font-medium tracking-normal text-foreground">Vacío</span>
            </h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-sm bg-[var(--c)]" />
                {capital(nombreMes(elegido.mes))}
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
            <GraficoEficiencia serie={serie((m) => m.datos?.vacio?.eficiencia)} />
          </section>
          {verParadas && (
            <section aria-label="Paradas" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border bg-card px-3 py-2.5">
              <h2 className="text-[0.92em] font-semibold uppercase tracking-wider text-foreground">Paradas</h2>
              {elegidas.map((codigo, i) =>
                nombresParadas(codigo).length === 0 ? null : (
                  <div key={i} style={colorVacio(i)} className="flex flex-col gap-1.5 border-l-4 border-[var(--c)] py-1 pl-2.5">
                    <span className="text-[1.2em] font-bold text-[var(--c-texto)]">{codigo}</span>
                    <ListaParadas nombres={nombresParadas(codigo)} />
                  </div>
                ),
              )}
            </section>
          )}
        </div>

        {elegidas.map((codigo, i) => (
          <section
            key={i}
            aria-label={`Presentación ${i + 1}`}
            data-ajusta-texto
            style={colorVacio(i)}
            className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto rounded-xl border-2 border-[var(--c)] bg-[color-mix(in_srgb,var(--c)_8%,var(--card))] px-3 pb-3"
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
            <Kpi serie={serie((m) => deMes(m, codigo)?.cajas)} mayorEsMejor horizontal sinComparacion claseValor="text-[clamp(2.4rem,17cqi,4.5rem)]" />
            <Titulo>CAJAS PLANIFICADAS</Titulo>
            <Kpi serie={serie((m) => deMes(m, codigo)?.cajasPlan)} mayorEsMejor horizontal sinComparacion />
            <Titulo>MERMA DE EMPAQUE</Titulo>
            <Kpi serie={serie((m) => deMes(m, codigo)?.mermaEmpaque)} decimales={1} unidad=" %" mayorEsMejor={false} horizontal sinComparacion />
            <Titulo>MERMA DE SEMIELABORADO</Titulo>
            <Kpi serie={serie((m) => deMes(m, codigo)?.mermaSemi)} decimales={1} unidad=" %" mayorEsMejor={false} horizontal sinComparacion />
            <Observacion
              titulo={<Titulo>OBSERVACIONES</Titulo>}
              texto={observaciones[claveVacio(codigo)]}
              placeholder="Qué pasó en el mes con esta presentación"
              puedeEditar={puedeEditar}
              onGuardar={(texto) => onGuardarObservacion(claveVacio(codigo), texto)}
            />
          </section>
        ))}
      </div>
    </div>
  )
}
