import { capital, nombreMes, totalAseptico } from "@/lib/indicadores/calculos"
import type { DatosMes, ModoMes } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { fmt } from "@/components/indicadores/formato"

const tono = (pct: number | null) => (pct == null ? "text-muted-foreground" : pct >= 100 ? "text-success-foreground" : "text-foreground")

/**
 * TOTAL ASÉPTICO, fijo bajo los filtros en todas las pantallas (dueña,
 * 2026-10-14): cajas y cumplimiento del mes elegido, y el cumplimiento de
 * los 2 meses anteriores al lado. `meses` va del más viejo al elegido.
 */
export function FranjaTotal({ meses }: { meses: { mes: string; modo: ModoMes; datos: DatosMes | null }[] }) {
  const elegido = meses[meses.length - 1]
  const t = totalAseptico(elegido.datos, elegido.modo)
  const anteriores = meses.slice(0, -1).reverse()

  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5 rounded-xl border bg-card px-4 py-1">
      <span className="text-sm font-bold tracking-wider">TOTAL ASÉPTICO</span>
      <span className="text-sm text-muted-foreground">
        {capital(nombreMes(elegido.mes))}:{" "}
        <b className="font-mono text-base text-foreground">{fmt(t.prod)}</b> de <b className="font-mono text-base text-foreground">{fmt(t.plan)}</b> cajas
      </span>
      <span className="text-sm text-muted-foreground">
        Cumplimiento <b className={cn("font-mono text-lg", tono(t.cumplimiento))}>{t.cumplimiento == null ? "—" : `${fmt(t.cumplimiento)} %`}</b>
      </span>
      {anteriores.map((m) => {
        const c = totalAseptico(m.datos, m.modo).cumplimiento
        return (
          <span key={m.mes} className="text-sm text-muted-foreground">
            {capital(nombreMes(m.mes))} <b className={cn("font-mono", tono(c))}>{c == null ? "—" : `${fmt(c)} %`}</b>
          </span>
        )
      })}
    </div>
  )
}
