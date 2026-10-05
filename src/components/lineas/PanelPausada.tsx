import { Beaker, Loader2, PlayCircle, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { AvisoParadaPendiente } from "./EstadoCipLinea"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/** Corrida en pausa por una Parada: Continuar (cuando la parada esté completa), Pasar a CIP o Detener. */
export function PanelPausada({
  corrida,
  paradaQueDetiene,
  continuar,
  onCip,
  onDetener,
}: {
  corrida: Corrida
  paradaQueDetiene: ParadaQueDetiene | null
  continuar: AccionesLinea["continuar"]
  onCip: () => void
  onDetener: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Parada.</p>
      <AvisoParadaPendiente parada={paradaQueDetiene} accion="continuar" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => ejecutar(() => continuar(corrida.id))} disabled={enviando || paradaQueDetiene !== null}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
          Continuar
        </Button>
        <Button size="sm" variant="outline" onClick={onCip} disabled={enviando}>
          <Beaker className="size-3.5" />
          Pasar a CIP
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={onDetener}
          disabled={enviando}
        >
          <Square className="size-3.5" />
          Detener línea
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
