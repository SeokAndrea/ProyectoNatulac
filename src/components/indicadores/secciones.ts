import { useEffect } from "react"

/*
 * Pantallas de Indicadores, en el orden en que se presentan. Una pantalla
 * nueva se agrega acá y ya entra en la barra y en las flechas del teclado.
 */
export type Seccion = "1" | "2" | "3" | "semi" | "aus" | "inc"

export const SECCIONES: { valor: Seccion; texto: string }[] = [
  { valor: "1", texto: "LÍNEA 1" },
  { valor: "2", texto: "LÍNEA 2" },
  { valor: "3", texto: "LÍNEA 3" },
  { valor: "semi", texto: "SEMIELABORADO" },
  { valor: "aus", texto: "AUSENTISMO" },
  { valor: "inc", texto: "INCIDENCIAS / SEGUIMIENTO" },
]

/** Ausentismo e incidencias se cargan siempre a mano, aunque el mes sea automático. */
export const SIEMPRE_A_MANO: Seccion[] = ["aus", "inc"]

/**
 * ← → pasan a la pantalla anterior o siguiente, como en una presentación
 * (dueña, 2026-10-14: Jorge expone los Indicadores). No actúan mientras se
 * escribe en un campo ni con el editor abierto.
 */
export function useFlechas(seccion: Seccion, onSeccion: (s: Seccion) => void, activo: boolean, lista: Seccion[] = SECCIONES.map((s) => s.valor)) {
  useEffect(() => {
    if (!activo) return
    function alPresionar(ev: KeyboardEvent) {
      if ((ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") || ev.altKey || ev.ctrlKey || ev.metaKey) return
      if ((ev.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      // Solo entre las pantallas que se ven (las que tienen datos, ver seccionesConDatos).
      const i = lista.indexOf(seccion)
      const j = Math.min(lista.length - 1, Math.max(0, i + (ev.key === "ArrowRight" ? 1 : -1)))
      if (j === i || j < 0) return
      ev.preventDefault()
      onSeccion(lista[j])
    }
    window.addEventListener("keydown", alPresionar)
    return () => window.removeEventListener("keydown", alPresionar)
  }, [seccion, onSeccion, activo, lista])
}
