import type { CSSProperties } from "react"
import { Star } from "lucide-react"
import type { AusentismoGrupo } from "@/lib/indicadores/tipos"
import { fmt } from "@/components/indicadores/formato"

const colorGrupo = (g: string) => ({ "--c": `var(--ind-g${g})` }) as CSSProperties

/** Anillo con el % del grupo, como en el informe. */
function Dona({ pct }: { pct: number | null }) {
  const r = 42, c = 2 * Math.PI * r
  const parte = Math.max(0, Math.min(100, pct ?? 0)) / 100
  return (
    <svg viewBox="0 0 110 110" className="size-[clamp(90px,14vh,170px)] shrink-0" role="img" aria-label={pct == null ? "Sin dato" : `${fmt(pct, 2)} %`}>
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

/** Flecha de punta a punta: marca el ancho de su tramo de la barra. */
function Flecha() {
  return (
    <div className="flex items-center" aria-hidden>
      <span className="border-y-[6px] border-r-[9px] border-y-transparent border-r-[var(--c)]" />
      <span className="h-0.5 flex-1 bg-[var(--c)]" />
      <span className="border-y-[6px] border-l-[9px] border-y-transparent border-l-[var(--c)]" />
    </div>
  )
}

/**
 * Cómo se reparten las horas perdidas: una barra con un tramo por grupo,
 * separados por un borde y con su % adentro; encima, una flecha de punta a
 * punta con el grupo. Así se ve cuánto ocupa cada uno (dueña, 2026-10-14).
 */
function DistribucionPerdidas({ grupos }: { grupos: AusentismoGrupo[] }) {
  const tramos = grupos.filter((g) => (g.partePerdidas ?? 0) > 0)
  if (tramos.length === 0) return null
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-semibold uppercase tracking-wider text-foreground">Distribución de las horas perdidas por grupo</span>
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex w-full gap-1.5">
          {tramos.map((g) => (
            <div key={g.grupo} style={{ ...colorGrupo(g.grupo), flexGrow: g.partePerdidas!, flexBasis: 0 }} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-center text-[clamp(0.875rem,1.2vw,1.25rem)] font-bold">
                Grupo {g.grupo}
              </span>
              <Flecha />
            </div>
          ))}
        </div>
        <div className="flex h-[clamp(36px,5.5vh,56px)] w-full gap-1.5">
          {tramos.map((g) => (
            <div
              key={g.grupo}
              style={{ ...colorGrupo(g.grupo), flexGrow: g.partePerdidas!, flexBasis: 0 }}
              className="grid min-w-0 place-items-center rounded-md border-2 border-foreground/25 bg-[var(--c)]"
              title={`Grupo ${g.grupo}: ${fmt(g.partePerdidas, 2)} %`}
            >
              <span className="truncate font-mono text-[clamp(1.125rem,1.7vw,1.875rem)] font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
                {fmt(g.partePerdidas, 2)} %
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/*
 * Los 3 grupos como en el informe: tarjeta con el anillo del % de
 * ausentismo y quién incidió más (la estrella al mayor), y debajo cómo se
 * reparten las horas perdidas.
 */
export function GruposAusentismo({ grupos }: { grupos: AusentismoGrupo[] }) {
  // El grupo con más ausentismo lleva la estrella, como en el informe.
  const conDato = grupos.filter((g) => g.porcentaje != null)
  const mayor = conDato.length ? conDato.reduce((x, y) => (y.porcentaje! > x.porcentaje! ? y : x)).grupo : null

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {grupos.map((g) => (
          <div key={g.grupo} style={colorGrupo(g.grupo)} className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-[var(--c)] p-3 text-center">
            <b className="text-2xl">Grupo {g.grupo}</b>
            <Dona pct={g.porcentaje} />
            <span className="text-base text-foreground">
              Quien incidió más: <b className="text-foreground">{g.quien || "—"}</b>
              {g.dias != null && ` (${fmt(g.dias)} ${g.dias === 1 ? "día" : "días"})`}
            </span>
            {mayor === g.grupo && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-danger-soft px-2.5 py-0.5 text-sm font-semibold text-danger">
                <Star className="size-4 fill-current" /> Mayor incidencia del período
              </span>
            )}
          </div>
        ))}
      </div>
      <DistribucionPerdidas grupos={grupos} />
    </>
  )
}
