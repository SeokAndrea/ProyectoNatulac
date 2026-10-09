import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { LogoMark } from "@/components/Logo"
import type { AppDef } from "@/lib/apps"
import { bloqueoDeApp, useAppsNavegables } from "@/lib/navegacion"
import { cn } from "@/lib/utils"

const CLAVE_PLEGADO = "natulac.menuPlegado"

function leerPlegado(): boolean {
  try {
    return localStorage.getItem(CLAVE_PLEGADO) === "1"
  } catch {
    return false
  }
}

/**
 * Menú lateral (PC, pantallas anchas): todas las pantallas que la persona
 * puede abrir, agrupadas como en el Hub. Se pliega a solo íconos y lo
 * recuerda; las pantallas de ancho completo (Panel) arrancan plegadas.
 */
export function MenuLateral({ plegadoInicial = false }: { plegadoInicial?: boolean }) {
  const { secciones, turnoActivo, turnoPorAsumir } = useAppsNavegables()
  const [plegado, setPlegado] = useState(() => plegadoInicial || leerPlegado())

  function alternar() {
    const nuevo = !plegado
    setPlegado(nuevo)
    if (plegadoInicial) return // en el Panel no cambia la preferencia del resto
    try {
      localStorage.setItem(CLAVE_PLEGADO, nuevo ? "1" : "0")
    } catch {
      // Sin almacenamiento: vale hasta recargar.
    }
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card/60 transition-[width] duration-200 lg:flex print:hidden",
        plegado ? "w-14" : "w-60",
      )}
    >
      <Link to="/hub" title="Inicio" className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border/70 px-3.5">
        <LogoMark className="size-7 shrink-0" />
        {!plegado && <span className="truncate text-sm font-semibold text-foreground">Inicio</span>}
      </Link>

      {/* Plegado sin barra de desplazamiento (en Windows ocupa ~17 px y dejaba los íconos fuera de su recuadro); se baja igual con la rueda. */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden px-2 py-2",
          plegado ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "[scrollbar-width:thin]",
        )}
      >
        {secciones.map(({ titulo, apps }, i) => (
          <div key={titulo ?? "otras"}>
            {plegado ? (
              i > 0 && <div className="mx-2 my-2 border-t border-border/70" />
            ) : (
              titulo && (
                <p className="truncate px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
              )
            )}
            {apps.map((app) => (
              <ItemMenu key={app.slug} app={app} plegado={plegado} turnoActivo={turnoActivo} turnoPorAsumir={turnoPorAsumir} />
            ))}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={alternar}
        aria-label={plegado ? "Desplegar menú" : "Plegar menú"}
        title={plegado ? "Desplegar menú" : "Plegar menú"}
        className="flex h-11 shrink-0 items-center gap-2.5 border-t border-border/70 px-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {plegado ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
        {!plegado && "Plegar"}
      </button>
    </aside>
  )
}

function ItemMenu({
  app,
  plegado,
  turnoActivo,
  turnoPorAsumir,
}: {
  app: AppDef
  plegado: boolean
  turnoActivo: boolean
  turnoPorAsumir: boolean
}) {
  const Icon = app.icon
  const { bloqueada, sinTurno } = bloqueoDeApp(app, turnoActivo, turnoPorAsumir)
  // Plegado: el ícono centrado en su recuadro.
  const base = cn("flex h-9 items-center gap-2.5 rounded-md text-sm", plegado ? "justify-center" : "px-2.5")

  if (bloqueada) {
    return (
      <div
        aria-disabled="true"
        title={sinTurno ? `${app.title}: se habilita al iniciar un turno` : `${app.title}: ya tienes un turno en curso`}
        className={cn(base, "cursor-not-allowed text-muted-foreground/60")}
      >
        <Lock className="size-4 shrink-0" />
        {!plegado && <span className="truncate">{app.title}</span>}
      </div>
    )
  }

  return (
    <NavLink
      to={app.href!}
      title={plegado ? app.title : undefined}
      className={({ isActive }) =>
        cn(
          base,
          "transition-colors",
          isActive ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!plegado && <span className="truncate">{app.title}</span>}
    </NavLink>
  )
}
