import { AlertTriangle, ScanLine } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { MERMA_DANGER_DESDE, MERMA_WARN_DESDE, nivelMerma } from "@/lib/estadisticas"
import { cn } from "@/lib/utils"
import { MERMA_SEMIELABORADO_MAX, MERMA_SEMIELABORADO_WARN } from "./calculosPanel"

/** Merma de envase y Rendimiento (semielaborado), turno pasado vs. turno actual. */
export function SeccionMermas({
  envasePasado,
  envaseActual,
  semielaboradoPasado,
  semielaboradoActual,
}: {
  envasePasado: number | null
  envaseActual: number | null
  semielaboradoPasado: number | null
  semielaboradoActual: number | null
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <MermaComparativaCard titulo="Merma de envase" pasado={envasePasado} actual={envaseActual} />
      <MermaComparativaCard
        titulo="Rendimiento"
        pasado={semielaboradoPasado}
        actual={semielaboradoActual}
        dangerDesde={MERMA_SEMIELABORADO_MAX}
        warnDesde={MERMA_SEMIELABORADO_WARN}
        invertido
      />
    </div>
  )
}

/**
 * Comparativo Turno pasado vs. Turno actual para una merma. Las dos
 * columnas salen de las MISMAS funciones (mermaEnvasesTurno() /
 * mermaSemielaboradoTurno()), corridas sobre `turno` y `turnoAnterior`.
 * Cada columna se colorea según su propio nivel de tolerancia.
 */
function MermaComparativaCard({
  titulo,
  pasado,
  actual,
  dangerDesde = MERMA_DANGER_DESDE,
  warnDesde = MERMA_WARN_DESDE,
  invertido = false,
}: {
  titulo: string
  pasado: number | null
  actual: number | null
  dangerDesde?: number
  warnDesde?: number
  /** Si es true, se muestra el rendimiento (100 - merma) en vez de la merma — los umbrales siguen siendo tolerancia de MERMA, no de rendimiento. */
  invertido?: boolean
}) {
  const nivelActual = actual === null ? null : nivelMerma(actual, dangerDesde, warnDesde)

  return (
    <Card
      className={cn(
        "shadow-panel gap-0 overflow-hidden border py-0",
        nivelActual === "danger" ? "border-danger/45" : nivelActual === "warn" ? "border-warning/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ScanLine className="size-4 text-primary" />
          {titulo}
        </p>
        <Badge variant="muted">{invertido ? `Mín. ${Math.round((100 - dangerDesde) * 100) / 100}%` : `Máx. ${dangerDesde}%`}</Badge>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border/70">
        <MermaBloque titulo="Turno pasado" pct={pasado} dangerDesde={dangerDesde} warnDesde={warnDesde} invertido={invertido} />
        <MermaBloque titulo="Turno actual" pct={actual} dangerDesde={dangerDesde} warnDesde={warnDesde} invertido={invertido} />
      </div>

      {nivelActual === "danger" && !invertido && (
        <p className="flex items-center gap-1 border-t border-border/70 px-3 py-2 text-[11px] font-medium text-danger">
          <AlertTriangle className="size-3" />
          El turno actual está fuera de tolerancia.
        </p>
      )}
    </Card>
  )
}

function MermaBloque({
  titulo,
  pct,
  dangerDesde = MERMA_DANGER_DESDE,
  warnDesde = MERMA_WARN_DESDE,
  invertido = false,
}: {
  titulo: string
  pct: number | null
  dangerDesde?: number
  warnDesde?: number
  invertido?: boolean
}) {
  const nivel = pct === null ? null : nivelMerma(pct, dangerDesde, warnDesde)
  const color = nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : nivel === "ok" ? "text-success" : undefined
  const valorMostrado = pct === null ? null : invertido ? Math.round((100 - pct) * 100) / 100 : pct
  return (
    <div className="min-w-0 px-3 py-5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={cn("num mt-2 truncate text-3xl font-bold leading-none", color)}>{valorMostrado !== null ? `${valorMostrado}%` : "—"}</p>
    </div>
  )
}
