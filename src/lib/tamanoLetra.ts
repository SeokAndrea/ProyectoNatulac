import { useEffect, useState } from "react"

/*
 * Tamaño de letra de la app en este dispositivo (Ajustes). Cambia el tamaño
 * base de <html>: como la escala de la app va en rem, crecen juntos el texto
 * y los espacios, igual que con el zoom del navegador. Se guarda en este
 * navegador (localStorage); index.html lo aplica antes de que cargue la app
 * para que no haya un salto de tamaño al abrir — misma clave que acá.
 */
export type TamanoLetra = "normal" | "grande" | "muy-grande"

const CLAVE = "natulac-letra"

export const ESCALA_LETRA: Record<TamanoLetra, string> = {
  normal: "100%",
  grande: "112.5%",
  "muy-grande": "125%",
}

export const NOMBRE_TAMANO_LETRA: Record<TamanoLetra, string> = {
  normal: "Normal",
  grande: "Grande",
  "muy-grande": "Muy grande",
}

function leerTamano(): TamanoLetra {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === "grande" || t === "muy-grande" ? t : "normal"
  } catch {
    return "normal"
  }
}

/** Tamaño elegido y cómo cambiarlo; se aplica y se guarda al cambiar. */
export function useTamanoLetra(): { tamano: TamanoLetra; elegir: (t: TamanoLetra) => void } {
  const [tamano, setTamano] = useState<TamanoLetra>(leerTamano)

  useEffect(() => {
    document.documentElement.style.fontSize = tamano === "normal" ? "" : ESCALA_LETRA[tamano]
    try {
      if (tamano === "normal") localStorage.removeItem(CLAVE)
      else localStorage.setItem(CLAVE, tamano)
    } catch {
      // Sin almacenamiento (ventana privada): dura solo esta visita.
    }
  }, [tamano])

  return { tamano, elegir: setTamano }
}
