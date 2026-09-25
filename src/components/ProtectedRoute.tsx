import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"

export function ProtectedRoute({
  children,
  rolesPermitidos,
  areasPermitidas,
  areasExcluidas,
  requiereVeErrores,
  usuarioPermitido,
}: {
  children: ReactNode
  /** Si se define, la ruta solo es accesible para estos roles; si no, para cualquier sesión. */
  rolesPermitidos?: RolCodigo[]
  /** Si se define, la ruta solo es accesible para estas áreas (ej. Servicios Industriales, que no tiene un rol propio). */
  areasPermitidas?: AreaCodigo[]
  /** Si se define, la ruta NO es accesible para estas áreas, aunque el rol califique (ej. Servicios Industriales usa SUPERVISOR pero no debe entrar a las páginas de producción). */
  areasExcluidas?: AreaCodigo[]
  /** Si es true, la ruta solo es accesible para usuarios con usuarios.ve_errores = true (flag aparte del rol, ver migración 20261047090000) — hoy solo el dueño. */
  requiereVeErrores?: boolean
  /** Si se define, la ruta solo es accesible para ese username exacto (case-insensitive) — para vistas de prueba de un solo usuario. */
  usuarioPermitido?: string
}) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  // Área de Pruebas: ve y entra a TODO sin importar el rol o el área que
  // pida la ruta — es la cuenta de prueba, tiene que poder ejercitar
  // cualquier pantalla nueva que se agregue sin pedir un login distinto
  // por cada rol/área.
  const esPruebas = session.area === "PRUEBAS"
  if (esPruebas) return <>{children}</>
  if (rolesPermitidos && !rolesPermitidos.includes(session.rol)) return <Navigate to="/hub" replace />
  if (areasPermitidas && (!session.area || !areasPermitidas.includes(session.area))) return <Navigate to="/hub" replace />
  if (areasExcluidas && session.area && areasExcluidas.includes(session.area)) return <Navigate to="/hub" replace />
  if (requiereVeErrores && !session.veErrores) return <Navigate to="/hub" replace />
  if (usuarioPermitido && session.username.toLowerCase() !== usuarioPermitido.toLowerCase()) return <Navigate to="/hub" replace />
  return <>{children}</>
}
