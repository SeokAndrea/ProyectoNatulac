/**
 * usePreparacion() — hook del módulo Preparación. Ver
 * plan-rework-3-modulos-y-merma.md, Fase 1 (Opción A+C para la sesión de
 * turno, confirmada con el dueño).
 *
 * NO depende del TurnoProvider viejo (src/lib/turno.tsx) — solo de
 * useSesionTurno() para saber turnoId/usuario. Busca su propia porción de
 * datos llamando a turno_json() directo y quedándose solo con tanques y
 * preparaciones — el mismo patrón que useProduccion() y
 * useProductoTerminado() van a usar cuando se escriban (pasos 2 y 3).
 *
 * Repite la misma llamada a turno_json() que van a hacer los otros
 * módulos (3 llamadas iguales en vez de 1) — costo de performance a
 * optimizar después si hace falta, no un problema de arquitectura (ver
 * discusión de la Fase 1 con el dueño).
 */
import { useCallback, useEffect, useState } from "react"
import { useSesionTurno } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"
import { ajustarPreparacion as ajustarPreparacionAccion, envasarTanque as envasarTanqueAccion, transferirTanque as transferirTanqueAccion } from "./ajustes"
import { confirmarEstadoTanque as confirmarEstadoTanqueAccion, iniciarPreparacion as iniciarPreparacionAccion, liberarLote as liberarLoteAccion } from "./nucleo"
import { mapearPreparacion, mapearTanque } from "./mapear"
import type {
  DatosIniciarPreparacion,
  FilaPreparacion,
  FilaTanque,
  ModoTransferencia,
  PreparacionRegistro,
  Resultado,
  TanqueRecepcion,
} from "./tipos"

interface FilaTurnoPreparacion {
  tanques: FilaTanque[]
  preparaciones: FilaPreparacion[]
}

export interface UsePreparacionResultado {
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  cargando: boolean
  recargar: () => Promise<void>
  iniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  liberarLote: (loteId: string) => Promise<Resultado>
  ajustarPreparacion: (loteId: string, litros: number, detalle: string | null) => Promise<Resultado>
  transferirTanque: (
    numeroTanqueOrigen: 1 | 2 | 3,
    numeroTanqueDestino: 1 | 2 | 3,
    modo: ModoTransferencia,
  ) => Promise<Resultado>
  envasarTanque: (numeroTanque: 1 | 2 | 3) => Promise<Resultado>
  confirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
}

export function usePreparacion(): UsePreparacionResultado {
  const { turnoId, usuario } = useSesionTurno()

  const [tanques, setTanques] = useState<TanqueRecepcion[]>([])
  const [preparaciones, setPreparaciones] = useState<PreparacionRegistro[]>([])
  const [cargando, setCargando] = useState(true)

  function tomarDatos(fila: FilaTurnoPreparacion | null) {
    setTanques(fila ? fila.tanques.map(mapearTanque) : [])
    setPreparaciones(fila ? fila.preparaciones.map(mapearPreparacion) : [])
  }

  const recargar = useCallback(async () => {
    if (!turnoId) {
      tomarDatos(null)
      setCargando(false)
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_json", { p_turno_id: turnoId })
    tomarDatos(!error && data ? (data as FilaTurnoPreparacion) : null)
    setCargando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function iniciarPreparacion(datos: DatosIniciarPreparacion): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await iniciarPreparacionAccion(usuario, turnoId, datos)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function liberarLote(loteId: string): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await liberarLoteAccion(usuario, turnoId, loteId)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function ajustarPreparacion(loteId: string, litros: number, detalle: string | null): Promise<Resultado> {
    if (!usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await ajustarPreparacionAccion(usuario, loteId, litros, detalle)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function transferirTanque(
    numeroTanqueOrigen: 1 | 2 | 3,
    numeroTanqueDestino: 1 | 2 | 3,
    modo: ModoTransferencia,
  ): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await transferirTanqueAccion(usuario, turnoId, numeroTanqueOrigen, numeroTanqueDestino, modo)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function envasarTanque(numeroTanque: 1 | 2 | 3): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await envasarTanqueAccion(usuario, turnoId, numeroTanque)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function confirmarEstadoTanque(numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN"): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await confirmarEstadoTanqueAccion(usuario, turnoId, numeroTanque, momento)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  return {
    tanques,
    preparaciones,
    cargando,
    recargar,
    iniciarPreparacion,
    liberarLote,
    ajustarPreparacion,
    transferirTanque,
    envasarTanque,
    confirmarEstadoTanque,
  }
}
