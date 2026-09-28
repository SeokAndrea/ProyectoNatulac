import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { useSesionTurno } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"

/*
 * Modo corrección: Preparación, Líneas, Producto Terminado y Paradas
 * abren un turno CERRADO cuando la URL trae ?turnoId= (botón "Corregir
 * este turno" en Auditoría). Sin el parámetro, todo sigue igual: el
 * turno efectivo es el de la sesión (useSesionTurno).
 *
 * El servidor decide si ese turno se puede corregir (turno_para_correccion:
 * permiso y que sea el inmediatamente anterior del área). Si la RPC falla
 * o no devuelve nada, errorCorreccion queda en true y cada página muestra
 * su aviso.
 */
export interface TurnoCorregido {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  fechaFin: string | null
  horaFin: string | null
  supervisorNombre: string | null
  /** Hay una corrección abierta (con motivo, dura 2 h) de este usuario sobre el turno. Sin ella solo se ve. */
  correccionActiva: boolean
  motivo: string | null
  /** Abre la corrección con su motivo (migración 20261082: iniciar_correccion). */
  iniciar: (motivo: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

interface FilaTurnoCorregido {
  id: string
  codigo: string
  fecha: string
  hora_inicio: string
  fecha_fin: string | null
  hora_fin: string | null
  supervisor_nombre: string | null
  correccion_activa: boolean
  motivo: string | null
}

export interface TurnoEfectivo {
  turnoIdEfectivo: string | null
  cargando: boolean
  enModoCorreccion: boolean
  turnoCorregido: TurnoCorregido | null
  errorCorreccion: boolean
  salirDeCorreccion: () => void
}

export function useTurnoEfectivo(): TurnoEfectivo {
  const sesion = useSesionTurno()
  const { session } = useAuth()
  const [params, setParams] = useSearchParams()
  const turnoIdParam = params.get("turnoId")

  const [turnoCorregido, setTurnoCorregido] = useState<TurnoCorregido | null>(null)
  const [cargandoCorreccion, setCargandoCorreccion] = useState(false)
  const [errorCorreccion, setErrorCorreccion] = useState(false)

  useEffect(() => {
    if (!turnoIdParam || !session) {
      setTurnoCorregido(null)
      setErrorCorreccion(false)
      return
    }
    let cancelado = false
    setCargandoCorreccion(true)
    setErrorCorreccion(false)
    supabase
      .rpc("turno_para_correccion", { p_usuario: session.username, p_turno_id: turnoIdParam })
      .then(({ data, error }) => {
        if (cancelado) return
        const fila = data as FilaTurnoCorregido | null
        if (error || !fila) {
          setTurnoCorregido(null)
          setErrorCorreccion(true)
        } else {
          setFila(fila)
        }
        setCargandoCorreccion(false)
      })
    return () => {
      cancelado = true
    }
  }, [turnoIdParam, session])

  function setFila(fila: FilaTurnoCorregido) {
    setTurnoCorregido({
      id: fila.id,
      codigo: fila.codigo,
      fecha: fila.fecha,
      horaInicio: fila.hora_inicio,
      fechaFin: fila.fecha_fin,
      horaFin: fila.hora_fin,
      supervisorNombre: fila.supervisor_nombre,
      correccionActiva: fila.correccion_activa,
      motivo: fila.motivo,
      iniciar: async (motivo: string) => {
        if (!session) return { ok: false, error: "Tu sesión expiró. Vuelve a entrar." }
        const { data, error } = await supabase.rpc("iniciar_correccion", {
          p_usuario: session.username,
          p_turno_id: fila.id,
          p_motivo: motivo,
        })
        if (error || !data) return { ok: false, error: error?.message || "No se pudo abrir la corrección." }
        setFila(data as FilaTurnoCorregido)
        return { ok: true }
      },
    })
  }

  const salirDeCorreccion = useCallback(() => {
    setParams((p) => {
      p.delete("turnoId")
      return p
    })
  }, [setParams])

  const enModoCorreccion = turnoIdParam !== null
  return {
    turnoIdEfectivo: enModoCorreccion ? (turnoCorregido?.id ?? null) : sesion.turnoId,
    cargando: enModoCorreccion ? cargandoCorreccion : sesion.cargando,
    enModoCorreccion,
    turnoCorregido,
    errorCorreccion,
    salirDeCorreccion,
  }
}
