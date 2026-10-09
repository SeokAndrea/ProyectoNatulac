import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { LogOut, Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { EstadoBanner } from "@/components/EstadoBanner"
import { FranjaVerComo } from "@/components/VerComo"
import { useAuth } from "@/lib/auth"
import { useTema, type Tema } from "@/lib/tema"

const TEMA_INFO: Record<Tema, { Icono: typeof Sun; etiqueta: string }> = {
  claro: { Icono: Sun, etiqueta: "Tema claro" },
  oscuro: { Icono: Moon, etiqueta: "Tema oscuro" },
  sistema: { Icono: Monitor, etiqueta: "Tema del equipo" },
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

/*
 * Header compartido por Hub.tsx y AppShell.tsx: fila superior
 * (logo/back + título + usuario) más el EstadoBanner debajo. Se
 * queda fijo arriba de todo (sticky) al hacer scroll. "left" es la
 * parte izquierda de la fila superior — cada página le pasa su
 * propio logo o botón de volver.
 */
export function AppHeader({
  left,
  right,
  title,
  description,
  ocultarEstadoBanner,
}: {
  left: ReactNode
  /** Opcional: algo más antes del botón de tema (ej. la flecha entre paneles de Solo Vista). */
  right?: ReactNode
  title?: string
  description?: string
  ocultarEstadoBanner?: boolean
}) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const { tema, siguiente } = useTema()
  const { Icono: IconoTema, etiqueta: etiquetaTema } = TEMA_INFO[tema]

  function handleLogout() {
    logout()
    navigate("/", { replace: true })
  }

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur print:hidden">
      <FranjaVerComo />
      <div className="border-b border-border/70">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {left}

          {title ? (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h1>
              {description && (
                <p className="truncate text-xs text-muted-foreground sm:text-sm">{description}</p>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {right}

          <Button
            variant="ghost"
            size="icon"
            onClick={siguiente}
            aria-label={`${etiquetaTema}. Cambiar tema`}
            title={`${etiquetaTema} (clic para cambiar)`}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <IconoTema className="size-4.5" />
          </Button>

          {session && (
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
                  {initials(session.nombre)}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                aria-label="Cerrar sesión"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-4.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {!ocultarEstadoBanner && <EstadoBanner />}
    </div>
  )
}
