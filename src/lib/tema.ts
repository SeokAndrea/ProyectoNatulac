import { useEffect, useState } from "react"

/*
 * Modo oscuro: "claro", "oscuro" o "sistema" (sigue la configuración del
 * equipo). Se guarda en este navegador (localStorage) y se aplica poniendo
 * la clase "dark" en <html>: los colores de .dark ya están en index.css.
 * index.html aplica lo guardado antes de que cargue la app, para que no
 * se vea un destello blanco al abrir en oscuro — misma clave que acá.
 */
export type Tema = "claro" | "oscuro" | "sistema"

const CLAVE = "natulac-tema"
const ORDEN: Tema[] = ["claro", "oscuro", "sistema"]

function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === "claro" || t === "oscuro" ? t : "sistema"
  } catch {
    return "sistema"
  }
}

const sistemaOscuro = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false

function aplicarTema(tema: Tema) {
  const oscuro = tema === "oscuro" || (tema === "sistema" && sistemaOscuro())
  document.documentElement.classList.toggle("dark", oscuro)
  document.documentElement.style.colorScheme = oscuro ? "dark" : "light"
  // Color de la barra del navegador en el celular
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", oscuro ? "#1b2230" : "#ffffff")
}

/** Tema elegido y cómo pasar al siguiente (Claro → Oscuro → Sistema). */
export function useTema(): { tema: Tema; siguiente: () => void } {
  const [tema, setTema] = useState<Tema>(leerTema)

  useEffect(() => {
    aplicarTema(tema)
    try {
      if (tema === "sistema") localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, tema)
    } catch {
      // Sin almacenamiento (ventana privada): el tema dura solo esta visita.
    }
    if (tema !== "sistema") return
    // En "sistema", seguir los cambios del equipo (ej. modo noche automático).
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
    const alCambiar = () => aplicarTema("sistema")
    mq?.addEventListener("change", alCambiar)
    return () => mq?.removeEventListener("change", alCambiar)
  }, [tema])

  return { tema, siguiente: () => setTema((t) => ORDEN[(ORDEN.indexOf(t) + 1) % ORDEN.length]) }
}
