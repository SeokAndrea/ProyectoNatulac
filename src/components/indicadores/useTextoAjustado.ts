import { useLayoutEffect, useRef, useState } from "react"

/** Hasta dónde crece y achica la letra de una observación, en px. */
export const LETRA_MAX = 18
export const LETRA_MIN = 12
/** En el teléfono (una columna, con scroll) no hace falta ajustar. */
const LETRA_TELEFONO = 16

/**
 * La letra más grande con la que la observación entra entera, para leerla de
 * una vez al exponer, sin hacer clic (dueña, 2026-10-15). Mide la tarjeta que
 * la contiene (marcada con `data-ajusta-texto`): la observación ocupa lo que
 * necesite, lo demás de la tarjeta (los anillos, la gráfica) se achica, y la
 * letra baja solo si aun así no entra. Sin tarjeta marcada (ej. la tabla de
 * semielaborado, que crece), queda en el máximo.
 */
export function useTextoAjustado(texto: string | undefined) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [tamano, setTamano] = useState(LETRA_MAX)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const tarjeta = el.closest<HTMLElement>("[data-ajusta-texto]")
    const desborda = () => (tarjeta ? tarjeta.scrollHeight > tarjeta.clientHeight + 1 : false)
    const ajustar = () => {
      let t = window.innerWidth < 1024 ? LETRA_TELEFONO : LETRA_MAX
      el.style.fontSize = `${t}px`
      while (t > LETRA_MIN && desborda()) {
        t -= 1
        el.style.fontSize = `${t}px`
      }
      setTamano(t)
    }
    ajustar()
    // Se vuelve a medir si cambia la tarjeta (ventana, zoom, modo presentación) o el texto mismo, y cuando
    // termina de cargar la tipografía (con la definitiva el texto ocupa otro alto).
    let vivo = true
    document.fonts?.ready.then(() => vivo && ajustar())
    const observador = new ResizeObserver(ajustar)
    if (tarjeta) observador.observe(tarjeta)
    observador.observe(el)
    return () => {
      vivo = false
      observador.disconnect()
    }
  }, [texto])

  return { ref, tamano }
}
