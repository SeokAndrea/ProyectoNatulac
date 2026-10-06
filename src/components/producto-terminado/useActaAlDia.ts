import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { regenerarActaDeMiTurno } from "@/lib/regenerarActa"

export type EstadoActa = "quieta" | "actualizando" | "lista" | { error: string }

/** Espera tras la última carga antes de rearmar el acta (contador + PT en un mismo guardar = una sola acta). */
const ESPERA_MS = 2500

/**
 * Turno ya cerrado: cada vez que se carga un contador o PT, el acta se
 * vuelve a generar sola (versión nueva en Mis Actas) para que la merma
 * salga bien sin pasar por Auditoría (dueña, 2026-10-06).
 */
export function useActaAlDia(turnoId: string | null) {
  const { session } = useAuth()
  const catalogos = useCatalogosLive()
  const [estado, setEstado] = useState<EstadoActa>("quieta")
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current)
  }, [])

  function programar() {
    if (!turnoId || !session) return
    if (temporizador.current) clearTimeout(temporizador.current)
    setEstado("actualizando")
    temporizador.current = setTimeout(async () => {
      const { lineas, presentaciones, velocidades } = catalogos
      const r = await regenerarActaDeMiTurno(session, turnoId, { lineas, presentaciones, velocidades })
      setEstado(r.ok ? "lista" : { error: r.error })
    }, ESPERA_MS)
  }

  /** Envuelve una carga: si sale bien, programa el acta nueva. */
  function conActa<A extends unknown[], R extends { ok: boolean }>(fn: (...a: A) => Promise<R>) {
    return async (...a: A): Promise<R> => {
      const r = await fn(...a)
      if (r.ok) programar()
      return r
    }
  }

  return { estado, conActa }
}
