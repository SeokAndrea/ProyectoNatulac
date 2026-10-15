import { useEffect, useState } from "react"

/**
 * La pantalla de Indicadores está pensada para una ventana de 1366 × 768: de
 * ancho 1366 y de alto 652 para las láminas (768 menos el encabezado de la
 * app, 7,25 rem).
 */
const BASE = { ancho: 1366, alto: 768 - 116 }
/** Lo que no es lámina: el encabezado de la app, o solo el margen al presentar (px). */
const ENCABEZADO = { normal: 116, presentando: 24 }
const MAXIMO = 2.2
/**
 * También achica: en una laptop de 1366 × 768 la ventana del navegador mide
 * menos de 768 de alto (pestañas, barra) y había que alejar el zoom a mano
 * (dueña, 2026-10-15). Más chico que esto ya no se lee: mejor scroll.
 */
const MINIMO = 0.7

function escalaActual(presentando: boolean): number {
  if (typeof window === "undefined" || window.innerWidth < 1024) return 1
  const alto = window.innerHeight - (presentando ? ENCABEZADO.presentando : ENCABEZADO.normal)
  const f = Math.min(window.innerWidth / BASE.ancho, alto / BASE.alto)
  return Math.min(MAXIMO, Math.max(MINIMO, f))
}

/**
 * Cuánto agrandar o achicar los Indicadores para que llenen la ventana justo
 * (dueña, 2026-10-14: en pantallas grandes o proyectados se veían chicos;
 * 2026-10-15: en la laptop no entraban). Todo cambia en la misma proporción,
 * así sigue entrando en una pantalla sin tocar el zoom del navegador. En el
 * celular queda en 1.
 */
export function useEscala(presentando = false): number {
  const [f, setF] = useState(() => escalaActual(presentando))
  useEffect(() => {
    const alCambiar = () => setF(escalaActual(presentando))
    alCambiar()
    window.addEventListener("resize", alCambiar)
    return () => window.removeEventListener("resize", alCambiar)
  }, [presentando])
  return f
}
