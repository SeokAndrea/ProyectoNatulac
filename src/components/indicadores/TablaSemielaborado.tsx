import { capital, mesCorto, nombreMes } from "@/lib/indicadores/calculos"
import { claveSemi } from "@/lib/indicadores/tipos"
import { cn } from "@/lib/utils"
import { colorFamilia, nombreFamilia } from "@/components/indicadores/colores"
import { fmt } from "@/components/indicadores/formato"
import type { MesIndicadores } from "@/components/indicadores/useIndicadores"
import type { PropsFamilias } from "@/components/indicadores/VistaSemielaborado"

function Celda({ v }: { v: number | null }) {
  if (v == null) return <span className="text-foreground">—</span>
  const bien = v >= 99
  return (
    <span className="inline-flex min-w-24 flex-col items-center gap-1">
      <span className={cn("font-mono text-xl font-semibold", !bien && "text-danger")}>{fmt(v, 1)} %</span>
      <span className="h-2 w-28 overflow-hidden rounded bg-muted">
        <span className={cn("block h-full rounded", bien ? "bg-success-foreground" : "bg-danger")} style={{ width: `${Math.max(4, Math.min(100, (v - 90) * 10))}%` }} />
      </span>
    </span>
  )
}

/** Semielaborado en tabla: una fila por producto, los 3 meses, la merma y las observaciones del mes elegido. */
export function TablaSemielaborado({ familias, meses, renderObservacion }: PropsFamilias & { meses: MesIndicadores[] }) {
  const elegido = meses[meses.length - 1]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className="h-full max-h-[520px] w-full min-w-[640px] border-separate border-spacing-0 text-[0.9375rem]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-foreground">
              <th className="border-b-2 px-3.5 py-2.5 text-left">Producto</th>
              <th className="border-b-2 px-3.5 py-2.5">Estándar</th>
              {meses.map((m) => (
                <th key={m.mes} className={cn("border-b-2 px-3.5 py-2.5", m === elegido && "bg-muted/60 text-foreground")}>
                  {capital(nombreMes(m.mes))}
                </th>
              ))}
              <th className="border-b-2 px-3.5 py-2.5">Merma {mesCorto(elegido.mes)}</th>
              <th className="border-b-2 px-3.5 py-2.5">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {familias.map((f) => {
              const v = elegido.datos?.semielaborado[f] ?? null
              return (
                <tr key={f} style={colorFamilia(f)} className="text-center">
                  <td className="border-b px-3.5 py-3 text-left">
                    <span className="flex items-center gap-2.5 text-lg font-bold text-[var(--c-texto)]">
                      <i className="h-7 w-1.5 rounded bg-[var(--c)]" />
                      {nombreFamilia(f)}
                    </span>
                  </td>
                  <td className="border-b px-3.5 py-3 font-mono">100 %</td>
                  {meses.map((m) => (
                    <td key={m.mes} className={cn("border-b px-3.5 py-3", m === elegido && "bg-muted/60")}>
                      <Celda v={m.datos?.semielaborado[f] ?? null} />
                    </td>
                  ))}
                  <td className={cn("border-b px-3.5 py-3 font-mono", v != null && v < 99 && "text-danger")}>{v == null ? "—" : `${fmt(100 - v, 1)} %`}</td>
                  <td className="min-w-56 border-b px-3.5 py-3 text-left">{renderObservacion(claveSemi(f))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-4 px-3.5 pt-2 text-xs text-foreground">
        <span>Verde: 99 % o más · Rojo: menos de 99 %</span>
        <span>La barrita va de 90 % (vacía) a 100 % (llena)</span>
        <span>— = sin datos</span>
      </p>
    </div>
  )
}
