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
import {
  ajustarPreparacion as ajustarPreparacionAccion,
  cambiarCondicionTanque as cambiarCondicionTanqueAccion,
  desvasarTanque as desvasarTanqueAccion,
  medirTanque as medirTanqueAccion,
  transferirTanque as transferirTanqueAccion,
} from "./ajustes"
import { confirmarEstadoTanque as confirmarEstadoTanqueAccion, iniciarPreparacion as iniciarPreparacionAccion, liberarLote as liberarLoteAccion } from "./nucleo"
import { mapearPreparacion, mapearTanque } from "./mapear"
import type {
  DatosCambiarTanque,
  DatosIniciarPreparacion,
  FilaPreparacion,
  FilaTanque,
  ModoTransferencia,
  MotivoTransferencia,
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
    motivo: MotivoTransferencia,
  ) => Promise<Resultado>
  desvasarTanque: (numeroTanque: 1 | 2 | 3) => Promise<Resultado>
  /** Relectura física: corrige `volumen_l` al valor medido — herramienta de excepción. */
  medirTanque: (numeroTanque: 1 | 2 | 3, volumenReal: number) => Promise<Resultado>
  confirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
  /** TODO (Fase 2 del plan): todavía hace CIP + confirmar INICIO/FIN — ver ajustes.ts. */
  cambiarCondicionTanque: (datos: DatosCambiarTanque) => Promise<Resultado>
}

/**
 * @param turnoIdElegido Tres casos: **omitido** (`undefined`) — usa el
 * turno abierto del usuario logueado (páginas normales de trabajo).
 * **string** — muestra ESE turno puntual (p. ej. Panel de Producción,
 * mirando el turno de cualquier supervisor/fecha). **`null`** —
 * explícitamente NINGÚN turno (p. ej. Panel todavía no resolvió cuál
 * mostrar, o no hay ninguno para esa fecha/área): NO cae al turno propio
 * del usuario logueado, muestra vacío. Esta distinción evita que un
 * supervisor mirando el Panel de otra área/fecha vea, por un instante o
 * por error, los datos de SU PROPIO turno en vez de nada.
 * `usuario` sigue siendo siempre el que está logueado — mutar (si se
 * llegara a hacer) queda atribuido a quien está mirando, no al dueño
 * original del turno.
 */
export function usePreparacion(turnoIdElegido?: string | null): UsePreparacionResultado {
  const sesion = useSesionTurno()
  const turnoId = turnoIdElegido === undefined ? sesion.turnoId : turnoIdElegido
  const usuario = sesion.usuario

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
    motivo: MotivoTransferencia,
  ): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await transferirTanqueAccion(usuario, turnoId, numeroTanqueOrigen, numeroTanqueDestino, modo, motivo)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function desvasarTanque(numeroTanque: 1 | 2 | 3): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await desvasarTanqueAccion(usuario, turnoId, numeroTanque)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function medirTanque(numeroTanque: 1 | 2 | 3, volumenReal: number): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await medirTanqueAccion(usuario, turnoId, numeroTanque, volumenReal)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  async function confirmarEstadoTanque(numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN"): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await confirmarEstadoTanqueAccion(usuario, turnoId, numeroTanque, momento)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoPreparacion)
    return resultado
  }

  // TODO (Fase 2 del plan §2.1): todavía hace CIP + confirmar INICIO/FIN — ver la nota en ajustes.ts.
  async function cambiarCondicionTanque(datos: DatosCambiarTanque): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await cambiarCondicionTanqueAccion(usuario, turnoId, datos)
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
    desvasarTanque,
    medirTanque,
    confirmarEstadoTanque,
    cambiarCondicionTanque,
  }
}
