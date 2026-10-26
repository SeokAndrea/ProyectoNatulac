import type { ReactNode } from "react"
import { ArrowRightLeft, Beaker, PauseCircle, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FilaAcciones } from "./FilaAcciones"

/**
 * Corrida en marcha: Parada, CIP, Cambiar de lote (y Corregir, en Status), y `extra` (Paradas) justo después de Parada, para que se vea sin deslizar. Cada uno abre su panel.
 * Sin `onParada` no hay botón de Parada: en Líneas eso vive en el Modo Paradas.
 */
export function PanelCorriendo({
  corregible,
  onCorregir,
  onParada,
  onCip,
  onCambiarLote,
  extra,
}: {
  corregible: boolean
  onCorregir: () => void
  onParada?: () => void
  onCip: () => void
  onCambiarLote: () => void
  extra?: ReactNode
}) {
  return (
    <FilaAcciones>
      {corregible && (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onCorregir}>
          <PenLine className="size-3.5" />
          Corregir
        </Button>
      )}
      {onParada && (
        <Button variant="outline" size="sm" onClick={onParada}>
          <PauseCircle className="size-3.5" />
          Parada
        </Button>
      )}
      {extra}
      <Button variant="outline" size="sm" onClick={onCip}>
        <Beaker className="size-3.5" />
        CIP
      </Button>
      <Button variant="outline" size="sm" onClick={onCambiarLote}>
        <ArrowRightLeft className="size-3.5" />
        Cambiar de lote
      </Button>
    </FilaAcciones>
  )
}
