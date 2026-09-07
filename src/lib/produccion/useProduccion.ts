/**
 * useProduccion() — hook del módulo Producción. Mismo patrón (Opción C)
 * que usePreparacion(): no depende del TurnoProvider viejo — solo de
 * useSesionTurno() para saber turnoId/usuario. Busca su propia porción de
 * datos llamando a turno_json() directo y quedándose solo con líneas,
 * lineas_estado y contadores.
 */
import { useCallback, useEffect, useState } from "react"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useSesionTurno } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"
import { activarLinea as activarLineaNucleo, cambiarCondicionLinea, confirmarEstadoLinea, continuarLinea, pausarLinea, registrarContador as registrarContadorNucleo, terminarLinea, terminarSaborLinea } from "./nucleo"
import { actualizarJustificacionContador as actualizarJustificacionContadorAjuste, continuarSiguienteLote, detenerLineaPorFalla, entregarCorrida } from "./ajustes"
import { mapearContador, mapearCorrida, mapearLineaEstado } from "./mapear"
import type {
  ContadorRegistro,
  Corrida,
  DatosActivarLinea,
  DatosCambiarLinea,
  DatosNuevoContador,
  FilaContador,
  FilaCorrida,
  FilaLineaEstado,
  LineaEstado,
  Resultado,
} from "./tipos"

interface FilaTurnoProduccion {
  lineas: FilaCorrida[]
  lineas_estado: FilaLineaEstado[]
  contadores: FilaContador[]
}

export interface UseProduccionResultado {
  corridas: Corrida[]
  lineasEstado: LineaEstado[]
  contadores: ContadorRegistro[]
  cargando: boolean
  recargar: () => Promise<void>
  activarLinea: (datos: DatosActivarLinea) => Promise<Resultado>
  pausarLinea: (corridaId: string) => Promise<Resultado>
  continuarLinea: (corridaId: string) => Promise<Resultado>
  terminarSaborLinea: (corridaId: string) => Promise<Resultado>
  terminarLinea: (corridaId: string) => Promise<Resultado>
  detenerLineaPorFalla: (corridaId: string, motivo: string) => Promise<Resultado>
  continuarSiguienteLote: (corridaId: string) => Promise<Resultado>
  entregarCorrida: (corridaId: string) => Promise<Resultado>
  cambiarCondicionLinea: (datos: DatosCambiarLinea) => Promise<Resultado>
  confirmarEstadoLinea: (corridaId: string) => Promise<Resultado>
  registrarContador: (datos: DatosNuevoContador) => Promise<Resultado>
  actualizarJustificacionContador: (contadorId: string, justificacion: string) => Promise<Resultado>
}

export function useProduccion(): UseProduccionResultado {
  const { turnoId, usuario } = useSesionTurno()
  const { velocidades } = useCatalogosLive()

  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [lineasEstado, setLineasEstado] = useState<LineaEstado[]>([])
  const [contadores, setContadores] = useState<ContadorRegistro[]>([])
  const [cargando, setCargando] = useState(true)

  function tomarDatos(fila: FilaTurnoProduccion | null) {
    setCorridas(fila ? fila.lineas.map(mapearCorrida) : [])
    setLineasEstado(fila ? fila.lineas_estado.map(mapearLineaEstado) : [])
    setContadores(fila ? fila.contadores.map(mapearContador) : [])
  }

  const recargar = useCallback(async () => {
    if (!turnoId) {
      tomarDatos(null)
      setCargando(false)
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_json", { p_turno_id: turnoId })
    tomarDatos(!error && data ? (data as FilaTurnoProduccion) : null)
    setCargando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Envuelve una acción (usuario, turnoId, ...args) => Resultado, y actualiza el estado local si sale bien. Mismo patrón que usePreparacion(). */
  function conSesion<A extends unknown[]>(fn: (usuario: string, turnoId: string, ...args: A) => Promise<Resultado & { data?: unknown }>) {
    return async (...args: A): Promise<Resultado> => {
      if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
      const resultado = await fn(usuario, turnoId, ...args)
      if (resultado.ok) tomarDatos(resultado.data as FilaTurnoProduccion)
      return resultado
    }
  }

  async function activarLinea(datos: DatosActivarLinea): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await activarLineaNucleo(usuario, turnoId, datos, velocidades)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoProduccion)
    return resultado
  }

  async function actualizarJustificacionContador(contadorId: string, justificacion: string): Promise<Resultado> {
    const resultado = await actualizarJustificacionContadorAjuste(contadorId, justificacion)
    if (resultado.ok) {
      setContadores((actual) => actual.map((c) => (c.id === contadorId ? { ...c, justificacion } : c)))
    }
    return resultado
  }

  return {
    corridas,
    lineasEstado,
    contadores,
    cargando,
    recargar,
    activarLinea,
    pausarLinea: conSesion(pausarLinea),
    continuarLinea: conSesion(continuarLinea),
    terminarSaborLinea: conSesion(terminarSaborLinea),
    terminarLinea: conSesion(terminarLinea),
    detenerLineaPorFalla: conSesion(detenerLineaPorFalla),
    continuarSiguienteLote: conSesion(continuarSiguienteLote),
    entregarCorrida: conSesion(entregarCorrida),
    cambiarCondicionLinea: conSesion(cambiarCondicionLinea),
    confirmarEstadoLinea: conSesion(confirmarEstadoLinea),
    registrarContador: conSesion(registrarContadorNucleo),
    actualizarJustificacionContador,
  }
}
