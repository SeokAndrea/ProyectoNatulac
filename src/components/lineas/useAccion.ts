import { useState } from "react"
import type { Resultado } from "@/lib/produccion/tipos"

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

/**
 * "Continuar al siguiente lote" / "Cambiar de lote". Sin tanque = auto-detecta
 * el lote+1 (mismo sabor, un solo tanque Listo). Si eso falla, `eligeTanque`
 * abre el selector a mano y se reintenta con el que elija el supervisor.
 */
export function useContinuarSiguiente(
  corridaId: string,
  continuarSiguienteLote: (corridaId: string, numeroTanque?: number) => Promise<Resultado>,
  onListo?: () => void,
) {
  const accion = useAccion()
  const [eligeTanque, setEligeTanque] = useState(false)

  async function continuar(numeroTanque?: number) {
    const ok = await accion.ejecutar(() => continuarSiguienteLote(corridaId, numeroTanque))
    if (!ok) {
      if (numeroTanque === undefined) setEligeTanque(true)
      return
    }
    setEligeTanque(false)
    onListo?.()
  }

  return { ...accion, eligeTanque, setEligeTanque, continuar }
}
