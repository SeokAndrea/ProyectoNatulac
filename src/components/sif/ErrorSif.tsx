import { RotateCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Un error de Solicitudes, con lo que se puede hacer al respecto: reintentar una
 * lectura que falló, o actualizar cuando otra persona ya cambió la solicitud.
 */
export function ErrorSif({ mensaje, accion, onAccion }: { mensaje: string; accion?: string; onAccion?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm text-danger-foreground"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{mensaje}</p>
      {accion && onAccion && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={onAccion}>
          <RotateCw className="size-3.5" />
          {accion}
        </Button>
      )}
    </div>
  )
}
