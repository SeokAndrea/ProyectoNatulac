import { useEffect, useState, type RefObject } from "react"

/** Más chico ya no se lee de lejos: mejor que quede algo abajo. */
const MINIMO = 0.6
const MAXIMO = 1.6

/**
 * Al presentar, cuánto agrandar o achicar el panel para que entre justo en
 * la pantalla (la TV de planta, 1280 × 720 o más), como useEscala de
 * Indicadores pero midiendo el alto real del contenido, que cambia con los
 * datos. `margen`: lo que no es contenido (padding de la capa, px). Sin
 * presentar, 1.
 */
export function useAjusteAPantalla(ref: RefObject<HTMLElement | null>, activo: boolean, margen = 24): number {
  const [escala, setEscala] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!activo || !el) {
      setEscala(1)
      return
    }
    const medir = () => {
      setEscala((actual) => {
        // El alto con la escala de ahora, llevado a escala 1.
        const natural = el.getBoundingClientRect().height / actual
        if (natural <= 0) return actual
        const siguiente = Math.min(MAXIMO, Math.max(MINIMO, (window.innerHeight - margen) / natural, 0))
        return Math.abs(siguiente - actual) > 0.01 ? siguiente : actual
      })
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    window.addEventListener("resize", medir)
    return () => {
      observador.disconnect()
      window.removeEventListener("resize", medir)
    }
  }, [ref, activo, margen])

  return activo ? escala : 1
}
