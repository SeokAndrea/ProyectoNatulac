import { useCallback, useEffect, useRef, useState } from "react"
import { type EstadoBridge, URL_PLC_BRIDGE, usePlcBridge } from "@/lib/plc/bridge"
import { descartarCargaPlc, type EstadoPreparacionPlc, leerEstadoPlc, type PlcDelTanque, usePreparacionPlcActivo, vistaVivaTanque } from "./plc"
import type { Resultado } from "./tipos"

/*
 * Lo del PLC para la tarjeta de Preparación: junta lo guardado
 * (estado_preparacion_plc: cargas por registrar, la carga del lote y su
 * desglose) con lo en vivo del bridge (fase, litros, kits y ajuste).
 * Solo con el interruptor del área encendido; apagado no lee ni se conecta.
 *
 * Lo guardado se relee cada 10 s y, además, 2 s después de cada cambio que
 * la base anota (empieza o termina la preparación, terminan los kits o un
 * ajuste): así la carga pendiente aparece enseguida, sin esperar el ciclo.
 */

const RELEER_CADA_MS = 10000
const RELEER_TRAS_CAMBIO_MS = 2000

const VACIO: PlcDelTanque = { vivo: null, cola: [], cargaDelLote: null, desglose: null }

/** Cambios del PLC que la base registra como algo nuevo en la carga. */
function huboTransicion(antes: EstadoBridge | null, ahora: EstadoBridge | null): boolean {
  const a = antes?.preparacion
  const b = ahora?.preparacion
  if (!a || !b) return false
  if (a.activa !== b.activa) return true
  if (a.fase_2 && !b.fase_2) return true
  return (a.ajuste_l ?? 0) > 0 && b.ajuste_l === 0
}

export function usePreparacionPlc({
  turnoId,
  usuario,
  area,
  habilitado,
}: {
  turnoId: string | null
  usuario: string
  area: string | null
  /** false = esta pantalla no usa lo del PLC (revisión de inicio, modo corrección). */
  habilitado: boolean
}) {
  const leido = usePreparacionPlcActivo(area, habilitado)
  const [guardado, setGuardado] = useState<EstadoPreparacionPlc | null>(null)
  // Si la base contesta que está apagado (la dueña lo apagó mientras tanto), se apaga acá también.
  const activo = !habilitado ? false : leido === null ? null : leido && guardado?.habilitado !== false
  const encendido = activo === true
  const { estado: bridge } = usePlcBridge(URL_PLC_BRIDGE, encendido)

  const recargar = useCallback(async () => {
    if (!encendido || !turnoId || !usuario) return
    const r = await leerEstadoPlc(usuario, turnoId)
    // Con un error se deja lo último que se leyó: la próxima lectura lo arregla.
    if (r.ok) setGuardado(r.data)
  }, [encendido, turnoId, usuario])

  useEffect(() => {
    if (!encendido) return
    void recargar()
    const intervalo = setInterval(() => void recargar(), RELEER_CADA_MS)
    return () => clearInterval(intervalo)
  }, [encendido, recargar])

  const anterior = useRef<EstadoBridge | null>(null)
  const releerTras = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const antes = anterior.current
    anterior.current = bridge
    if (!encendido || !huboTransicion(antes, bridge)) return
    if ((bridge?.area ?? "ASEPTICO") !== (area ?? "ASEPTICO")) return
    if (releerTras.current) clearTimeout(releerTras.current)
    releerTras.current = setTimeout(() => void recargar(), RELEER_TRAS_CAMBIO_MS)
  }, [bridge, encendido, area, recargar])

  useEffect(
    () => () => {
      if (releerTras.current) clearTimeout(releerTras.current)
    },
    [],
  )

  const delTanque = useCallback(
    (n: 1 | 2 | 3): PlcDelTanque => {
      if (!encendido) return VACIO
      const t = guardado?.tanques.find((x) => x.numeroTanque === n)
      return {
        vivo: vistaVivaTanque(bridge, n, area),
        cola: t?.cola ?? [],
        cargaDelLote: t?.cargaDelLote ?? null,
        desglose: t?.desglose ?? null,
      }
    },
    [encendido, guardado, bridge, area],
  )

  const descartar = useCallback(
    async (cargaId: string): Promise<Resultado> => {
      if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
      const r = await descartarCargaPlc(usuario, turnoId, cargaId)
      if (!r.ok) return r
      setGuardado(r.data)
      return { ok: true }
    },
    [turnoId, usuario],
  )

  return { activo, delTanque, recargar, descartar }
}
