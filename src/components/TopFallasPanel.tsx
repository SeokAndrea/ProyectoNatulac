import {
  COLOR_CLASE,
  duracionMin,
  fmtDuracion,
  NOMBRE_CLASE,
  porTipo,
  resumenPorClase,
  type Parada,
} from "@/lib/paradas"

/*
 * "Top Fallas" del Panel de Producción: el downtime del turno repartido
 * por clase (Programada / No programada / Ocioso) y por línea, con los
 * tipos que más pesaron en cada una. Componente puro — recibe las
 * paradas ya filtradas al turno. FASE A′: el Panel le pasa el fixture;
 * FASE B′: paradas_de_turno().
 */

export function TopFallasPanel({
  paradas,
  lineas,
}: {
  paradas: Parada[]
  lineas: { codigo: string; nombre: string; activo?: boolean }[]
}) {
  if (paradas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin paradas registradas para este turno.</p>
  }

  const ahora = new Date()
  const porClase = resumenPorClase(paradas, ahora).filter((c) => c.veces > 0)
  const totalMin = paradas.reduce((a, p) => a + duracionMin(p, ahora), 0)

  return (
    <div className="flex flex-col gap-3">
      {/* reparto por clase */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-sm font-bold text-danger">{fmtDuracion(totalMin)}</span>
        <span className="text-xs text-muted-foreground">perdidos ·</span>
        {porClase.map((c) => (
          <span key={c.clase} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-2 rounded-full ${COLOR_CLASE[c.clase]}`} />
            {NOMBRE_CLASE[c.clase]} <b className="num text-foreground">{fmtDuracion(c.minutos)}</b> ({c.veces})
          </span>
        ))}
      </div>

      {/* por línea */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lineas
          .filter((l) => l.activo !== false)
          .map((l) => {
            const dela = paradas.filter((p) => p.lineaCodigo === l.codigo)
            const total = dela.reduce((a, p) => a + duracionMin(p, ahora), 0)
            const topTipos = porTipo(dela, ahora).slice(0, 3)
            return (
              <div key={l.codigo} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">{l.nombre}</h3>
                  <span className="num text-xs font-semibold text-danger">{total ? fmtDuracion(total) : "—"}</span>
                </div>
                {dela.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin paradas.</p>
                ) : (
                  <ol className="flex flex-col gap-1.5">
                    {topTipos.map((g, i) => (
                      <li key={g.codigo} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">
                          <b className="num mr-1.5 text-primary">0{i + 1}</b>
                          {g.nombre}
                          <span className="ml-1 text-muted-foreground/70">({g.veces})</span>
                        </span>
                        <span className="num shrink-0 text-foreground">{fmtDuracion(g.minutos)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
