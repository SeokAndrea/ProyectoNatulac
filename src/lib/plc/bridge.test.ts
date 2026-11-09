import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type ResumenCargas, textoCargas, usePlcBridge } from "./bridge"

describe("textoCargas", () => {
  const base: ResumenCargas = {
    habilitado: true,
    area: "ASEPTICO",
    motivo_apagado: null,
    pendientes: 0,
    ultimo_envio: "2026-11-09T12:00:00Z",
    error: null,
  }

  it("sin error ni pendientes no muestra nada", () => {
    expect(textoCargas(base)).toBeNull()
    expect(textoCargas(undefined)).toBeNull()
    // Apagadas en el bridge (sin clave): es la configuración, no un problema en curso.
    expect(textoCargas({ ...base, habilitado: false, motivo_apagado: "falta PLC_BRIDGE_CLAVE" })).toBeNull()
  })

  it("con pendientes dice cuántas esperan", () => {
    expect(textoCargas({ ...base, pendientes: 1 })).toBe("Cargas de preparación: 1 lectura esperando para mandarse a la base.")
    expect(textoCargas({ ...base, pendientes: 3 })).toBe("Cargas de preparación: 3 lecturas esperando para mandarse a la base.")
  })

  it("con error lo muestra junto con las pendientes", () => {
    expect(textoCargas({ ...base, pendientes: 4, error: "Sin conexión con la base (ECONNREFUSED)." })).toBe(
      "Cargas de preparación: Sin conexión con la base (ECONNREFUSED). 4 lecturas esperando para mandarse a la base.",
    )
  })
})

/** WebSocket falso: guarda cada conexión para manejarla desde el test. */
class SocketFalso {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static creados: SocketFalso[] = []
  readyState = SocketFalso.CONNECTING
  enviados: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    SocketFalso.creados.push(this)
  }
  send(datos: string) {
    this.enviados.push(datos)
  }
  close() {
    if (this.readyState === SocketFalso.CLOSED) return
    this.readyState = SocketFalso.CLOSED
    this.onclose?.()
  }
  abrir() {
    this.readyState = SocketFalso.OPEN
    this.onopen?.()
  }
  recibir(mensaje: unknown) {
    this.onmessage?.({ data: JSON.stringify(mensaje) })
  }
  /** El bridge se cae o no está: la conexión se cierra sola. */
  caer() {
    this.close()
  }
}

const URL = "ws://bridge:4036"

beforeEach(() => {
  SocketFalso.creados = []
  vi.stubGlobal("WebSocket", SocketFalso)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("usePlcBridge", () => {
  it("no se conecta si no está habilitado", () => {
    const { result } = renderHook(() => usePlcBridge(URL, false))
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(SocketFalso.creados).toHaveLength(0)
    expect(result.current.conectado).toBe(false)
    expect(result.current.estado).toBeNull()
  })

  it("guarda el último estado y marca conectado", () => {
    const { result } = renderHook(() => usePlcBridge(URL))
    const socket = SocketFalso.creados[0]
    expect(socket.url).toBe(URL)
    act(() => socket.abrir())
    expect(result.current.conectado).toBe(true)
    act(() => socket.recibir({ timestamp: "t1", tanque_activo: 1, cargas: { pendientes: 0 } }))
    act(() => socket.recibir({ timestamp: "t2", tanque_activo: 2, area: "PRUEBAS" }))
    expect(result.current.estado?.timestamp).toBe("t2")
    expect(result.current.estado?.area).toBe("PRUEBAS")
    act(() => socket.caer())
    expect(result.current.conectado).toBe(false)
  })

  it("reintenta con espera creciente", () => {
    renderHook(() => usePlcBridge(URL))
    const esperas = [2000, 4000, 8000, 16000, 30000, 30000]
    for (const [i, espera] of esperas.entries()) {
      act(() => SocketFalso.creados[i].caer())
      act(() => {
        vi.advanceTimersByTime(espera - 1)
      })
      expect(SocketFalso.creados, `no reintenta antes de ${espera} ms`).toHaveLength(i + 1)
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(SocketFalso.creados, `reintenta a los ${espera} ms`).toHaveLength(i + 2)
    }
    // Una conexión que abre vuelve a la espera corta.
    const n = SocketFalso.creados.length
    act(() => SocketFalso.creados[n - 1].abrir())
    act(() => SocketFalso.creados[n - 1].caer())
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(SocketFalso.creados).toHaveLength(n + 1)
  })

  it("al desmontar cierra la conexión y no reintenta", () => {
    const { unmount } = renderHook(() => usePlcBridge(URL))
    act(() => SocketFalso.creados[0].abrir())
    unmount()
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(SocketFalso.creados).toHaveLength(1)
    expect(SocketFalso.creados[0].readyState).toBe(SocketFalso.CLOSED)
  })

  it("enviar resuelve con la respuesta del bridge", async () => {
    const { result } = renderHook(() => usePlcBridge(URL))
    const socket = SocketFalso.creados[0]
    act(() => socket.abrir())
    let respuesta: unknown
    await act(async () => {
      const promesa = result.current.enviar({ tipo: "valvula_aux", tanque: 2, abrir: true })
      const enviado = JSON.parse(socket.enviados[0])
      expect(enviado).toMatchObject({ tipo: "valvula_aux", tanque: 2, abrir: true })
      socket.recibir({ tipo: "respuesta", id: enviado.id, ok: false, error: "No tienes permiso." })
      respuesta = await promesa
    })
    expect(respuesta).toEqual({ ok: false, error: "No tienes permiso." })
    // La respuesta no pisa el estado.
    expect(result.current.estado).toBeNull()
  })

  it("enviar sin conexión devuelve «Sin conexión al bridge.»", async () => {
    const { result } = renderHook(() => usePlcBridge(URL))
    await expect(result.current.enviar({ tipo: "valvula_aux" })).resolves.toEqual({
      ok: false,
      error: "Sin conexión al bridge.",
    })
  })
})
