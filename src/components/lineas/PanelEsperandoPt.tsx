import { Link } from "react-router-dom"
import { Loader2, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida } from "@/lib/produccion/tipos"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/** Corrida detenida esperando su PT: si el lote sigue se continúa (sin PT); si no, se carga su PT para cerrarla. */
export function PanelEsperandoPt({
  corrida,
  continuarCorridaDetenida,
  onArrancarOtro,
}: {
  corrida: Corrida
  continuarCorridaDetenida: AccionesLinea["continuarCorridaDetenida"]
  onArrancarOtro: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
      <p className="text-xs font-medium text-foreground">Detenida{corrida.lote ? ` · Lote ${corrida.lote}` : ""}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => ejecutar(() => continuarCorridaDetenida(corrida.id))} disabled={enviando}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
          Continuar el Lote {corrida.lote ?? ""}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/producto-terminado">Terminó: cargar su PT</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onArrancarOtro}>
          Arrancar con otro tanque
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
