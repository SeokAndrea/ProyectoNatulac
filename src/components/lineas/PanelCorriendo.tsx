import { ArrowRightLeft, Beaker, PauseCircle, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Corrida en marcha: Parada, CIP, Cambiar de lote (y Corregir, en Status). Cada uno abre su panel. */
export function PanelCorriendo({
  corregible,
  onCorregir,
  onParada,
  onCip,
  onCambiarLote,
}: {
  corregible: boolean
  onCorregir: () => void
  onParada: () => void
  onCip: () => void
  onCambiarLote: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {corregible && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCorregir}>
          <PenLine className="size-3.5" />
          Corregir
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onParada}>
        <PauseCircle className="size-3.5" />
        Parada
      </Button>
      <Button variant="outline" size="sm" onClick={onCip}>
        <Beaker className="size-3.5" />
        CIP
      </Button>
      <Button variant="outline" size="sm" onClick={onCambiarLote}>
        <ArrowRightLeft className="size-3.5" />
        Cambiar de lote
      </Button>
    </div>
  )
}
