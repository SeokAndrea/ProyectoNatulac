import { useState } from "react"

type Resultado = { ok: true } | { ok: false; error: string }

/** Estado de "mandando…" + el error de la última acción de un panel. `ejecutar` devuelve si salió bien. */
export function useAccion() {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ejecutar(fn: () => Promise<Resultado>): Promise<boolean> {
    setEnviando(true)
    setError(null)
    const resultado = await fn()
    setEnviando(false)
    if (!resultado.ok) setError(resultado.error)
    return resultado.ok
  }

  return { enviando, error, setError, ejecutar }
}
