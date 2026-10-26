import { Link, useLocation } from "react-router-dom"
import { Search, TriangleAlert } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { RUTA_SIF, textoPorAtender, useSifPendientes } from "@/lib/sif"
import { cn } from "@/lib/utils"

/**
 * Aviso arriba de todas las pantallas para quien gestiona las SIF: cuántas
 * Intervenciones esperan responsable y cuántas Inspecciones esperan revisión,
 * con un botón para abrir la primera. Grande para el área de Mantenimiento;
 * una línea discreta para el resto (ej. Super Administrador). Se revisa cada
 * 2 min. No sale en la propia pantalla de solicitudes.
 */
export function AvisoSifPendientes() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const gestiona = puede(session, "SIF_GESTIONAR")
  const pendientes = useSifPendientes(session?.username ?? null, gestiona)

  if (pendientes.length === 0 || pathname === RUTA_SIF) return null
  const primera = pendientes[0]
  const hayIntervencion = primera.estado === "PENDIENTE"
  const enlace = `${RUTA_SIF}?sif=${primera.id}`

  if (session?.area !== "MANTENIMIENTO") {
    return (
      <Link
        to={enlace}
        className="mb-4 flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 print:hidden"
      >
        <span className={cn("size-2 shrink-0 rounded-full", hayIntervencion ? "bg-danger" : "bg-warning")} />
        <span className="min-w-0 flex-1 truncate">{textoPorAtender(pendientes)} en Mantenimiento</span>
        <span className="shrink-0 font-medium text-primary">Ver</span>
      </Link>
    )
  }

  const Icono = hayIntervencion ? TriangleAlert : Search
  return (
    <div
      role="status"
      className={cn(
        "mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3.5 print:hidden",
        hayIntervencion ? "border-danger/40 bg-danger-soft" : "border-warning/50 bg-warning-soft",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          hayIntervencion ? "bg-danger/15 text-danger" : "bg-warning text-warning-foreground",
        )}
      >
        <Icono className="size-5" />
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="text-base font-semibold text-foreground">{textoPorAtender(pendientes)}</p>
        <p className="text-sm text-muted-foreground">
          {pendientes
            .slice(0, 3)
            .map((s) => `${s.codigo} · ${s.lineaNombre} · ${s.tipoNombre}`)
            .join(" — ")}
        </p>
      </div>
      <Link
        to={enlace}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 pointer-coarse:h-11 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Abrir
      </Link>
    </div>
  )
}
