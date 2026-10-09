import { Link, useLocation } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { RUTA_SIF, useSifPendientes } from "@/lib/sif"

/**
 * Aviso grande, arriba de todas las pantallas, para quien gestiona las SIF
 * (Mantenimiento): cuántas hay pendientes y un botón para abrir la primera.
 * Se revisa cada 2 min. No sale en la propia pantalla de solicitudes.
 */
export function AvisoSifPendientes() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const gestiona = puede(session, "SIF_GESTIONAR")
  const pendientes = useSifPendientes(session?.username ?? null, gestiona)

  if (pendientes.length === 0 || pathname === RUTA_SIF) return null
  const primera = pendientes[0]

  return (
    <div
      role="alert"
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-warning/50 bg-warning-soft px-4 py-3.5 print:hidden"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground">
        <TriangleAlert className="size-5" />
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="text-base font-semibold text-foreground">
          {pendientes.length === 1 ? "1 solicitud de intervención pendiente" : `${pendientes.length} solicitudes de intervención pendientes`}
        </p>
        <p className="text-sm text-muted-foreground">
          {pendientes
            .slice(0, 3)
            .map((s) => `${s.codigo} · ${s.lineaNombre} · ${s.tipoNombre}`)
            .join(" — ")}
        </p>
      </div>
      <Link
        to={`${RUTA_SIF}?sif=${primera.id}`}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Abrir
      </Link>
    </div>
  )
}
