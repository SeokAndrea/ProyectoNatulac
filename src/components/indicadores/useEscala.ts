import { useEffect, useState } from "react"

/** La pantalla de Indicadores está pensada para 1366 × 768 (sin scroll). */
const BASE = { ancho: 1366, alto: 768 }
const MAXIMO = 2.2

function escalaActual(): number {
  if (typeof window === "undefined" || window.innerWidth < 1024) return 1
  const f = Math.min(window.innerWidth / BASE.ancho, window.innerHeight / BASE.alto)
  return Math.min(MAXIMO, Math.max(1, f))
}

/**
 * Cuánto agrandar los Indicadores para que llenen la ventana (dueña,
 * 2026-10-14: en pantallas grandes o proyectados se veían chicos). Todo
 * crece en la misma proporción, así sigue entrando en una pantalla. En
 * pantallas de 1366 o menos, y en el celular, queda en 1.
 */
export function useEscala(): number {
  const [f, setF] = useState(escalaActual)
  useEffect(() => {
    const alCambiar = () => setF(escalaActual())
    window.addEventListener("resize", alCambiar)
    return () => window.removeEventListener("resize", alCambiar)
  }, [])
  return f
}
