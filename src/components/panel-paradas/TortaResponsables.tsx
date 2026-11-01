import type { Reparto } from "@/lib/catalogoFallas/analisis"
import { fmtDuracion } from "@/lib/paradas"

const R = 42
const VUELTA = 2 * Math.PI * R

/**
 * ¿Quién tiene más paradas, Producción o Mantenimiento? Torta (dona) de dos
 * partes por cantidad de paradas, con el total al centro; al lado, cada uno
 * con su % y sus minutos (la identidad nunca va solo por color).
 */
export function TortaResponsables({ produccion, mantenimiento }: { produccion: Reparto; mantenimiento: Reparto }) {
  const total = produccion.veces + mantenimiento.veces
  const pctMtto = total ? Math.round((mantenimiento.veces / total) * 100) : 0
  const lados = [
    { nombre: "Mantenimiento", r: mantenimiento, pct: pctMtto, color: "var(--serie-mtto)" },
    { nombre: "Producción", r: produccion, pct: total ? 100 - pctMtto : 0, color: "var(--serie-op)" },
  ]
  const largoMtto = total ? (mantenimiento.veces / total) * VUELTA : 0

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-card-foreground">¿Quién tiene más paradas?</h2>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">Sin paradas.</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={lados.map((l) => `${l.nombre} ${l.r.veces} paradas (${l.pct} %)`).join(", ")}>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--serie-op)" strokeWidth="14" transform="rotate(-90 50 50)" />
            {mantenimiento.veces > 0 && (
              // 2 de separación entre las partes, del color de la tarjeta.
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--serie-mtto)" strokeWidth="14" transform="rotate(-90 50 50)" strokeDasharray={`${Math.max(0, largoMtto - (produccion.veces ? 2 : 0))} ${VUELTA}`} />
            )}
            <text x="50" y="50" fontSize="20" fontWeight="700" className="fill-foreground font-mono" textAnchor="middle" dominantBaseline="central">
              {total}
            </text>
          </svg>
          <ul className="flex min-w-0 flex-col gap-2 text-xs">
            {lados.map((l) => (
              <li key={l.nombre} className="flex flex-col">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: l.color }} aria-hidden />
                  {l.nombre}
                </span>
                <span className="num pl-4 text-muted-foreground">
                  {l.r.veces} · {l.pct} %
                </span>
                <span className="num pl-4 text-muted-foreground">{fmtDuracion(Math.round(l.r.minutos))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
