import type { ReactNode } from "react"
import { ausentismoTotal, nombreMes } from "@/lib/indicadores/calculos"
import type { Ausentismo, DatosMes } from "@/lib/indicadores/tipos"
import { GruposAusentismo } from "@/components/indicadores/GruposAusentismo"
import { Kpi } from "@/components/indicadores/Kpi"
import { fmt } from "@/components/indicadores/formato"

/** Horas como en el informe: con decimal solo si lo tiene (7.418,5 · 562). */
const horas = (h: number | null) => fmt(h, h != null && !Number.isInteger(h) ? 1 : 0)

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-card px-4 py-4 text-center">
      <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      <span className="font-mono text-5xl font-semibold tabular-nums">{valor}</span>
      <span className="text-sm text-muted-foreground">{detalle}</span>
    </div>
  )
}

/*
 * Ausentismo del mes, con la estructura del informe: horas teóricas, % total,
 * horas perdidas y, por grupo (GruposAusentismo), el % de ausentismo, la parte de
 * las horas perdidas y quién incidió más. Siempre se carga a mano (dueña, 2026-10-14).
 */
export function VistaAusentismo({ meses, editar }: { meses: { mes: string; datos: DatosMes | null }[]; editar: ReactNode }) {
  const elegido = meses[meses.length - 1]
  const a: Ausentismo | null = elegido.datos?.ausentismo ?? null
  const serie = meses.map((m) => ({ mes: m.mes, valor: ausentismoTotal(m.datos?.ausentismo?.horasPerdidas ?? null, m.datos?.ausentismo?.horasTeoricas ?? null) }))

  return (
    <section aria-label="Ausentismo" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
        <h2 className="text-[28px] font-bold tracking-wide">AUSENTISMO</h2>
        <span className="text-sm text-muted-foreground">Índice de ausentismo laboral</span>
        <span className="ml-auto">{editar}</span>
      </div>

      {!a ? (
        <p className="m-auto text-muted-foreground">Sin datos de ausentismo en {nombreMes(elegido.mes)}.</p>
      ) : (
        // Todo centrado y grande, repartido en el alto de la pantalla (dueña, 2026-10-14).
        <div className="flex flex-1 flex-col justify-evenly gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Dato titulo="Horas teóricas" valor={horas(a.horasTeoricas)} detalle="Horas planificadas del período" />
            <div className="flex flex-col justify-center rounded-xl border py-2">
              <Kpi
                titulo={<span className="text-sm tracking-wider text-muted-foreground">% AUSENTISMO TOTAL</span>}
                serie={serie}
                decimales={2}
                unidad=" %"
                mayorEsMejor={false}
                centrado
                sinExtremos
                claseValor="text-5xl"
                detalle="Horas perdidas ÷ horas teóricas"
              />
            </div>
            <Dato titulo="Horas perdidas" valor={horas(a.horasPerdidas)} detalle="En el mes" />
          </div>

          <GruposAusentismo grupos={a.grupos} />
        </div>
      )}
    </section>
  )
}
