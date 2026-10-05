import { ArrowRightLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import { ElegirTanqueSiguiente } from "./ElegirTanqueSiguiente"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useContinuarSiguiente } from "./useAccion"

/** "Cambiar de lote" con la corrida en marcha: confirmación antes de pasar al tanque del lote siguiente. */
export function PanelCambioLote({
  nombreLinea,
  corrida,
  tanquesListos,
  continuarSiguienteLote,
  onCerrar,
}: {
  nombreLinea: string
  corrida: Corrida
  tanquesListos: TanqueRecepcion[]
  continuarSiguienteLote: AccionesLinea["continuarSiguienteLote"]
  onCerrar: () => void
}) {
  const siguiente = useContinuarSiguiente(corrida.id, continuarSiguienteLote, onCerrar)
  const { enviando } = siguiente

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs text-foreground">
        {nombreLinea} pasa al tanque del lote siguiente. La corrida del Lote {corrida.lote ?? ""} queda esperando su Producto
        Terminado, y su tanque queda Con Restos hasta que Preparación lo resuelva. ¿Confirmas?
      </p>
      {!siguiente.eligeTanque && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => siguiente.continuar()} disabled={enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
            Sí, cambiar de lote
          </Button>
          <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      )}
      <MensajeError error={siguiente.error} />
      {siguiente.eligeTanque && (
        <ElegirTanqueSiguiente
          tanquesListos={tanquesListos}
          enviando={enviando}
          onContinuar={(n) => siguiente.continuar(n)}
          onCancelar={onCerrar}
        />
      )}
    </div>
  )
}
