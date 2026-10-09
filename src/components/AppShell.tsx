import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoMark } from "@/components/Logo"
import { AppHeader } from "@/components/AppHeader"
import { NavPanelesVista } from "@/components/NavPanelesVista"
import { BotonNavegacion } from "@/components/nav/BotonNavegacion"
import { MenuLateral } from "@/components/nav/MenuLateral"
import { useAuth } from "@/lib/auth"
import { esSoloVista } from "@/lib/rolVista"
import { cn } from "@/lib/utils"

export function AppShell({
  title,
  description,
  fullWidth,
  ocultarEstadoBanner,
  volverA = "/hub",
  children,
}: {
  title: string
  description?: string
  /** A dónde lleva la flecha si la página se abrió directo (sin un paso anterior dentro de la app). Ej. una calculadora vuelve a Calculadoras. */
  volverA?: string
  /** Usa todo el ancho disponible (sin max-w-6xl ni el padding lateral habitual) — para pantallas tipo dashboard que necesitan el espacio completo. */
  fullWidth?: boolean
  /** Para pantallas que ya muestran Área/Supervisor/Turno en su propio banner (ej. Panel de Producción) — evita repetir esa misma info dos veces seguidas. */
  ocultarEstadoBanner?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const soloVista = esSoloVista(session)

  /**
   * Flecha = un paso atrás, como el botón del navegador (ej. Calculadora de
   * Bobina → Calculadoras, no al Hub). React Router guarda la posición en el
   * historial (history.state.idx): con 0 no hay un paso anterior dentro de la
   * app (página abierta directo), y se va a volverA. El logo lleva al Hub.
   */
  function atras() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    // Reemplaza (no agrega): si no, la flecha siguiente volvería a la página abierta directo.
    else navigate(volverA, { replace: true })
  }

  return (
    <div className="flex min-h-svh bg-background">
      {/* Navegación entre pantallas: menú lateral en PC, botón flotante en el teléfono. Solo Vista tiene sus flechas. */}
      {!soloVista && <MenuLateral plegadoInicial={fullWidth} />}
      {!soloVista && <BotonNavegacion />}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={title}
          description={description}
          ocultarEstadoBanner={ocultarEstadoBanner}
          right={soloVista && <NavPanelesVista />}
          left={
            soloVista ? (
              // Solo Vista no tiene inicio al que volver: solo el logo, sin link.
              <LogoMark className="size-7 shrink-0" />
            ) : (
            <>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={atras} aria-label="Volver">
                <ArrowLeft className="size-4.5" />
              </Button>
              <Link to="/hub" className="hidden shrink-0 items-center sm:flex lg:hidden">
                <LogoMark className="size-7" />
              </Link>
            </>
            )
          }
        />

        <main
          className={cn(
            fullWidth
              ? "w-full flex-1 px-3 py-4 sm:px-4 sm:py-5 print:p-0"
              : "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0",
            // Lugar para el botón flotante: que no tape lo último de la página.
            !soloVista && "max-lg:pb-24",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
