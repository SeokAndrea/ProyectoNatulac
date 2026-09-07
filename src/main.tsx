import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/lib/auth'
import { TurnoProvider } from '@/lib/turno'
import { CatalogosProvider } from '@/lib/catalogosLive'
import { SesionTurnoProvider } from '@/lib/sesionTurno'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* SesionTurnoProvider: identidad de turno para los 3 módulos nuevos
            (Preparación/Producción/Producto Terminado) — solo depende de
            AuthProvider. Independiente de TurnoProvider (el viejo, con todo
            el blob de datos), que sigue viviendo hasta que nada lo importe. */}
        <SesionTurnoProvider>
          <CatalogosProvider>
            <TurnoProvider>
              <App />
            </TurnoProvider>
          </CatalogosProvider>
        </SesionTurnoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
