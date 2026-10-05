import { useState } from "react"
import { Loader2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/** "Detener línea": 2ª confirmación. La corrida queda Esperando PT (se cierra al cargar el Producto Terminado) y la línea Detenida con el motivo. */
export function FormDetenerLinea({
  corrida,
  detener,
  onCerrar,
}: {
  corrida: Corrida
  detener: AccionesLinea["detener"]
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const { enviando, error, ejecutar } = useAccion()

  async function confirmar() {
    if (await ejecutar(() => detener(corrida.id, motivo.trim()))) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs text-foreground">
        Esto detiene la corrida{corrida.lote ? ` del Lote ${corrida.lote}` : ""}. Queda{" "}
        <span className="font-medium">esperando que cargues su Producto Terminado</span> para cerrarse. No se puede deshacer.
      </p>
      <Textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value.slice(0, 140))}
        maxLength={140}
        rows={2}
        placeholder="Motivo (opcional) — se muestra en el dashboard"
        className="text-sm"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={confirmar}
          disabled={enviando}
        >
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          Sí, detener línea
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
