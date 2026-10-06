import { useState } from "react"
import { Beaker, Loader2, PlayCircle, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { AvisoParadaPendiente } from "./EstadoCipLinea"
import { MensajeError } from "@/components/MensajeError"
import { ParadaEnCurso } from "./ParadaEnCurso"
import type { AccionesLinea, ParadaActualLinea } from "./tipos"
import { useAccion } from "@/lib/useAccion"

/**
 * Corrida en pausa por una Parada: Continuar, Pasar a CIP o Detener. Con
 * `paradaActual` (parada con tipo, en curso) muestra cuánto lleva y deja
 * corregir los minutos al continuar; sin ella, Continuar espera a que el +1
 * esté completo en Registrar Paradas.
 */
export function PanelPausada({
  corrida,
  paradaQueDetiene,
  paradaActual = null,
  continuar,
  onCip,
  onDetener,
}: {
  corrida: Corrida
  paradaQueDetiene: ParadaQueDetiene | null
  paradaActual?: ParadaActualLinea | null
  continuar: AccionesLinea["continuar"]
  onCip: () => void
  onDetener: () => void
}) {
  const { enviando, error, ejecutar } = useAccion()
  const [minutos, setMinutos] = useState("")
  const minutosValidos = minutos === "" || (Number.isInteger(Number(minutos)) && Number(minutos) >= 0)

  function seguir() {
    ejecutar(() => (paradaActual && minutos !== "" ? continuar(corrida.id, Number(minutos)) : continuar(corrida.id)))
  }

  return (
    <div className="flex flex-col gap-2">
      {paradaActual ? (
        <ParadaEnCurso parada={paradaActual} minutosEditados={minutos} onMinutos={setMinutos} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Parada.</p>
          <AvisoParadaPendiente parada={paradaQueDetiene} accion="continuar" />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={seguir} disabled={enviando || paradaQueDetiene !== null || !minutosValidos}>
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
