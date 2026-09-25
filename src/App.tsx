import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import Login from "@/pages/Login"
import PrimerIngreso from "@/pages/PrimerIngreso"
import Hub from "@/pages/Hub"
import ComenzarTurno from "@/pages/apps/ComenzarTurno"
import Preparacion from "@/pages/apps/Preparacion"
import Lineas from "@/pages/apps/Lineas"
import ProductoTerminado from "@/pages/apps/ProductoTerminado"
import FinalizarTurno from "@/pages/apps/FinalizarTurno"
import MisActas from "@/pages/apps/MisActas"
import PanelProduccion from "@/pages/apps/PanelProduccion"
import PanelParadas from "@/pages/apps/PanelParadas"
import Paradas from "@/pages/apps/Paradas"
import CatalogoParadas from "@/pages/apps/CatalogoParadas"
import ParadasMantenimiento from "@/pages/apps/ParadasMantenimiento"
import Programacion from "@/pages/apps/Programacion"
import EdicionDatos from "@/pages/apps/EdicionDatos"
import CalculadoraBobina from "@/pages/apps/CalculadoraBobina"
import CalculadoraFormula from "@/pages/apps/CalculadoraFormula"
import CalculadoraConteoPeso from "@/pages/apps/CalculadoraConteoPeso"
import Calculadoras from "@/pages/apps/Calculadoras"
import Historial from "@/pages/apps/Historial"
import Validar from "@/pages/apps/Validar"
import ServiciosIndustriales from "@/pages/apps/ServiciosIndustriales"
import RegistrosServiciosIndustriales from "@/pages/apps/RegistrosServiciosIndustriales"
import ErroresCliente from "@/pages/apps/ErroresCliente"
import PreparacionPLC from "@/pages/apps/PreparacionPLC"
import AuditoriaDemo from "@/pages/apps/AuditoriaDemo"
import ValidarDemo from "@/pages/apps/ValidarDemo"
import ParadasDemo from "@/pages/apps/ParadasDemo"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { VersionChecker } from "@/components/VersionChecker"

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
  const { session } = useAuth()

  // Primer ingreso (o clave que no cumple la política): se muestra SOLO
  // la pantalla para corroborar datos + definir clave, cualquiera sea
  // la URL, hasta completarlo (ver src/lib/auth.tsx).
  if (session?.debeCompletarPerfil) {
    return <PrimerIngreso />
  }

  return (
    <>
      <VersionChecker />
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
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <ComenzarTurno />
            </ProtectedRoute>
          }
        />
        <Route
          path="/preparacion"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <Preparacion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lineas"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <Lineas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/producto-terminado"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <ProductoTerminado />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finalizar-turno"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <FinalizarTurno />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mis-actas"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <MisActas />
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
          path="/paradas"
          element={
            // Supervisores y Super Administrador registran paradas (coincide con src/lib/apps.tsx).
            <ProtectedRoute rolesPermitidos={["SUPERVISOR", "SUPERADMINISTRADOR"]} areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <Paradas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogo-paradas"
          element={
            // Solo SUPERADMINISTRADOR (el Área de Pruebas también entra). Coincide con src/lib/apps.tsx.
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <CatalogoParadas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/paradas-mantenimiento"
          element={
            // Solo el área de Mantenimiento registra estas paradas (el Área de Pruebas también entra). Coincide con src/lib/apps.tsx.
            <ProtectedRoute areasPermitidas={["MANTENIMIENTO"]}>
              <ParadasMantenimiento />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-paradas"
          element={
            // Dashboard de solo lectura: cualquier sesión, igual que el Panel de Producción.
            <ProtectedRoute>
              <PanelParadas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/programacion"
          element={
            <ProtectedRoute areasExcluidas={["SERVICIOS_INDUSTRIALES"]}>
              <Programacion />
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
          path="/calculadoras"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <Calculadoras />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-bobina"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <CalculadoraBobina />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-formula"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <CalculadoraFormula />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-conteo-peso"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <CalculadoraConteoPeso />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <Historial />
            </ProtectedRoute>
          }
        />
        <Route
          path="/validar"
          element={
            <ProtectedRoute rolesPermitidos={["SUPERADMINISTRADOR"]}>
              <Validar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/servicios-industriales"
          element={
            <ProtectedRoute areasPermitidas={["SERVICIOS_INDUSTRIALES"]}>
              <ServiciosIndustriales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/registros-servicios-industriales"
          element={
            <ProtectedRoute areasPermitidas={["SERVICIOS_INDUSTRIALES"]}>
              <RegistrosServiciosIndustriales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/errores"
          element={
            <ProtectedRoute requiereVeErrores>
              <ErroresCliente />
            </ProtectedRoute>
          }
        />
        <Route
          path="/preparacion-plc"
          element={
            <ProtectedRoute usuarioPermitido="arondon">
              <PreparacionPLC />
            </ProtectedRoute>
          }
        />
        {/* Previews de diseño sin login ni DB — se pueden borrar. */}
        <Route path="/auditoria-demo" element={<AuditoriaDemo />} />
        <Route path="/validar-demo" element={<ValidarDemo />} />
        <Route path="/paradas-demo" element={<ParadasDemo />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
