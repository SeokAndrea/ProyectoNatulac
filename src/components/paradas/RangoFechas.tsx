import { useState } from "react"
import { Input } from "@/components/ui/input"
import { restarDias } from "@/lib/tiempoPlanta"

/** Tope del rango: el OEE se pide día por día y turno por turno (src/lib/eficienciaPeriodo.ts). */
export const MAX_DIAS_RANGO = 62

const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)

/**
 * El rango después de cambiar una punta: si quedó al revés, la otra punta se
 * mueve a la misma fecha; si pasa del tope, la otra punta se acerca.
 */
export function ajustarRango(desde: string, hasta: string, cambio: "desde" | "hasta"): { desde: string; hasta: string; recortado: boolean } {
  if (desde > hasta) return cambio === "desde" ? { desde, hasta: desde, recortado: false } : { desde: hasta, hasta, recortado: false }
  if (diasEntre(desde, hasta) + 1 <= MAX_DIAS_RANGO) return { desde, hasta, recortado: false }
  return cambio === "desde"
    ? { desde, hasta: restarDias(desde, -(MAX_DIAS_RANGO - 1)), recortado: true }
    : { desde: restarDias(hasta, MAX_DIAS_RANGO - 1), hasta, recortado: true }
}

/** Desde–hasta con dos calendarios (Panel de Paradas). El mismo día en los dos = un solo día. */
export function RangoFechas({
  desde,
  hasta,
  max,
  onChange,
}: {
  desde: string
  hasta: string
  /** La última fecha que se puede elegir (hoy). */
  max: string
  onChange: (rango: { desde: string; hasta: string }) => void
}) {
  const [recortado, setRecortado] = useState(false)

  function cambiar(nuevoDesde: string, nuevoHasta: string, cambio: "desde" | "hasta") {
    if (!nuevoDesde || !nuevoHasta) return
    const r = ajustarRango(nuevoDesde, nuevoHasta, cambio)
    setRecortado(r.recortado)
    onChange({ desde: r.desde, hasta: r.hasta })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="date"
        aria-label="Desde"
        value={desde}
        max={max}
        onChange={(e) => cambiar(e.target.value, hasta, "desde")}
        className="h-8 w-auto"
      />
      <span className="text-xs text-muted-foreground">a</span>
      <Input
        type="date"
        aria-label="Hasta"
        value={hasta}
        max={max}
        onChange={(e) => cambiar(desde, e.target.value, "hasta")}
        className="h-8 w-auto"
      />
      {recortado && <span className="text-xs text-warning-foreground">Máximo {MAX_DIAS_RANGO} días: se ajustó la otra fecha.</span>}
    </div>
  )
}
