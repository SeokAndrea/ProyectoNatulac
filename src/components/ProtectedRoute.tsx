import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import type { RolCodigo } from "@/lib/catalogos"

export function ProtectedRoute({
  children,
  rolesPermitidos,
}: {
  children: ReactNode
  /** Si se define, la ruta solo es accesible para estos roles; si no, para cualquier sesión. */
  rolesPermitidos?: RolCodigo[]
}) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  if (rolesPermitidos && !rolesPermitidos.includes(session.rol)) return <Navigate to="/hub" replace />
  return <>{children}</>
}
