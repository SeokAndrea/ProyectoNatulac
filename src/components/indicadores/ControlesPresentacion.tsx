import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { SECCIONES, type Seccion } from "@/components/indicadores/secciones"

const boton = "grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-30"

/**
 * En modo presentación: abajo a la derecha, tenue hasta pasar el mouse.
 * Pantalla anterior / siguiente (también con ← →) y salir (también con Esc).
 * Va fuera de la lámina, así no sale en el PDF.
 */
export function ControlesPresentacion({
  seccion,
  secciones,
  onSeccion,
  onSalir,
}: {
  seccion: Seccion
  /** Las pantallas que se presentan (las que tienen datos). */
  secciones: Seccion[]
  onSeccion: (s: Seccion) => void
  onSalir: () => void
}) {
  const i = secciones.indexOf(seccion)
  return (
    <div className="fixed right-3 bottom-3 z-[60] flex items-center gap-1 rounded-sm border bg-card/90 px-1.5 py-1 text-sm opacity-40 shadow-sm transition-opacity hover:opacity-100 focus-within:opacity-100">
      <button type="button" className={boton} aria-label="Pantalla anterior" disabled={i <= 0} onClick={() => onSeccion(secciones[i - 1])}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-28 text-center text-xs font-semibold tracking-wide">{SECCIONES.find((s) => s.valor === seccion)?.texto}</span>
      <button
        type="button"
        className={boton}
        aria-label="Pantalla siguiente"
        disabled={i >= secciones.length - 1}
        onClick={() => onSeccion(secciones[i + 1])}
      >
        <ChevronRight className="size-4" />
      </button>
      <button type="button" className={boton} aria-label="Salir de la presentación (Esc)" title="Salir (Esc)" onClick={onSalir}>
        <X className="size-4" />
      </button>
    </div>
  )
}
