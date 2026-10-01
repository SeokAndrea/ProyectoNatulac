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
import ResumenDia from "@/pages/apps/ResumenDia"
import PanelProduccion from "@/pages/apps/PanelProduccion"
import PanelParadas from "@/pages/apps/PanelParadas"
import RegistrarParadas from "@/pages/apps/RegistrarParadas"
import CatalogoParadas from "@/pages/apps/CatalogoParadas"
import Programacion from "@/pages/apps/Programacion"
import EdicionDatos from "@/pages/apps/EdicionDatos"
import Personal from "@/pages/apps/Personal"
import CalculadoraBobina from "@/pages/apps/CalculadoraBobina"
import CalculadoraFormula from "@/pages/apps/CalculadoraFormula"
import CalculadoraConteoPeso from "@/pages/apps/CalculadoraConteoPeso"
import Calculadoras from "@/pages/apps/Calculadoras"
import Historial from "@/pages/apps/Historial"
import ServiciosIndustriales from "@/pages/apps/ServiciosIndustriales"
import RegistrosServiciosIndustriales from "@/pages/apps/RegistrosServiciosIndustriales"
import ErroresCliente from "@/pages/apps/ErroresCliente"
import PreparacionPLC from "@/pages/apps/PreparacionPLC"
import Calidad from "@/pages/apps/Calidad"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { VersionChecker } from "@/components/VersionChecker"

/*
 * Todas las rutas de la aplicación se declaran aquí. Las páginas
 * envueltas en <ProtectedRoute> solo son accesibles con sesión
 * iniciada (ver src/components/ProtectedRoute.tsx); si no hay sesión,
 * redirige al login. Con app="slug" la ruta toma los mismos criterios
 * (permiso, áreas) que la tarjeta de src/lib/apps.tsx: una sola fuente.
 * Para agregar una app nueva al hub, sumarla en src/lib/apps.tsx y
 * registrar aquí su ruta con app="slug".
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
            <ProtectedRoute app="comenzar-turno">
              <ComenzarTurno />
            </ProtectedRoute>
          }
        />
        <Route
          path="/preparacion"
          element={
            <ProtectedRoute app="preparacion">
              <Preparacion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lineas"
          element={
            <ProtectedRoute app="lineas">
              <Lineas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/producto-terminado"
          element={
            <ProtectedRoute app="producto-terminado">
              <ProductoTerminado />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finalizar-turno"
          element={
            <ProtectedRoute app="finalizar-turno">
              <FinalizarTurno />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mis-actas"
          element={
            <ProtectedRoute app="mis-actas">
              <MisActas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-produccion"
          element={
            <ProtectedRoute app="panel-produccion">
              <PanelProduccion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/paradas"
          element={
            <ProtectedRoute app="paradas">
              <RegistrarParadas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogo-paradas"
          element={
            <ProtectedRoute app="catalogo-paradas">
              <CatalogoParadas />
            </ProtectedRoute>
          }
        />
        {/* La pantalla de Mantenimiento pasó a ser Registrar Paradas, para todos (migración 20261090). */}
        <Route path="/paradas-mantenimiento" element={<Navigate to="/paradas" replace />} />
        <Route
          path="/panel-paradas"
          element={
            <ProtectedRoute app="panel-paradas">
              <PanelParadas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/programacion"
          element={
            <ProtectedRoute app="programacion">
              <Programacion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/personal"
          element={
            <ProtectedRoute app="personal">
              <Personal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edicion-datos"
          element={
            <ProtectedRoute app="edicion-datos">
              <EdicionDatos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadoras"
          element={
            <ProtectedRoute app="calculadoras">
              <Calculadoras />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-bobina"
          element={
            <ProtectedRoute app="calculadora-bobina">
              <CalculadoraBobina />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-formula"
          element={
            <ProtectedRoute app="calculadora-formula">
              <CalculadoraFormula />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calculadora-conteo-peso"
          element={
            <ProtectedRoute app="calculadora-conteo-peso">
              <CalculadoraConteoPeso />
            </ProtectedRoute>
          }
        />
        <Route
          path="/resumen-dia"
          element={
            <ProtectedRoute app="resumen-dia">
              <ResumenDia />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute app="auditoria">
              <Historial />
            </ProtectedRoute>
          }
        />
        <Route
          path="/servicios-industriales"
          element={
            <ProtectedRoute app="servicios-industriales">
              <ServiciosIndustriales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/registros-servicios-industriales"
          element={
            <ProtectedRoute app="registros-servicios-industriales">
              <RegistrosServiciosIndustriales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/errores"
          element={
            <ProtectedRoute app="errores">
              <ErroresCliente />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calidad"
          element={
            <ProtectedRoute app="calidad">
              <Calidad />
            </ProtectedRoute>
          }
        />
        <Route
          path="/preparacion-plc"
          element={
            <ProtectedRoute app="preparacion-plc">
              <PreparacionPLC />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
