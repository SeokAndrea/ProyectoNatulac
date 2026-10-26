import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

/** Píxeles por segundo al desplazarse: despacio, para leerlo en la pantalla de planta. */
const VELOCIDAD = 30

/**
 * Un renglón que, si el texto no entra, lo desplaza despacio de punta a
 * punta (y vuelve), con una pausa en cada extremo. Si entra, queda quieto.
 * Con «reducir movimiento» se ve entero en dos renglones (index.css).
 * Para la descripción de una parada en los paneles (dueña, 2026-10-23).
 */
export function TextoDesplazable({ texto, className }: { texto: string; className?: string }) {
  const caja = useRef<HTMLSpanElement>(null)
  const contenido = useRef<HTMLSpanElement>(null)
  const [exceso, setExceso] = useState(0)

  useLayoutEffect(() => {
    const c = caja.current
    const t = contenido.current
    if (!c || !t) return
    const medir = () => setExceso(Math.max(0, Math.ceil(t.scrollWidth - c.clientWidth)))
    medir()
    if (typeof ResizeObserver === "undefined") return
    const observador = new ResizeObserver(medir)
    observador.observe(c)
    return () => observador.disconnect()
  }, [texto])

  const estilo =
    exceso > 0
      ? ({ "--desplazar": `-${exceso}px`, "--duracion": `${(exceso / VELOCIDAD / 0.7 + 2).toFixed(1)}s` } as CSSProperties)
      : undefined

  return (
    <span ref={caja} title={texto} className={cn("texto-desplazable-caja block overflow-hidden whitespace-nowrap", className)}>
      <span ref={contenido} className={cn("inline-block", exceso > 0 && "texto-desplazable")} style={estilo}>
        {texto}
      </span>
    </span>
  )
}
