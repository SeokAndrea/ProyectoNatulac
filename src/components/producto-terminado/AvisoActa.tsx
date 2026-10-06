import { Link } from "react-router-dom"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import type { EstadoActa } from "./useActaAlDia"

/** Cómo va el acta que se rearma sola tras cargar en un turno cerrado (ver useActaAlDia). */
export function AvisoActa({ estado }: { estado: EstadoActa }) {
  if (estado === "quieta") return null
  if (estado === "actualizando") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Actualizando el acta…
      </p>
    )
  }
  if (estado === "lista") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-success">
        <CheckCircle2 className="size-4" />
        Acta actualizada.
        <Link to="/mis-actas" className="underline">
          Verla en Mis Actas
        </Link>
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
      <XCircle className="size-4" />
      {estado.error} El responsable del turno puede volver a guardar, o se regenera desde Auditoría.
    </p>
  )
}
