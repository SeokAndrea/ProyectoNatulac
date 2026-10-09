import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { House, LayoutGrid, X, type LucideIcon } from "lucide-react"
import { useAppsNavegables } from "@/lib/navegacion"
import { cn } from "@/lib/utils"

/** Cuántas pantallas muestra el abanico (además de Inicio). */
const MAX_PANTALLAS = 5

/**
 * Botón flotante (teléfono y tablet): al tocarlo se abre un abanico con las
 * pantallas principales (Supervisor: el flujo del turno) e Inicio. Se
 * esconde al bajar la página y con el teclado abierto, para no tapar nada.
 */
export function BotonNavegacion() {
  const { rapidas } = useAppsNavegables()
  const { pathname } = useLocation()
  const [abierto, setAbierto] = useState(false)
  const oculto = useOcultarAlBajarOEscribir()
  const pantallas = rapidas.filter((app) => app.href !== pathname).slice(0, MAX_PANTALLAS)
  const cerrar = () => setAbierto(false)

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false)
    window.addEventListener("keydown", alTeclear)
    return () => window.removeEventListener("keydown", alTeclear)
  }, [abierto])

  const opciones: { href: string; titulo: string; icon: LucideIcon }[] = [
    ...pantallas.map((app) => ({ href: app.href!, titulo: app.title, icon: app.icon })),
    { href: "/hub", titulo: "Inicio", icon: House },
  ]

  return (
    <div className="lg:hidden print:hidden">
      {abierto && <div className="fixed inset-0 z-40 bg-background/75 backdrop-blur-[2px] animate-in fade-in-0" onClick={cerrar} />}

      <div
        className={cn(
          "fixed right-4 z-50 flex flex-col items-end gap-2.5 transition-all duration-200",
          oculto && !abierto && "pointer-events-none translate-y-24 opacity-0",
        )}
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {abierto &&
          opciones.map(({ href, titulo, icon: Icon }, i) => (
            <Link
              key={href}
              to={href}
              onClick={cerrar}
              className="flex items-center gap-2.5 animate-in fade-in-0 slide-in-from-bottom-2"
              style={{ animationDelay: `${(opciones.length - 1 - i) * 30}ms`, animationFillMode: "backwards" }}
            >
              <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground shadow-sm">{titulo}</span>
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary shadow-md">
                <Icon className="size-5" />
              </span>
            </Link>
          ))}

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? "Cerrar menú" : "Ir a otra pantalla"}
          aria-expanded={abierto}
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          {abierto ? <X className="size-6" /> : <LayoutGrid className="size-6" />}
        </button>
      </div>
    </div>
  )
}

/** true al bajar la página o con un campo de texto en foco (teclado abierto en el teléfono). */
function useOcultarAlBajarOEscribir(): boolean {
  const [alBajar, setAlBajar] = useState(false)
  const [escribiendo, setEscribiendo] = useState(false)
  const ultimoY = useRef(0)

  useEffect(() => {
    ultimoY.current = window.scrollY
    function alDesplazar() {
      const y = window.scrollY
      const delta = y - ultimoY.current
      if (Math.abs(delta) < 8) return
      setAlBajar(delta > 0 && y > 80)
      ultimoY.current = y
    }
    const esCampoDeTexto = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(el.type))
    const alEnfocar = (e: FocusEvent) => setEscribiendo(esCampoDeTexto(e.target))
    const alDesenfocar = () => setEscribiendo(false)

    window.addEventListener("scroll", alDesplazar, { passive: true })
    document.addEventListener("focusin", alEnfocar)
    document.addEventListener("focusout", alDesenfocar)
    return () => {
      window.removeEventListener("scroll", alDesplazar)
      document.removeEventListener("focusin", alEnfocar)
      document.removeEventListener("focusout", alDesenfocar)
    }
  }, [])

  return alBajar || escribiendo
}
