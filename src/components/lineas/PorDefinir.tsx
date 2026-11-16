import { Loader2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MensajeError } from "@/components/MensajeError"
import { definirResponsableParada, type Parada } from "@/lib/paradas"
import { useAccion } from "@/lib/useAccion"

/**
 * Clasificación interna de una parada abierta por el supervisor (migración 20261115590000).
 * La línea ya dice «Parada · <falla>» (lo muestra el panel de la línea); esto es solo
 * de quién es: Mantenimiento la toma (y la termina con sistema y subsistema) o, si se
 * determina fuera del sistema que es operacional, el supervisor la marca y la cierra él.
 */
export function PorDefinir({
  parada,
  usuario,
  esMantenimiento,
  terminaSiempre = false,
  pagina,
  onListo,
}: {
  parada: Parada
  usuario: string
  esMantenimiento: boolean
  /** La dueña: puede clasificarla en cualquier sentido. */
  terminaSiempre?: boolean
  pagina: string
  onListo: () => Promise<void>
}) {
  const { enviando, error, ejecutar } = useAccion()
  const puedeTomarla = esMantenimiento || terminaSiempre

  async function definir(responsable: "OPERACIONAL" | "MANTENIMIENTO") {
    if (await ejecutar(() => definirResponsableParada(usuario, parada.id, responsable, pagina))) await onListo()
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">¿De quién es?</span>
        {puedeTomarla && (
          <Button size="sm" variant="outline" onClick={() => definir("MANTENIMIENTO")} disabled={enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
            Es de Mantenimiento
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => definir("OPERACIONAL")} disabled={enviando}>
          Es Operacional
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
