import { createContext, useEffect, useState } from "react"

/** true dentro de la lámina mientras se presenta: sin botones de edición. */
export const Presentando = createContext(false)

/**
 * Modo presentación de Indicadores (dueña, 2026-10-15): solo las láminas, a
 * pantalla completa, sin el encabezado de la app ni la barra de filtros.
 * Se sale con Esc (el navegador sale de pantalla completa y eso cierra el
 * modo) o con la ✕. Si el navegador no deja pantalla completa, el modo
 * funciona igual dentro de la ventana y Esc también lo cierra.
 */
export function usePresentacion() {
  const [presentando, setPresentando] = useState(false)

  useEffect(() => {
    if (!presentando) return
    const alSalirDePantallaCompleta = () => {
      if (!document.fullscreenElement) setPresentando(false)
    }
    const alPresionar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !document.fullscreenElement && !document.querySelector("[role='dialog']")) setPresentando(false)
    }
    document.addEventListener("fullscreenchange", alSalirDePantallaCompleta)
    window.addEventListener("keydown", alPresionar)
    return () => {
      document.removeEventListener("fullscreenchange", alSalirDePantallaCompleta)
      window.removeEventListener("keydown", alPresionar)
    }
  }, [presentando])

  async function entrar() {
    setPresentando(true)
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // Sin permiso para pantalla completa: se presenta dentro de la ventana.
    }
  }

  function salir() {
    setPresentando(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  return { presentando, entrar, salir }
}
