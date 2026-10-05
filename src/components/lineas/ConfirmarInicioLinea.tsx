import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/**
 * Status (revisión de inicio): una línea heredada corriendo que todavía no
 * se revisó solo ofrece Confirmar / Corregir — la base no deja cargar
 * contador ni PT de una línea sin confirmar, así que detenerla antes de
 * confirmar la dejaría trabada esperando PT. Confirmada, tiene las MISMAS
 * opciones que en Preparación.
 */
export function ConfirmarInicioLinea({
  nombreLinea,
  corrida,
  confirmarEstado,
  onCorregir,
}: {
  nombreLinea: string
  corrida: Corrida
  confirmarEstado: AccionesLinea["confirmarEstado"]
  onCorregir: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
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
      </div>
      <MensajeError error={error} />
    </div>
  )
}
