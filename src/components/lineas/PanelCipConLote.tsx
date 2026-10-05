import { useState } from "react"
import { Loader2, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { AvisoParadaPendiente, DescripcionCip } from "./EstadoCipLinea"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

/** CIP con el lote en pausa: al terminar el CIP la misma corrida sigue. O el lote ya no sigue y queda esperando su PT. */
export function PanelCipConLote({
  lineaCodigo,
  corrida,
  lineaEstado,
  paradaQueDetiene,
  terminarCip,
  terminarLinea,
}: {
  lineaCodigo: string
  corrida: Corrida
  lineaEstado: LineaEstado | null
  paradaQueDetiene: ParadaQueDetiene | null
  terminarCip: AccionesLinea["terminarCip"]
  terminarLinea: AccionesLinea["terminarLinea"]
}) {
  /** "El lote ya no sigue": segunda confirmación. */
  const [confirmarNoSigue, setConfirmarNoSigue] = useState(false)
  const { enviando, error, ejecutar } = useAccion()
  const lote = corrida.lote ?? ""

  async function loteNoSigue() {
    if (await ejecutar(() => terminarLinea(corrida.id))) setConfirmarNoSigue(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <DescripcionCip lineaEstado={lineaEstado}>{` El Lote ${lote} sigue después del CIP.`}</DescripcionCip>
      <AvisoParadaPendiente parada={paradaQueDetiene} />
      {confirmarNoSigue ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2">
          <p className="text-xs text-foreground">
            La corrida del Lote {lote} se detiene y queda esperando su Producto Terminado. La línea sigue en CIP. ¿Confirmas?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={loteNoSigue} disabled={enviando}>
              Sí, el lote no sigue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmarNoSigue(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => ejecutar(() => terminarCip(lineaCodigo))} disabled={enviando || paradaQueDetiene !== null}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
            Terminó CIP: continuar el Lote {lote}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmarNoSigue(true)} disabled={enviando}>
            El lote ya no sigue
          </Button>
        </div>
      )}
      <MensajeError error={error} />
    </div>
  )
}
