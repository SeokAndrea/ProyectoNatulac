import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth"
import Login from "@/pages/Login"
import PrimerIngreso from "@/pages/PrimerIngreso"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { InicioSegunRol } from "@/components/InicioSegunRol"
import { VersionChecker } from "@/components/VersionChecker"

// Cada pantalla se descarga al abrirla: el login y el hub no cargan el código de toda la app.
const ComenzarTurno = lazy(() => import("@/pages/apps/ComenzarTurno"))
const Preparacion = lazy(() => import("@/pages/apps/Preparacion"))
const Lineas = lazy(() => import("@/pages/apps/Lineas"))
const ProductoTerminado = lazy(() => import("@/pages/apps/ProductoTerminado"))
const FinalizarTurno = lazy(() => import("@/pages/apps/FinalizarTurno"))
const MisActas = lazy(() => import("@/pages/apps/MisActas"))
const ResumenDia = lazy(() => import("@/pages/apps/ResumenDia"))
const PanelProduccion = lazy(() => import("@/pages/apps/PanelProduccion"))
const PanelParadas = lazy(() => import("@/pages/apps/PanelParadas"))
const RegistrarParadas = lazy(() => import("@/pages/apps/RegistrarParadas"))
const CatalogoParadas = lazy(() => import("@/pages/apps/CatalogoParadas"))
const Programacion = lazy(() => import("@/pages/apps/Programacion"))
const EdicionDatos = lazy(() => import("@/pages/apps/EdicionDatos"))
const Personal = lazy(() => import("@/pages/apps/Personal"))
const CalculadoraBobina = lazy(() => import("@/pages/apps/CalculadoraBobina"))
const CalculadoraFormula = lazy(() => import("@/pages/apps/CalculadoraFormula"))
const CalculadoraConteoPeso = lazy(() => import("@/pages/apps/CalculadoraConteoPeso"))
const Calculadoras = lazy(() => import("@/pages/apps/Calculadoras"))
const Historial = lazy(() => import("@/pages/apps/Historial"))
const ServiciosIndustriales = lazy(() => import("@/pages/apps/ServiciosIndustriales"))
const RegistrosServiciosIndustriales = lazy(() => import("@/pages/apps/RegistrosServiciosIndustriales"))
const ErroresCliente = lazy(() => import("@/pages/apps/ErroresCliente"))
const PreparacionPLC = lazy(() => import("@/pages/apps/PreparacionPLC"))
const Calidad = lazy(() => import("@/pages/apps/Calidad"))

function CargandoPantalla() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

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
      <Suspense fallback={<CargandoPantalla />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/hub"
            element={
              <ProtectedRoute>
                <InicioSegunRol />
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
      </Suspense>
    </>
  )
}
