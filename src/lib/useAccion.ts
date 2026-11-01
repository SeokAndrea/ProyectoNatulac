import { useState } from "react"

type Resultado = { ok: true } | { ok: false; error: string }

/** Estado de "mandando…" + el error de la última acción de un panel. `ejecutar` devuelve si salió bien. */
export function useAccion() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ejecutar(fn: () => Promise<Resultado>): Promise<boolean> {
    setEnviando(true)
    setError(null)
    try {
      const resultado = await fn()
      if (!resultado.ok) setError(resultado.error)
      return resultado.ok
    } catch {
      // La llamada a la base se cayó (sin red): que los botones no queden trabados.
      setError("No se pudo conectar. Intenta de nuevo.")
      return false
    } finally {
      setEnviando(false)
    }
  }

  return { enviando, error, setError, ejecutar }
}
