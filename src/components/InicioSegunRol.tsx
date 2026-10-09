import { Navigate } from "react-router-dom"
import Hub from "@/pages/Hub"
import { useAuth } from "@/lib/auth"
import { esSoloVista, INICIO_SOLO_VISTA } from "@/lib/rolVista"

/** /hub: Solo Vista no tiene inicio, va directo al Panel de Producción. El resto ve el Hub. */
export function InicioSegunRol() {
  const { session } = useAuth()
  if (esSoloVista(session)) return <Navigate to={INICIO_SOLO_VISTA} replace />
  return <Hub />
}
