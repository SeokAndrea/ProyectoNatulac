import { useState } from "react"
import type { Resultado } from "@/lib/produccion/tipos"
import { useAccion } from "@/lib/useAccion"

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
