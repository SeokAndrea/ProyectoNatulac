import type { CSSProperties, ReactNode } from "react"
import { Star } from "lucide-react"
import { ausentismoTotal, nombreMes } from "@/lib/indicadores/calculos"
import type { Ausentismo, DatosMes } from "@/lib/indicadores/tipos"
import { Kpi } from "@/components/indicadores/Kpi"
import { fmt } from "@/components/indicadores/formato"

/** Horas como en el informe: con decimal solo si lo tiene (7.418,5 · 562). */
const horas = (h: number | null) => fmt(h, h != null && !Number.isInteger(h) ? 1 : 0)

const colorGrupo = (g: string) => ({ "--c": `var(--ind-g${g})` }) as CSSProperties

/** Anillo con el % del grupo, como en el informe. */
function Dona({ pct }: { pct: number | null }) {
  const r = 42, c = 2 * Math.PI * r
  const parte = Math.max(0, Math.min(100, pct ?? 0)) / 100
  return (
    <svg viewBox="0 0 110 110" className="size-28 shrink-0" role="img" aria-label={pct == null ? "Sin dato" : `${fmt(pct, 2)} %`}>
      <circle cx="55" cy="55" r={r} fill="none" strokeWidth="14" className="stroke-muted" />
      {pct != null && (
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--c)" strokeWidth="14" strokeDasharray={`${c * parte} ${c}`} transform="rotate(-90 55 55)" />
      )}
      <text x="55" y="61" textAnchor="middle" className="fill-foreground font-mono text-base font-bold">
        {pct == null ? "—" : `${fmt(pct, 2)}%`}
      </text>
    </svg>
  )
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      <span className="font-mono text-3xl font-semibold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </div>
  )
}

/*
 * Ausentismo del mes, con la estructura del informe: horas teóricas, % total,
 * horas perdidas, el % de cada grupo con quién incidió más, y cómo se
 * reparten las horas perdidas. Siempre se carga a mano (dueña, 2026-10-14).
 */
export function VistaAusentismo({ meses, editar }: { meses: { mes: string; datos: DatosMes | null }[]; editar: ReactNode }) {
  const elegido = meses[meses.length - 1]
  const a: Ausentismo | null = elegido.datos?.ausentismo ?? null
  const serie = meses.map((m) => ({ mes: m.mes, valor: ausentismoTotal(m.datos?.ausentismo?.horasPerdidas ?? null, m.datos?.ausentismo?.horasTeoricas ?? null) }))
  // El grupo con más ausentismo lleva la estrella, como en el informe.
  const conDato = (a?.grupos ?? []).filter((g) => g.porcentaje != null)
  const mayor = conDato.length ? conDato.reduce((x, y) => (y.porcentaje! > x.porcentaje! ? y : x)).grupo : null

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
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Dato titulo="Horas teóricas" valor={horas(a.horasTeoricas)} detalle="Horas planificadas del período" />
            <div className="rounded-xl border">
              <Kpi titulo="% AUSENTISMO TOTAL" serie={serie} decimales={2} unidad=" %" mayorEsMejor={false} centrado grande detalle="Horas perdidas ÷ horas teóricas" />
            </div>
            <Dato titulo="Horas perdidas" valor={horas(a.horasPerdidas)} detalle="En el mes" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {a.grupos.map((g) => (
              <div key={g.grupo} style={colorGrupo(g.grupo)} className="flex items-center gap-3 rounded-xl border-2 border-[var(--c)] p-3">
                <Dona pct={g.porcentaje} />
                <div className="flex min-w-0 flex-col gap-1">
                  <b className="text-lg">Grupo {g.grupo}</b>
                  <span className="text-sm text-muted-foreground">
                    Quien incidió más: <b className="text-foreground">{g.quien || "—"}</b>
                    {g.dias != null && ` (${fmt(g.dias)} ${g.dias === 1 ? "día" : "días"})`}
                  </span>
                  {mayor === g.grupo && (
                    <span className="inline-flex items-center gap-1 self-start rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                      <Star className="size-3.5 fill-current" /> Mayor incidencia del período
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Distribución de las horas perdidas por grupo</span>
            <div className="flex h-9 overflow-hidden rounded-lg bg-muted">
              {a.grupos.map((g) =>
                g.partePerdidas ? (
                  <div key={g.grupo} style={{ ...colorGrupo(g.grupo), width: `${g.partePerdidas}%` }} className="grid place-items-center bg-[var(--c)] text-xs font-bold text-white" title={`Grupo ${g.grupo}: ${fmt(g.partePerdidas, 2)} %`}>
                    {g.partePerdidas >= 8 && `G${g.grupo} · ${fmt(g.partePerdidas, 1)} %`}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
