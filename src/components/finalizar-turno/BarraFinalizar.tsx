import { useState } from "react"
import { Loader2, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/*
 * Barra fija abajo: dice qué falta y deja finalizar solo cuando no falta
 * nada, con un segundo clic para confirmar. `aviso` es lo recomendado que
 * no bloquea (ej. tanques sin confirmar).
 */
export function BarraFinalizar({
  faltan,
  aviso,
  bloqueoPermiso,
  codigo,
  finalizando,
  onFinalizar,
}: {
  faltan: string[]
  aviso: string | null
  /** Texto si esta persona no puede finalizar (no es el responsable). */
  bloqueoPermiso: string | null
  codigo: string
  finalizando: boolean
  onFinalizar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const bloqueado = faltan.length > 0 || bloqueoPermiso !== null
  const pidiendoConfirmacion = confirmando && !bloqueado

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] shadow-[0_-2px_8px_rgba(15,23,42,0.06)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-sm">
          {bloqueoPermiso ? (
            <span className="text-warning-foreground">{bloqueoPermiso}</span>
          ) : faltan.length > 0 ? (
            <>
              <Badge variant="danger" className="mr-1.5">
                Falta
              </Badge>
              {faltan.join(" · ")}
            </>
          ) : pidiendoConfirmacion ? (
            <span className="text-foreground">¿Cerrar el turno {codigo}? Después solo podrás cargar datos que falten.</span>
          ) : aviso ? (
            <>
              <Badge variant="warning" className="mr-1.5">
                Aviso
              </Badge>
              {aviso}
            </>
          ) : (
            <>
              <Badge variant="success" className="mr-1.5">
                Listo
              </Badge>
              Todo resuelto
            </>
          )}
        </p>
        <div className="flex gap-2">
          {pidiendoConfirmacion && (
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={finalizando}>
              Cancelar
            </Button>
          )}
          <Button
            variant={pidiendoConfirmacion ? "destructive" : "outline"}
            className={pidiendoConfirmacion ? "" : "border-destructive/40 text-destructive hover:bg-destructive/10"}
            disabled={bloqueado || finalizando}
            onClick={() => (pidiendoConfirmacion ? onFinalizar() : setConfirmando(true))}
          >
            {finalizando ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
            {pidiendoConfirmacion ? "Sí, cerrar y generar el acta" : "Finalizar Turno"}
          </Button>
        </div>
      </div>
    </div>
  )
}
