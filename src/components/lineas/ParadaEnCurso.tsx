import { useEffect, useState } from "react"
import { Timer } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { duracionMin, fmtDuracion, MIN_PARADA_LARGA } from "@/lib/paradas"
import { cn } from "@/lib/utils"
import type { ParadaActualLinea } from "./tipos"

/** Minutos que lleva la parada, refrescados cada 30 s. */
function useMinutosParada(parada: ParadaActualLinea | null): number | null {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    if (!parada) return
    const id = setInterval(() => setAhora(new Date()), 30 * 1000)
    return () => clearInterval(id)
  }, [parada])
  return parada ? duracionMin({ inicio: parada.inicio, fin: null }, ahora) : null
}

/**
 * La parada que tiene en pausa a la línea: "Tipo · hace 12 min", el comentario
 * y los minutos para Continuar (vienen calculados; se pueden corregir a mano).
 */
export function ParadaEnCurso({
  parada,
  minutosEditados,
  onMinutos,
}: {
  parada: ParadaActualLinea
  minutosEditados: string
  onMinutos: (v: string) => void
}) {
  const minutos = useMinutosParada(parada) ?? 0
  const larga = minutos >= MIN_PARADA_LARGA
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border px-3 py-2", larga ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning-soft/30")}>
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
        <Timer className={cn("size-4", larga ? "text-danger" : "text-warning")} />
        {parada.tipoNombre}
        <span className={cn("font-normal", larga ? "text-danger" : "text-muted-foreground")}>· hace {fmtDuracion(minutos)}</span>
      </p>
      {parada.nota && <p className="text-xs text-muted-foreground">{parada.nota}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">Duró</Label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={minutosEditados}
          onChange={(e) => onMinutos(e.target.value)}
          placeholder={String(minutos)}
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">min (vacío = {minutos}, hasta ahora)</span>
      </div>
    </div>
  )
}
