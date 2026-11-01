import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Pause } from "lucide-react"
import PanelParadas from "@/pages/apps/PanelParadas"
import PanelProduccion from "@/pages/apps/PanelProduccion"
import { cn } from "@/lib/utils"

/** Cada cuánto cambia de panel (dueña, 2026-10-31: un minuto cada uno). */
export const MINUTO_POR_PANEL_MS = 60_000

const PANELES = [
  { clave: "produccion", nombre: "Producción" },
  { clave: "paradas", nombre: "Paradas" },
] as const

/**
 * Modo TV de la planta: el Panel de Producción y el de Paradas, un minuto cada
 * uno, a pantalla completa. Los dos quedan montados (cambiar es instantáneo y
 * cada uno sigue refrescándose solo); en el de Paradas los carruseles pasan
 * solos. ↑ ↓ cambian de panel (← → ya mueven los carruseles), espacio pausa
 * en el que está, Esc sale.
 */
export default function ModoTv() {
  const navigate = useNavigate()
  const [indice, setIndice] = useState(0)
  const [pausado, setPausado] = useState(false)
  /** Cambia en cada vuelta: reinicia la barrita de lo que falta. */
  const [vuelta, setVuelta] = useState(0)
  /** Para salir una sola vez: Esc y el «salí de pantalla completa» llegan juntos. */
  const saliendo = useRef(false)

  const ir = (paso: number) => {
    setIndice((i) => (i + paso + PANELES.length) % PANELES.length)
    setVuelta((v) => v + 1)
  }

  useEffect(() => {
    if (pausado) return
    const id = setTimeout(() => ir(1), MINUTO_POR_PANEL_MS)
    return () => clearTimeout(id)
  }, [pausado, vuelta])

  useEffect(() => {
    const salir = () => {
      if (saliendo.current) return
      saliendo.current = true
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      navigate(-1)
    }
    const alPresionar = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowDown" || ev.key === "PageDown") {
        ev.preventDefault()
        ir(1)
      } else if (ev.key === "ArrowUp" || ev.key === "PageUp") {
        ev.preventDefault()
        ir(-1)
      } else if (ev.key === " ") {
        ev.preventDefault()
        setPausado((p) => !p)
        setVuelta((v) => v + 1)
      } else if (ev.key === "Escape") {
        salir()
      }
    }
    // Esc con pantalla completa: el navegador sale de ella y eso también cierra el modo TV.
    const alSalirDePantallaCompleta = () => {
      if (!document.fullscreenElement) salir()
    }
    window.addEventListener("keydown", alPresionar)
    document.addEventListener("fullscreenchange", alSalirDePantallaCompleta)
    return () => {
      window.removeEventListener("keydown", alPresionar)
      document.removeEventListener("fullscreenchange", alSalirDePantallaCompleta)
    }
  }, [navigate])

  return (
    <div className="min-h-svh bg-background">
      <div hidden={indice !== 0}>
        <PanelProduccion enTv />
      </div>
      <div hidden={indice !== 1}>
        <PanelParadas enTv />
      </div>

      {/* Qué panel se ve y cuánto falta: chico, arriba a la izquierda, donde no tapa nada (dueña, 2026-10-31). */}
      <div
        className="fixed top-3 left-3 z-[60] flex w-64 items-center gap-1.5 rounded-lg border border-border bg-card/95 px-1.5 py-1 text-sm shadow-sm backdrop-blur"
        title="↑ ↓ cambiar panel · espacio pausar · Esc salir"
      >
        {PANELES.map((p, i) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => {
              setIndice(i)
              setVuelta((v) => v + 1)
            }}
            className={cn("rounded-md px-2 py-0.5 font-medium", i === indice ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {p.nombre}
          </button>
        ))}
        <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          {!pausado && <div key={vuelta} className="h-full rounded-full bg-primary" style={{ animation: `avance-tv ${MINUTO_POR_PANEL_MS}ms linear forwards` }} />}
        </div>
        {pausado && (
          <span className="flex items-center text-warning-foreground" title="Pausado">
            <Pause className="size-3.5" aria-label="Pausado" />
          </span>
        )}
      </div>
      <style>{"@keyframes avance-tv { from { width: 0% } to { width: 100% } } @media (prefers-reduced-motion: reduce) { [style*='avance-tv'] { animation: none !important; width: 100%; } }"}</style>
    </div>
  )
}
