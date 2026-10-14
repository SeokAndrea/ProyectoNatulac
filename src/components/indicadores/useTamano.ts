import { useEffect, useRef, useState } from "react"

/**
 * Tamaño real de una caja, para dibujar los gráficos a su medida: así no se
 * estiran ni se agrandan con el zoom del navegador.
 */
export function useTamano<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [tam, setTam] = useState({ ancho: 0, alto: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observador = new ResizeObserver(([e]) => setTam({ ancho: Math.round(e.contentRect.width), alto: Math.round(e.contentRect.height) }))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  return { ref, ...tam }
}
