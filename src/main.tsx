import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { CatalogosProvider } from '@/lib/catalogosLive'
import { SesionTurnoProvider } from '@/lib/sesionTurno'

// Tras un deploy, una pestaña vieja pide pantallas que ya no existen en el servidor: se recarga una vez para tomar la versión nueva.
window.addEventListener('vite:preloadError', (evento) => {
  try {
    const ultima = Number(sessionStorage.getItem('natulac-recarga-version') ?? 0)
    if (Date.now() - ultima < 30_000) return
    sessionStorage.setItem('natulac-recarga-version', String(Date.now()))
  } catch {
    // Sin sessionStorage: igual se recarga.
  }
  evento.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* SesionTurnoProvider: identidad de turno para los 3 módulos
            (Preparación/Producción/Producto Terminado) — solo depende de
            AuthProvider. TurnoProvider (el viejo, con todo el blob de
            datos en un contexto) se retiró de acá: ninguna página lo
            usa más (Fase 1, paso 6 del plan) — turno.ts en sí sigue
            existiendo solo por sus funciones puras compartidas
            (fechaLocal, saborSinFamiliaOculta, LIMITE_MERMA) y por
            panelProduccion.ts, que todavía lo usa para resolver QUÉ
            turno mostrarle al Panel de Producción. */}
        <SesionTurnoProvider>
          <CatalogosProvider>
            <App />
          </CatalogosProvider>
        </SesionTurnoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
