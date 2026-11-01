import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Pause } from "lucide-react"
import type { GrupoTipo } from "@/lib/paradas"
import { cn } from "@/lib/utils"
import { RankList } from "./RankList"

/** Cada cuánto pasa sola una vista con el modo presentar (dueña, 2026-10-31). */
export const PASO_CARRUSEL_MS = 8000
/** Tocado para analizar: se queda quieto este rato y después vuelve a pasar solo. */
const PAUSA_MS = 60000

export interface VistaCarrusel {
  /** «Equipos», «Sistemas»… */
  nombre: string
  items: GrupoTipo[]
}

/**
 * Top 3 que va pasando por varias vistas (equipos, sistemas, subsistemas),
 * por tiempo y con sus veces al lado. Con `presentar` pasa solo; tocarlo lo
 * deja quieto para analizar (otra vez, o al minuto, sigue). Sin `presentar`,
 * se cambia con las flechas de pantalla. Teclado: ← → con el carrusel
 * enfocado; al presentar, ← → mueven todos juntos (la TV, con teclado o
 * control). Cada vista entra deslizándose del lado hacia el que se movió.
 */
/** `color`: el de las barras (el de la línea, en su columna); sin él, el rojo de las paradas. */
export function CarruselTop({ vistas, presentar, color }: { vistas: VistaCarrusel[]; presentar: boolean; color?: string }) {
  const [indice, setIndice] = useState(0)
  /** Hacia dónde se movió la última vez: la vista nueva entra desde ese lado. */
  const [direccion, setDireccion] = useState<1 | -1>(1)
  const [pausadoHasta, setPausadoHasta] = useState<number | null>(null)
  const actual = vistas[indice % vistas.length]
  const pausado = pausadoHasta !== null

  useEffect(() => {
    if (!presentar || vistas.length < 2) return
    if (pausadoHasta !== null) {
      const id = setTimeout(() => setPausadoHasta(null), Math.max(0, pausadoHasta - Date.now()))
      return () => clearTimeout(id)
    }
    const id = setInterval(() => {
      setDireccion(1)
      setIndice((i) => (i + 1) % vistas.length)
    }, PASO_CARRUSEL_MS)
    return () => clearInterval(id)
  }, [presentar, pausadoHasta, vistas.length])

  const mover = (paso: 1 | -1) => {
    setDireccion(paso)
    setIndice((i) => (i + paso + vistas.length) % vistas.length)
  }

  // Presentando, las flechas del teclado mueven todos los carruseles a la vez (sin tener que enfocar uno).
  useEffect(() => {
    if (!presentar) return
    const alPresionar = (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return
      ev.preventDefault()
      const paso = ev.key === "ArrowRight" ? 1 : -1
      setDireccion(paso)
      setIndice((i) => (i + paso + vistas.length) % vistas.length)
    }
    window.addEventListener("keydown", alPresionar)
    return () => window.removeEventListener("keydown", alPresionar)
  }, [presentar, vistas.length])
  const alternarPausa = () => setPausadoHasta((p) => (p === null ? Date.now() + PAUSA_MS : null))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold text-muted-foreground uppercase" aria-live="polite">
          {actual.nombre} · por tiempo
        </h3>
        {presentar && pausado && (
          <span className="flex items-center gap-1 text-xs font-semibold text-warning-foreground">
            <Pause className="size-3" aria-hidden /> Pausado
          </span>
        )}
        <button type="button" aria-label="Anterior" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted" onClick={() => mover(-1)}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" aria-label="Siguiente" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted" onClick={() => mover(1)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div
        role={presentar ? "button" : "group"}
        aria-label={presentar ? (pausado ? "Seguir pasando solo" : "Dejar quieto para analizar") : `${actual.nombre}: con las flechas ← → se cambia`}
        title={presentar ? (pausado ? "Toca para que siga pasando solo" : "Toca para dejarlo quieto") : undefined}
        onClick={presentar ? alternarPausa : undefined}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            // Presentando ya las mueve el teclado de toda la pantalla.
            if (!presentar) {
              e.preventDefault()
              mover(e.key === "ArrowRight" ? 1 : -1)
            }
          } else if (presentar && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault()
            alternarPausa()
          }
        }}
        aria-roledescription="carrusel"
        className={cn("min-h-24 overflow-hidden rounded-md text-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50", presentar && "cursor-pointer", pausado && "ring-1 ring-warning")}
      >
        <div
          key={indice}
          className={cn("animate-in fade-in-0 duration-300 motion-reduce:animate-none", direccion === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4")}
        >
          <RankList items={actual.items} metrica="minutos" compacto conAmbas color={color} />
        </div>
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {vistas.map((v, i) => (
          <span key={v.nombre} className={cn("size-1.5 rounded-full", i === indice % vistas.length ? "bg-foreground" : "bg-border")} />
        ))}
      </div>
    </div>
  )
}
