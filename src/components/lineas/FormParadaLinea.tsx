import { useState } from "react"
import { Loader2, PauseCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/**
 * "Parada": pausa la corrida con una descripción OBLIGATORIA y suma el +1
 * en Registrar Paradas. Sigue activa: se continúa (con la parada completa)
 * o se detiene.
 */
export function FormParadaLinea({
  corridaId,
  pausar,
  onCerrar,
}: {
  corridaId: string
  pausar: AccionesLinea["pausar"]
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  async function confirmar() {
    if (motivo.trim() === "") return
    if (await ejecutar(() => pausar(corridaId, motivo.trim()))) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        Parada: la corrida se pausa y se suma un +1 en Registrar Paradas. Escribe qué pasó; el tipo y los minutos se ponen allá.
      </p>
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, 140))}
        maxLength={140}
        rows={2}
        placeholder="Motivo de la parada — se muestra en el dashboard"
        className="text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{motivo.length}/140</span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={enviando || motivo.trim() === ""}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
            Confirmar parada
          </Button>
        </div>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
