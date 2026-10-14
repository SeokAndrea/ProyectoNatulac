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

/** Paradas no programadas del mes, por presentación: 3 por tiempo y 3 por veces. Los bloques se reparten todo el alto. */
export function ParadasLinea({ presentaciones }: { presentaciones: { clave: string; nombre: string; color: CSSProperties; paradas: ParadaMes[] }[] }) {
  return (
    <section aria-label="Paradas no programadas" className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border bg-card px-3 py-2.5 max-lg:flex-none">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Paradas no programadas</h2>
      {presentaciones.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
      {presentaciones.map((p) => (
        <div key={p.clave} style={p.color} className="flex min-h-0 flex-[1_1_0] flex-col justify-evenly gap-1 border-l-4 border-[var(--c)] py-1 pl-2.5 max-lg:flex-none">
          <span className="text-[15px] font-bold text-[var(--c-texto)]">{p.nombre}</span>
          <div className="grid flex-1 grid-cols-2 gap-x-3">
            <Lista titulo="Más tiempo" paradas={p.paradas} por="tiempo" />
            <Lista titulo="Más veces" paradas={p.paradas} por="veces" />
          </div>
        </div>
      ))}
    </section>
  )
}
