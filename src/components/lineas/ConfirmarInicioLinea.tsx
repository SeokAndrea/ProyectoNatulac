import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/** Qué pasa de verdad con una línea que el turno anterior dejó corriendo. */
export type NoCorre = "parada" | "detener" | "cip"

/**
 * Status (revisión de inicio): una línea heredada corriendo que todavía no
 * se revisó ofrece Confirmar, Corregir (otra corrida) o «No está corriendo»
 * (Parada, Detener línea o CIP). La base no deja cargar contador ni PT de una
 * línea sin confirmar: la tarjeta confirma al mandar lo elegido, no antes.
 * Confirmada, tiene las MISMAS opciones que en Preparación.
 */
export function ConfirmarInicioLinea({
  nombreLinea,
  corrida,
  confirmarEstado,
  onCorregir,
  onNoCorre,
}: {
  nombreLinea: string
  corrida: Corrida
  confirmarEstado: AccionesLinea["confirmarEstado"]
  onCorregir: () => void
  onNoCorre: (como: NoCorre) => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  const [eligiendo, setEligiendo] = useState(false)
  // Solo si quedó corriendo: una en pausa o con el lote terminado ya no dice "corriendo".
  const corre = corrida.pausadaEn == null && corrida.loteTerminado == null
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
      <p className="text-sm text-foreground">{nombreLinea}: así quedó del turno anterior — confirma o corrige.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={enviando} onClick={() => ejecutar(() => confirmarEstado(corrida.id))}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Confirmar
        </Button>
        <Button size="sm" variant="outline" onClick={onCorregir}>
          Corregir
        </Button>
        {corre && (
          <Button size="sm" variant={eligiendo ? "secondary" : "outline"} onClick={() => setEligiendo((v) => !v)}>
            No está corriendo
          </Button>
        )}
      </div>
      {corre && eligiendo && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">¿Qué pasa con la línea?</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onNoCorre("parada")}>
              Parada
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNoCorre("detener")}>
              Detener línea
            </Button>
            <Button size="sm" variant="outline" onClick={() => onNoCorre("cip")}>
              CIP
            </Button>
          </div>
        </div>
      )}
      <MensajeError error={error} />
    </div>
  )
}
