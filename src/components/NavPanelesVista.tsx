import { Link, useLocation } from "react-router-dom"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PANELES_SOLO_VISTA } from "@/lib/rolVista"

/*
 * Solo Vista: en vez de «volver al inicio», una flecha para pasar de un
 * panel al otro (Producción → Paradas, Paradas ← Producción). Va a la
 * derecha del header (ver AppShell).
 */
export function NavPanelesVista() {
  const { pathname } = useLocation()
  const i = PANELES_SOLO_VISTA.findIndex((p) => p.href === pathname)
  const enProduccion = i <= 0
  const destino = PANELES_SOLO_VISTA[enProduccion ? 1 : 0]

  return (
    <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
      <Link to={destino.href} replace aria-label={`Ir al Panel de ${destino.titulo}`}>
        {!enProduccion && <ArrowLeft className="size-4" />}
        {destino.titulo}
        {enProduccion && <ArrowRight className="size-4" />}
      </Link>
    </Button>
  )
}
