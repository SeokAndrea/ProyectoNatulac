import { Loader2, PlayCircle, Square, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import { ElegirTanqueSiguiente } from "./ElegirTanqueSiguiente"
import { MensajeError } from "@/components/MensajeError"
import type { AccionesLinea } from "./tipos"
import { useContinuarSiguiente } from "./useContinuarSiguiente"

/** Se marcó que terminó el lote de la corrida: ¿sigue con el mismo, pasa al siguiente o se detiene la línea? */
export function PanelLoteTerminado({
  corrida,
  tanquesListos,
  seguirMismoLote,
  continuarSiguienteLote,
  onDetener,
}: {
  corrida: Corrida
  tanquesListos: TanqueRecepcion[]
  seguirMismoLote: AccionesLinea["seguirMismoLote"]
  continuarSiguienteLote: AccionesLinea["continuarSiguienteLote"]
  onDetener: () => void
}) {
  const siguiente = useContinuarSiguiente(corrida.id, continuarSiguienteLote)
  const { enviando } = siguiente

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
      <p className="text-xs text-foreground">
        Se marcó que terminó el lote{corrida.lote ? ` ${corrida.lote}` : ""} de esta corrida — ¿sigue con el mismo lote, pasa
        al siguiente o se detiene la línea?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => siguiente.ejecutar(() => seguirMismoLote(corrida.id))} disabled={enviando}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
          Seguir con el mismo lote
        </Button>
        <Button size="sm" onClick={() => siguiente.continuar()} disabled={enviando}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
          Continuar al siguiente lote
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
      <p className="text-[11px] text-muted-foreground">
        "Seguir con el mismo lote" solo deshace el aviso — no toca el tanque ni los litros.
      </p>
      <MensajeError error={siguiente.error} />
      {siguiente.eligeTanque && (
        <ElegirTanqueSiguiente
          tanquesListos={tanquesListos}
          enviando={enviando}
          onContinuar={(n) => siguiente.continuar(n)}
          onCancelar={() => {
            siguiente.setEligeTanque(false)
            siguiente.setError(null)
          }}
        />
      )}
    </div>
  )
}
