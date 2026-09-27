import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { appPorSlug, puedeVerApp } from "@/lib/apps"

export function ProtectedRoute({
  children,
  app,
}: {
  children: ReactNode
  /** Slug de la app en src/lib/apps.tsx: la ruta pide lo mismo que su tarjeta (permiso, áreas). Sin él, basta con tener sesión. */
  app?: string
}) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  if (app) {
    const def = appPorSlug(app)
    if (!def) throw new Error(`ProtectedRoute: no existe la app "${app}" en src/lib/apps.tsx`)
    if (!puedeVerApp(session, def)) return <Navigate to="/hub" replace />
  }
  return <>{children}</>
}
