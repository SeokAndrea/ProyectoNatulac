import { useCallback, useEffect, useRef, useState } from "react"

/*
 * Conexión en vivo con el plc-bridge (ver /plc-bridge en la raíz del repo):
 * la usan el Contador de Agua (src/pages/apps/PreparacionPLC.tsx) y la
 * tarjeta de Preparación (lo que el PLC está haciendo ahora). El bridge manda
 * un mensaje con todo el estado varias veces por segundo y contesta las
 * órdenes (válvulas auxiliares) por el mismo WebSocket.
 */

export const URL_PLC_BRIDGE: string = import.meta.env.VITE_PLC_BRIDGE_WS_URL || "ws://192.168.10.143:4036"

/** Un llenado del registro que guarda el bridge (plc-bridge/src/registro.js). */
export interface Llenado {
  tanque: number
  inicio: string
  /** null = sigue abierto. */
  fin: string | null
  /** Último PLC_Totales_Litros leído mientras el tanque estuvo seleccionado. */
  litros_tanque: number | null
  motivo_fin: string | null
}

/** Quién dio la orden desde la app. */
export interface Persona {
  usuario: string
  nombre: string
}

/** Una apertura de la válvula auxiliar (Actuador_Aux_Tank_X) que registra el bridge. */
export interface AperturaAux {
  tanque: number
  inicio: string
  /** null = desde la HMI/PLC; sin el campo = registro de antes de que se guardara. */
  abierta_por?: Persona | null
  /** null = sigue abierta. */
  fin: string | null
  cerrada_por?: Persona | null
  /** "bridge reiniciado" si se cortó el registro; si no, null. */
  motivo_fin: string | null
}

/** La preparación tal cual la entrega el PLC (DB5: X24.0 … X24.3, INT18, REAL20). Es del tanque seleccionado. */
export interface PreparacionBridge {
  activa: boolean
  fase_1: boolean
  fase_2: boolean
  fase_3: boolean
  /** PLC_Nro_Kits (admite medios); 0 al terminar. null = el PLC no lo entregó. */
  kits: number | null
  /** PLC_Ajuste_Agua: litros del ajuste en curso; 0 = sin ajuste. null = el PLC no lo entregó. */
  ajuste_l: number | null
}

/** Cómo va el envío de las cargas de la preparación a la base (plc-bridge/src/cargas.js). */
export interface ResumenCargas {
  habilitado: boolean
  area: string
  /** Por qué no se mandan (falta la clave, la preparación con PLC está apagada en el área…). */
  motivo_apagado: string | null
  /** Lecturas que esperan en la cola del bridge. */
  pendientes: number
  ultimo_envio: string | null
  /** Último problema con la base, o null. */
  error: string | null
}

export interface EstadoBridge {
  timestamp: string
  fuente: string
  tanque_activo: number | null
  setpoint_l: number | null
  /** PLC_Actuales_Litros: litros de la apertura en curso. */
  litros_actuales: number | null
  /** PLC_Totales_Litros: total que entró al tanque seleccionado (el PLC lo pone en 0 al cambiar de tanque). */
  litros_tanque: number | null
  /** PLC_Caudal_LPM. */
  caudal_l_min: number | null
  valvulas: Record<string, boolean>
  /** Válvula de recirculación/CIP de cada tanque (no es la de entrada de agua) — ver plc-bridge/src/fuentes/s7.js. */
  auxiliares: Record<string, boolean>
  llenando: boolean
  /** Tags PLC_EXTRA_* de plc-bridge/bridge.conf: nombre → valor (null si el PLC no lo entregó). */
  extra?: Record<string, number | boolean | null>
  /** Tags que el PLC no pudo entregar (dirección mal configurada en bridge.conf). */
  tags_con_error?: string[]
  /** Últimos llenados, el más reciente primero. */
  llenados?: Llenado[]
  /** Últimas aperturas de las válvulas auxiliares, la más reciente primero. */
  aperturas_aux?: AperturaAux[]
  /** El bridge acepta órdenes para las válvulas auxiliares (PLC_API_URL). */
  control_aux?: boolean
  /** false = el bridge no tiene comunicación con el PLC (solo en modo real). */
  conectado?: boolean
  /** null = sin dato del PLC; sin el campo = bridge anterior a la 1.3. */
  preparacion?: PreparacionBridge | null
  /** Área a la que el bridge manda las cargas (PLC_AREA). */
  area?: string
  cargas?: ResumenCargas
}

/**
 * Aviso sobre el envío de cargas a la base, o null si no hay nada que
 * avisar. Solo un problema en curso (error o lecturas esperando): que estén
 * apagadas en el bridge es configuración y no se avisa acá.
 */
export function textoCargas(cargas: ResumenCargas | undefined): string | null {
  if (!cargas || (!cargas.error && cargas.pendientes <= 0)) return null
  const partes: string[] = []
  if (cargas.error) partes.push(cargas.error)
  if (cargas.pendientes > 0) {
    partes.push(`${cargas.pendientes} ${cargas.pendientes === 1 ? "lectura" : "lecturas"} esperando para mandarse a la base.`)
  }
  return `Cargas de preparación: ${partes.join(" ")}`
}

/** Lo que contesta el bridge a una orden (plc-bridge/src/control.js). */
export type ResultadoOrden = { ok: true } | { ok: false; error: string }

const ESPERA_RESPUESTA_MS = 10000
const REINTENTO_INICIAL_MS = 2000
const REINTENTO_MAXIMO_MS = 30000

/**
 * Último estado del bridge y si hay conexión. Si se cae, reintenta a los 2 s,
 * 4 s, 8 s… hasta una vez cada 30 s; al volver a conectar, la espera vuelve a
 * 2 s. Con habilitado = false no abre ninguna conexión.
 */
export function usePlcBridge(url: string, habilitado = true) {
  const [estado, setEstado] = useState<EstadoBridge | null>(null)
  const [conectado, setConectado] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const pendientes = useRef(new Map<string, (r: ResultadoOrden) => void>())
  const contadorOrdenes = useRef(0)

  useEffect(() => {
    if (!habilitado) return
    let reintento: ReturnType<typeof setTimeout> | null = null
    let cancelado = false
    let espera = REINTENTO_INICIAL_MS

    function conectar() {
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = () => {
        espera = REINTENTO_INICIAL_MS
        setConectado(true)
      }

      socket.onmessage = (evento) => {
        try {
          const mensaje = JSON.parse(evento.data)
          if (mensaje.tipo === "respuesta") {
            pendientes.current.get(mensaje.id)?.(mensaje.ok ? { ok: true } : { ok: false, error: mensaje.error })
            pendientes.current.delete(mensaje.id)
          } else {
            setEstado(mensaje)
          }
        } catch {
          // mensaje no válido, se ignora
        }
      }

      socket.onclose = () => {
        setConectado(false)
        if (cancelado) return
        reintento = setTimeout(conectar, espera)
        espera = Math.min(espera * 2, REINTENTO_MAXIMO_MS)
      }

      socket.onerror = () => socket.close()
    }

    conectar()

    return () => {
      cancelado = true
      if (reintento) clearTimeout(reintento)
      socketRef.current?.close()
      socketRef.current = null
      setConectado(false)
    }
  }, [url, habilitado])

  /** Manda una orden al bridge y espera su respuesta. */
  const enviar = useCallback((orden: Record<string, unknown>): Promise<ResultadoOrden> => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: "Sin conexión al bridge." })
    }
    // Contador y no crypto.randomUUID(): la app se sirve por http en la red y ahí no existe.
    const id = `orden-${++contadorOrdenes.current}`
    return new Promise((resolve) => {
      const vencer = setTimeout(() => {
        pendientes.current.delete(id)
        resolve({ ok: false, error: "El bridge no respondió." })
      }, ESPERA_RESPUESTA_MS)
      pendientes.current.set(id, (r) => {
        clearTimeout(vencer)
        resolve(r)
      })
      socket.send(JSON.stringify({ ...orden, id }))
    })
  }, [])

  return { estado, conectado, enviar }
}
