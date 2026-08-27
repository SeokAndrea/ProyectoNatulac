import { Navigate, Route, Routes } from "react-router-dom"
import Login from "@/pages/Login"
import Hub from "@/pages/Hub"
import ComenzarTurno from "@/pages/apps/ComenzarTurno"
import Status from "@/pages/apps/Status"
import Preparacion from "@/pages/apps/Preparacion"
import ProductoTerminado from "@/pages/apps/ProductoTerminado"
import FinalizarTurno from "@/pages/apps/FinalizarTurno"
import PanelProduccion from "@/pages/apps/PanelProduccion"
import HistorialDia from "@/pages/apps/HistorialDia"
import Calculadora from "@/pages/apps/Calculadora"
import Personal from "@/pages/apps/Personal"
import EdicionDatos from "@/pages/apps/EdicionDatos"
import CrearTurno from "@/pages/apps/CrearTurno"
import Historial from "@/pages/apps/Historial"
import Actas from "@/pages/apps/Actas"
import { ProtectedRoute } from "@/components/ProtectedRoute"

/*
 * Todas las rutas de la aplicación se declaran aquí. Las páginas
 * envueltas en <ProtectedRoute> solo son accesibles con sesión
 * iniciada (ver src/components/ProtectedRoute.tsx); si no hay sesión,
 * redirige al login. El prop rolesPermitidos restringe además por
 * rol (ej. el flujo de turno es solo para Supervisor) — mismo
 * criterio que rolesPermitidos en src/lib/apps.tsx, hay que
 * mantenerlos coherentes entre sí. Para agregar una app nueva al
 * hub, sumarla aquí y en src/lib/apps.tsx.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/hub"
        element={
          <ProtectedRoute>
            <Hub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/turno"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <ComenzarTurno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/status"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <Status />
          </ProtectedRoute>
        }
      />
      <Route
        path="/preparacion"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <Preparacion />
          </ProtectedRoute>
        }
      />
      <Route
        path="/producto-terminado"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <ProductoTerminado />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finalizar-turno"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <FinalizarTurno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/panel-produccion"
        element={
          <ProtectedRoute>
            <PanelProduccion />
          </ProtectedRoute>
        }
      />
      <Route
        path="/historial-dia"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERVISOR"]}>
            <HistorialDia />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calculadora"
        element={
          <ProtectedRoute>
            <Calculadora />
          </ProtectedRoute>
        }
      />
      <Route
        path="/personal"
        element={
          <ProtectedRoute rolesPermitidos={["ADMINISTRADOR_AREA"]}>
            <Personal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edicion-datos"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
            <EdicionDatos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/crear-turno"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
            <CrearTurno />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditoria"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR", "ADMINISTRADOR_AREA"]}>
            <Historial />
          </ProtectedRoute>
        }
      />
      <Route
        path="/actas"
        element={
          <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR", "ADMINISTRADOR_AREA"]}>
            <Actas />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
