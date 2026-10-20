import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

interface FilaTurno {
  lineas: { id: string; activa: boolean; entregada_en: string | null; finalizada_en: string | null }[]
  producto_terminado: { turno_linea_id: string | null }[]
}

/**
 * ¿Al turno anterior (en su gracia) le falta el PT de alguna línea entregada
 * o detenida? Es lo que deja pendiente el cierre automático de las 22:30.
 * Se lee una vez por turno: después de cargarlo, la pantalla no salta sola
 * al turno en curso. null = todavía no se sabe (o no hay turno).
 */
export function useFaltaPtTurnoAnterior(turnoId: string | null): boolean | null {
  const [leido, setLeido] = useState<{ turnoId: string; falta: boolean } | null>(null)

  useEffect(() => {
    if (!turnoId) return
    let vigente = true
    supabase.rpc("turno_json", { p_turno_id: turnoId }).then(({ data, error }) => {
      if (!vigente) return
      const t = !error && data ? (data as FilaTurno) : null
      const conPt = new Set((t?.producto_terminado ?? []).map((p) => p.turno_linea_id))
      const falta = (t?.lineas ?? []).some(
        (l) => (l.entregada_en !== null || (!l.activa && l.finalizada_en === null)) && !conPt.has(l.id),
      )
      setLeido({ turnoId, falta })
    })
    return () => {
      vigente = false
    }
  }, [turnoId])

  return turnoId && leido?.turnoId === turnoId ? leido.falta : null
}
