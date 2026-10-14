import type { CSSProperties } from "react"
import { topParadas } from "@/lib/indicadores/calculos"
import type { ParadaMes } from "@/lib/indicadores/tipos"
import { fmt, fmtHoras } from "@/components/indicadores/formato"

function Lista({ titulo, paradas, por }: { titulo: string; paradas: ParadaMes[]; por: "tiempo" | "veces" }) {
  const top = topParadas(paradas, por)
  return (
    <div className="flex min-w-0 flex-col justify-evenly gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {top.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
      {top.map((p, i) => (
        <div
          key={p.causa}
          title={`${p.causa}\n${p.minutos == null ? "—" : fmt(p.minutos)} min · ${p.veces == null ? "—" : p.veces} veces`}
          className="grid grid-cols-[17px_minmax(0,1fr)_auto] items-center gap-1.5 text-[12.5px] leading-normal"
        >
          <span className="grid size-[17px] place-items-center rounded-full bg-muted text-[10.5px] font-bold">{i + 1}</span>
          <span className="truncate">{p.causa}</span>
          <span className="font-mono text-xs text-muted-foreground">{por === "tiempo" ? fmtHoras(p.minutos) : p.veces == null ? "—" : `${p.veces}×`}</span>
        </div>
      ))}
    </div>
  )
}

/** Cargadas a mano: solo los nombres, numerados, sin tiempo ni veces (dueña, 2026-10-14). */
function ListaNombres({ paradas }: { paradas: ParadaMes[] }) {
  const nombres = paradas.map((p) => p.causa.trim()).filter(Boolean)
  if (nombres.length === 0) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <ol className="flex flex-col gap-0.5 text-[12.5px]">
      {nombres.map((n, i) => (
        <li key={`${i}-${n}`} className="grid grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5">
          <span className="grid size-[17px] place-items-center rounded-full bg-muted text-[10.5px] font-bold">{i + 1}</span>
          <span className="truncate" title={n}>
            {n}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Paradas del mes, por presentación. Automático: 3 por tiempo y 3 por veces.
 * Manual: la lista de lo cargado, solo los nombres, con las GENERALES (las
 * mismas en las 3 líneas) arriba. Los bloques se reparten todo el alto.
 */
export function ParadasLinea({
  presentaciones,
  manual,
  generales = [],
}: {
  presentaciones: { clave: string; nombre: string; color: CSSProperties; paradas: ParadaMes[] }[]
  manual: boolean
  /** Solo en manual. */
  generales?: ParadaMes[]
}) {
  return (
    <section aria-label="Paradas" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border bg-card px-3 py-2.5 max-lg:flex-none">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{manual ? "Paradas" : "Paradas no programadas"}</h2>
      {manual && generales.some((p) => p.causa.trim()) && (
        <div className="flex min-h-0 flex-[1_1_0] flex-col justify-evenly gap-1 border-l-4 border-muted-foreground py-1 pl-2.5 max-lg:flex-none">
          <span className="text-[15px] font-bold">GENERALES</span>
          <ListaNombres paradas={generales} />
        </div>
      )}
      {presentaciones.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
      {presentaciones.map((p) => (
        <div key={p.clave} style={p.color} className="flex min-h-0 flex-[1_1_0] flex-col justify-evenly gap-1 border-l-4 border-[var(--c)] py-1 pl-2.5 max-lg:flex-none">
          <span className="text-[15px] font-bold text-[var(--c-texto)]">{p.nombre}</span>
          {manual ? (
            <ListaNombres paradas={p.paradas} />
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-x-3">
              <Lista titulo="Más tiempo" paradas={p.paradas} por="tiempo" />
              <Lista titulo="Más veces" paradas={p.paradas} por="veces" />
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
