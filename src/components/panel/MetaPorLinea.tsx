import { nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive } from "@/lib/catalogosLive"
import type { EficienciaTurno } from "@/lib/eficiencia"
import { cn } from "@/lib/utils"

/** "Meta por línea": cajas reales / meta, avance y eficiencia de cada línea del turno. */
export function MetaPorLinea({
  eficiencia,
  turnoTipo,
  lineas,
}: {
  eficiencia: EficienciaTurno | null
  turnoTipo: string | undefined
  lineas: LineaLive[]
}) {
  if (!eficiencia || eficiencia.porLinea.size === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {eficiencia === null || turnoTipo === "12X12" ? "Sin cálculo para este tipo de turno." : "Ninguna línea en uso este turno."}
      </p>
    )
  }
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {[...eficiencia.porLinea.entries()].map(([codigo, m]) => {
        const avance = m.avancePct ?? 0
        const barra = Math.max(0, Math.min(100, avance))
        const nivel = m.eficienciaPct ?? avance
        const horas = (min: number) => (min / 60).toLocaleString("es-CO", { maximumFractionDigits: 1 })
        return (
          <div key={codigo} className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nombrePorCodigo(lineas, codigo)}</span>
              <span className="num text-xs font-semibold text-foreground">{m.avancePct !== null ? m.avancePct + "%" : "—"}</span>
            </div>
            <p className="num mt-1 text-2xl font-bold leading-none">
              {(m.realCajas ?? 0).toLocaleString("es-CO")}
              <span className="text-sm font-medium text-muted-foreground">
                {" "}
                / {(m.metaCajas ?? 0).toLocaleString("es-CO")}
              </span>
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", nivel >= 90 ? "bg-success" : nivel >= 60 ? "bg-warning" : "bg-danger")}
                style={{ width: `${barra}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Disponible {horas(m.disponibleMin)} h · Eficiencia {m.eficienciaPct !== null ? m.eficienciaPct + "%" : "—"}
            </p>
            {m.paradasExcedenTiempo && (
              <p className="mt-1 text-[11px] text-warning">Las paradas cargadas suman más que el tiempo del turno: revísalas.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
