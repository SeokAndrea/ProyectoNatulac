import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/** Qué pasa de verdad con una línea que el turno anterior dejó corriendo. */
export type NoCorre = "parada" | "detener" | "cip"

/** «No está corriendo»: cada opción dice qué pasa con el lote (dueña, 2026-10-26: «Parada» y «Detener línea» confundían (ahora «Entregar PT»)). */
const OPCIONES_NO_CORRE: [NoCorre, (lote: string) => string, (lote: string) => string][] = [
  [
    "parada",
    () => "Parar: está parada, pero sigue con este lote",
    (lote) => `Cuando arranque, retoma ${lote}.`,
  ],
  [
    "detener",
    () => "Entregar PT: ya no sigue con este lote",
    (lote) => `${lote[0].toUpperCase()}${lote.slice(1)} no se retoma. Queda esperando su PT.`,
  ],
  ["cip", () => "Está en CIP", () => "La línea se está lavando."],
]

/**
 * Status (revisión de inicio): una línea heredada corriendo que todavía no
 * se revisó ofrece Confirmar, Corregir (otra corrida) o «No está corriendo»
 * (está parada y sigue el lote, ya no sigue el lote, o CIP). La base no deja
 * cargar contador ni PT de una línea sin confirmar: la tarjeta confirma al
 * mandar lo elegido, no antes. Confirmada, parar y continuar se hacen en el
 * Modo Paradas de Líneas, como en Líneas.
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
  const lote = corrida.lote ? `el lote ${corrida.lote}` : "el lote"
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
          <div className="flex flex-col gap-2">
            {OPCIONES_NO_CORRE.map(([como, titulo, detalle]) => (
              <button
                key={como}
                type="button"
                onClick={() => onNoCorre(como)}
                className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="text-sm font-medium text-foreground">{titulo(lote)}</span>
                <span className="text-xs text-muted-foreground">{detalle(lote)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <MensajeError error={error} />
    </div>
  )
}
