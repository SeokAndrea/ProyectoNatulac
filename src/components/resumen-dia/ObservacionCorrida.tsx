import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { MensajeError } from "@/components/MensajeError"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAccion } from "@/lib/useAccion"

type Resultado = { ok: true } | { ok: false; error: string }

/**
 * Lo que pasó con un lote (su merma, sus paradas), en palabras de la
 * analista. Se ve después en Indicadores, en la pantalla de la línea
 * ("Ver observaciones guardadas"). Vacía y guardada, se borra.
 */
export function ObservacionCorrida({ guardada, onGuardar }: { guardada: string | undefined; onGuardar: (texto: string) => Promise<Resultado> }) {
  const [texto, setTexto] = useState(guardada ?? "")
  const { enviando, error, ejecutar } = useAccion()
  const sinCambios = texto.trim() === (guardada ?? "")

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={400}
        placeholder="Observación de este lote (ej. qué causó la merma)"
        className="min-h-16 text-sm"
      />
      <MensajeError error={error} />
      <Button size="sm" variant="outline" className="self-end" disabled={enviando || sinCambios} onClick={() => ejecutar(() => onGuardar(texto))}>
        {enviando ? <Loader2 className="size-3.5 animate-spin" /> : sinCambios && guardada ? <Check className="size-3.5" /> : null}
        {sinCambios && guardada ? "Observación guardada" : "Guardar observación"}
      </Button>
    </div>
  )
}
