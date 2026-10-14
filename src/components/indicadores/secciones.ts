import { useEffect } from "react"

/*
 * Pantallas de Indicadores, en el orden en que se presentan. Una pantalla
 * nueva se agrega acá y ya entra en la barra y en las flechas del teclado.
 */
export type Seccion = "1" | "2" | "3" | "semi"

export const SECCIONES: { valor: Seccion; texto: string }[] = [
  { valor: "1", texto: "LÍNEA 1" },
  { valor: "2", texto: "LÍNEA 2" },
  { valor: "3", texto: "LÍNEA 3" },
  { valor: "semi", texto: "SEMIELABORADO" },
]

/**
 * ← → pasan a la pantalla anterior o siguiente, como en una presentación
 * (dueña, 2026-10-14: Jorge expone los Indicadores). No actúan mientras se
 * escribe en un campo ni con el editor abierto.
 */
export function useFlechas(seccion: Seccion, onSeccion: (s: Seccion) => void, activo: boolean) {
  useEffect(() => {
    if (!activo) return
    function alPresionar(ev: KeyboardEvent) {
      if ((ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") || ev.altKey || ev.ctrlKey || ev.metaKey) return
      if ((ev.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], [role='dialog']")) return
      const i = SECCIONES.findIndex((s) => s.valor === seccion)
      const j = Math.min(SECCIONES.length - 1, Math.max(0, i + (ev.key === "ArrowRight" ? 1 : -1)))
      if (j === i) return
      ev.preventDefault()
      onSeccion(SECCIONES[j].valor)
    }
    window.addEventListener("keydown", alPresionar)
    return () => window.removeEventListener("keydown", alPresionar)
  }, [seccion, onSeccion, activo])
}
