import { useLayoutEffect, useRef, useState, type DependencyList } from "react"

/** Hasta dónde crece y achica la letra de una observación, en px. */
export const LETRA_MAX = 18
export const LETRA_MIN = 12
/** En el teléfono (una columna, con scroll) no hace falta ajustar. */
const LETRA_TELEFONO = 16

/**
 * La letra más grande (de `max` a `min` px) con la que `medido` no desborda.
 * Se pone en `el` y se vuelve a medir si cambia el tamaño de `medido` o de
 * `el`, y cuando termina de cargar la tipografía (con la definitiva el texto
 * ocupa otro alto).
 */
function useLetraQueEntra<T extends HTMLElement>(
  medidoDe: (el: T) => HTMLElement | null,
  rango: { max: number; min: number; telefono: number },
  deps: DependencyList,
) {
  const ref = useRef<T>(null)
  const [tamano, setTamano] = useState(rango.max)
  /** Ni con la letra mínima entra. */
  const [noEntra, setNoEntra] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const medido = medidoDe(el)
    const desborda = () => (medido ? medido.scrollHeight > medido.clientHeight + 1 : false)
    const ajustar = () => {
      let t = window.innerWidth < 1024 ? rango.telefono : rango.max
      el.style.fontSize = `${t}px`
      while (t > rango.min && desborda()) {
        t -= 0.5
        el.style.fontSize = `${t}px`
      }
      setTamano(t)
      setNoEntra(desborda())
    }
    ajustar()
    let vivo = true
    document.fonts?.ready.then(() => vivo && ajustar())
    const observador = new ResizeObserver(ajustar)
    if (medido) observador.observe(medido)
    observador.observe(el)
    return () => {
      vivo = false
      observador.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { ref, tamano, noEntra }
}

/**
 * La letra de una observación: la más grande con la que entra entera, para
 * leerla de una vez al exponer, sin hacer clic (dueña, 2026-10-15). Mide la
 * tarjeta que la contiene (marcada con `data-ajusta-texto`): la observación
 * ocupa lo que necesite, lo demás de la tarjeta (los anillos, la gráfica) se
 * achica, y la letra baja solo si aun así no entra. Sin tarjeta marcada (ej.
 * la tabla de semielaborado, que crece), queda en el máximo.
 */
export function useTextoAjustado(texto: string | undefined) {
  return useLetraQueEntra<HTMLParagraphElement>((el) => el.closest<HTMLElement>("[data-ajusta-texto]"), { max: LETRA_MAX, min: LETRA_MIN, telefono: LETRA_TELEFONO }, [texto])
}

/**
 * La letra base de un bloque que llena su espacio (ej. las paradas de la
 * línea): crece hasta `max` si sobra lugar y baja hasta `min` si no entra.
 * Lo de adentro se mide en `em`, así todo crece en proporción. `clave`
 * cambia cuando cambia el contenido.
 */
export function useBloqueAjustado(clave: string, rango: { max: number; min: number; telefono: number }) {
  return useLetraQueEntra<HTMLElement>((el) => el, rango, [clave, rango.max, rango.min, rango.telefono])
}
