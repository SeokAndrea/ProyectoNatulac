import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { CatalogosProvider } from '@/lib/catalogosLive'
import { SesionTurnoProvider } from '@/lib/sesionTurno'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* SesionTurnoProvider: identidad de turno para los 3 módulos
            (Preparación/Producción/Producto Terminado) — solo depende de
            AuthProvider. TurnoProvider (el viejo, con todo el blob de
            datos en un contexto) se retiró de acá: ninguna página lo
            usa más (Fase 1, paso 6 del plan) — turno.tsx en sí sigue
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
