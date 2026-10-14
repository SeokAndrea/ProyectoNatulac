import type { CSSProperties } from "react"
import { Star } from "lucide-react"
import type { AusentismoGrupo } from "@/lib/indicadores/tipos"
import { fmt } from "@/components/indicadores/formato"

const colorGrupo = (g: string) => ({ "--c": `var(--ind-g${g})` }) as CSSProperties

/** Barra horizontal desde 0; `max` llena su pista. El número va al lado, con su propio lugar. */
function Barra({ valor, max }: { valor: number | null; max: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        {valor != null && max > 0 && <div style={{ width: `${(valor / max) * 100}%` }} className="h-[clamp(28px,4.5vh,48px)] rounded-md bg-[var(--c)]" />}
      </div>
      <span className="w-[5.2em] shrink-0 font-mono text-[clamp(20px,1.9vw,34px)] font-semibold tabular-nums">{valor == null ? "—" : `${fmt(valor, 2)} %`}</span>
    </div>
  )
}

const encabezado = "text-[clamp(12px,0.95vw,16px)] font-semibold uppercase tracking-wider text-muted-foreground"

/**
 * Los 3 grupos en filas, para comparar de un vistazo: % de ausentismo y % de
 * las horas perdidas en barras, cada columna en su escala (la mayor llega al
 * borde), y quién incidió más. En anillos o en una barra apilada no se veía la
 * diferencia (dueña, 2026-10-14). El grupo con más ausentismo lleva la estrella.
 */
export function GruposAusentismo({ grupos }: { grupos: AusentismoGrupo[] }) {
  const maxPct = Math.max(0, ...grupos.map((g) => g.porcentaje ?? 0))
  const maxParte = Math.max(0, ...grupos.map((g) => g.partePerdidas ?? 0))
  const conDato = grupos.filter((g) => g.porcentaje != null)
  const mayor = conDato.length ? conDato.reduce((x, y) => (y.porcentaje! > x.porcentaje! ? y : x)).grupo : null

  return (
    <div className="grid grid-cols-1 items-center gap-x-6 gap-y-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
      <span className="max-lg:hidden" />
      <span className={encabezado + " max-lg:hidden"}>% de ausentismo</span>
      <span className={encabezado + " max-lg:hidden"}>% de las horas perdidas</span>
      <span className={encabezado + " max-lg:hidden"}>Quién incidió más</span>
      {grupos.map((g) => (
        <div key={g.grupo} style={colorGrupo(g.grupo)} className="contents">
          <b className="flex items-center gap-2 whitespace-nowrap border-l-[6px] border-[var(--c)] pl-3 text-[clamp(20px,1.9vw,32px)] max-lg:mt-2">
            Grupo {g.grupo}
            {mayor === g.grupo && <Star className="size-[0.8em] fill-danger text-danger" aria-label="Mayor incidencia del período" />}
          </b>
          <Barra valor={g.porcentaje} max={maxPct} />
          <Barra valor={g.partePerdidas} max={maxParte} />
          <span className="text-[clamp(16px,1.35vw,24px)] leading-tight">
            <b>{g.quien || "—"}</b>
            {g.dias != null && <span className="text-muted-foreground"> · {fmt(g.dias)} {g.dias === 1 ? "día" : "días"}</span>}
          </span>
        </div>
      ))}
      {mayor && (
        <span className="text-[clamp(13px,1vw,17px)] text-muted-foreground lg:col-span-4">
          <Star className="inline size-[1em] fill-danger text-danger" /> Mayor incidencia del período
        </span>
      )}
    </div>
  )
}
