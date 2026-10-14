import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { duracionMin, fmtDuracion, nombreLineaParada, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"

const TURNOS: Record<string, string> = { TURNO_1: "Turno 1", TURNO_2: "Turno 2", TURNO_3: "Turno 3", "12X12": "12x12" }
const ORDEN = Object.keys(TURNOS)

/** Quién la reportó: el supervisor (Producción) o Mantenimiento (su app o su Sheet). */
const deMantenimiento = (p: Parada) => p.origen !== "MANUAL"

/**
 * Una parada, como en el resumen del turno: línea, hora, código y nombre, y
 * su duración. `children` va debajo (ej. completar una pendiente al cierre).
 */
export function FilaParada({
  parada: p,
  nombreLinea = nombreLineaParada,
  conOrigen = false,
  ahora,
  children,
}: {
  parada: Parada
  nombreLinea?: (codigo: string) => string
  /** Muestra si la reportó Producción o Mantenimiento. */
  conOrigen?: boolean
  ahora?: Date
  children?: ReactNode
}) {
  const codigo = codigoDeParadaLive(p)
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${p.pendiente ? "border-destructive/60 bg-danger-soft/40" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium text-foreground">
          {nombreLinea(p.lineaCodigo)}
          <span className="font-normal text-muted-foreground">
            {" · "}
            <span className="num">
              {p.inicio.slice(11, 16)}
              {conOrigen && (p.fin ? `–${p.fin.slice(11, 16)}` : "–…")}
            </span>
            {" · "}
            {codigo ? `${codigo} · ` : ""}
            {p.tipoNombre}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {conOrigen && <Badge variant={deMantenimiento(p) ? "info" : "muted"}>{deMantenimiento(p) ? "Mantenimiento" : "Producción"}</Badge>}
          {p.pendiente ? (
            <Badge variant="danger">Sin completar</Badge>
          ) : !p.fin ? (
            <span className="text-muted-foreground">en curso</span>
          ) : (
            <span className="num font-semibold">{fmtDuracion(duracionMin(p, ahora))}</span>
          )}
        </span>
      </div>
      {(p.nota || p.justificacionDesvio) && (
        <p className="text-xs text-muted-foreground">
          {[p.nota, p.justificacionDesvio ? "Justificación: " + p.justificacionDesvio : null].filter(Boolean).join(" — ")}
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * Las paradas de un día, como el resumen de un turno: agrupadas por turno y,
 * dentro de cada uno, en orden de hora, las de Producción y las de
 * Mantenimiento juntas (dueña, 2026-10-14). Cada grupo con su total.
 */
export function ParadasPorTurno({ paradas, ahora }: { paradas: Parada[]; ahora?: Date }) {
  if (paradas.length === 0) return <p className="text-sm text-muted-foreground">No se registraron paradas.</p>
  const tipos = [...new Set(paradas.map((p) => p.turnoTipo))].sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99))

  return (
    <div className="flex flex-col gap-4">
      {tipos.map((tipo) => {
        const delTurno = paradas.filter((p) => p.turnoTipo === tipo).sort((a, b) => a.inicio.localeCompare(b.inicio))
        const total = delTurno.filter((p) => !p.pendiente).reduce((a, p) => a + duracionMin(p, ahora), 0)
        return (
          <section key={tipo ?? "sin-turno"} className="flex flex-col gap-2" aria-label={TURNOS[tipo] ?? "Sin turno"}>
            <h3 className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold text-foreground">
              {TURNOS[tipo] ?? "Sin turno"}
              <span className="font-normal text-muted-foreground">
                {delTurno.length} {delTurno.length === 1 ? "parada" : "paradas"} · <span className="num">{fmtDuracion(total)}</span>
              </span>
            </h3>
            {delTurno.map((p) => (
              <FilaParada key={p.id} parada={p} conOrigen ahora={ahora} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
