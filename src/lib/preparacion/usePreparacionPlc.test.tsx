import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EstadoBridge } from "@/lib/plc/bridge"

const rpc = vi.fn()
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

/** Lo que "manda" el bridge en cada render; el test lo cambia y hace rerender. */
let mensajeBridge: EstadoBridge | null = null
const usePlcBridge = vi.fn((_url: string, habilitado: boolean) => ({
  estado: habilitado ? mensajeBridge : null,
  conectado: habilitado,
  enviar: vi.fn(),
}))
vi.mock("@/lib/plc/bridge", () => ({
  URL_PLC_BRIDGE: "ws://bridge:4036",
  usePlcBridge: (url: string, habilitado: boolean) => usePlcBridge(url, habilitado),
}))

import { usePreparacionPlc } from "./usePreparacionPlc"

const carga = (id: string, tanque: number, estado = "PENDIENTE") => ({
  id,
  numero_tanque: tanque,
  estado,
  agua_formula_l: 2000,
  kits: 2,
  kits_listos: true,
  kits_usados: null,
  iniciada_en: "2026-11-09T10:00:00Z",
  terminada_en: estado === "EN_CURSO" ? null : "2026-11-09T10:30:00Z",
  preparacion_id: null,
  ajustes: [],
})

const estadoBase = (colaT1: unknown[]) => ({
  habilitado: true,
  tanques: [
    { numero_tanque: 1, cola: colaT1, carga_del_lote: null, desglose: null },
    { numero_tanque: 2, cola: [], carga_del_lote: null, desglose: null },
    { numero_tanque: 3, cola: [], carga_del_lote: null, desglose: null },
  ],
})

function bridge(activa: boolean, prep: Partial<NonNullable<EstadoBridge["preparacion"]>> = {}): EstadoBridge {
  return {
    timestamp: "t",
    fuente: "plc",
    conectado: true,
    tanque_activo: activa ? 1 : null,
    setpoint_l: 2000,
    litros_actuales: 100,
    litros_tanque: 900,
    caudal_l_min: 1200,
    valvulas: { "1": activa, "2": false, "3": false },
    auxiliares: {},
    llenando: activa,
    area: "ASEPTICO",
    preparacion: { activa, fase_1: activa, fase_2: false, fase_3: false, kits: 0, ajuste_l: 0, ...prep },
  }
}

const llamadas = (funcion: string) => rpc.mock.calls.filter(([f]) => f === funcion)

/** Deja correr las promesas pendientes (las respuestas de la base). */
async function asentar(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const PROPS = { turnoId: "turno-1", usuario: "sup", area: "ASEPTICO", habilitado: true }

beforeEach(() => {
  vi.useFakeTimers()
  rpc.mockReset()
  usePlcBridge.mockClear()
  mensajeBridge = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe("usePreparacionPlc", () => {
  it("apagado no lee ni se conecta", async () => {
    rpc.mockImplementation((f: string) => Promise.resolve({ data: f === "preparacion_plc_area_activo" ? false : null, error: null }))
    const { result } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar(30000)
    expect(result.current.activo).toBe(false)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(0)
    expect(usePlcBridge.mock.calls.every(([, habilitado]) => habilitado === false)).toBe(true)
    expect(result.current.delTanque(1)).toEqual({ vivo: null, cola: [], cargaDelLote: null, desglose: null })
  })

  it("sin habilitado (otro modo de la pantalla) no consulta nada", async () => {
    const { result } = renderHook(() => usePreparacionPlc({ ...PROPS, habilitado: false }))
    await asentar(30000)
    expect(rpc).not.toHaveBeenCalled()
    expect(result.current.activo).toBe(false)
  })

  it("encendido lee el estado y lo reparte por tanque", async () => {
    mensajeBridge = bridge(true, { fase_1: true })
    rpc.mockImplementation((f: string) =>
      Promise.resolve({ data: f === "preparacion_plc_area_activo" ? true : estadoBase([carga("c1", 1)]), error: null }),
    )
    const { result } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar()
    expect(result.current.activo).toBe(true)
    expect(llamadas("estado_preparacion_plc")[0][1]).toEqual({ p_usuario: "sup", p_turno_id: "turno-1" })
    expect(usePlcBridge).toHaveBeenLastCalledWith("ws://bridge:4036", true)

    const t1 = result.current.delTanque(1)
    expect(t1.cola.map((c) => c.id)).toEqual(["c1"])
    expect(t1.vivo?.fase).toBe(1)
    expect(t1.vivo?.litrosAgua).toBe(900)
    expect(result.current.delTanque(2)).toEqual({ vivo: null, cola: [], cargaDelLote: null, desglose: null })

    // Relee cada 10 s.
    await asentar(10000)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(2)
  })

  it("relee a los 2 s cuando baja PREPARACION en el bridge", async () => {
    mensajeBridge = bridge(true, { fase_3: true, fase_1: false })
    rpc.mockImplementation((f: string) =>
      Promise.resolve({ data: f === "preparacion_plc_area_activo" ? true : estadoBase([carga("c1", 1, "EN_CURSO")]), error: null }),
    )
    const { rerender } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar()
    expect(llamadas("estado_preparacion_plc")).toHaveLength(1)

    mensajeBridge = bridge(false)
    rerender()
    await asentar(1999)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(1)
    await asentar(1)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(2)

    // Mensajes iguales (sin transición) no releen.
    mensajeBridge = bridge(false)
    rerender()
    await asentar(2000)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(2)
  })

  it("relee a los 2 s cuando termina un ajuste o baja la fase 2", async () => {
    mensajeBridge = bridge(true, { fase_1: false, fase_3: true, ajuste_l: 120 })
    rpc.mockImplementation((f: string) =>
      Promise.resolve({ data: f === "preparacion_plc_area_activo" ? true : estadoBase([carga("c1", 1, "EN_CURSO")]), error: null }),
    )
    const { rerender } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar()
    mensajeBridge = bridge(true, { fase_1: false, fase_3: true, ajuste_l: 0 })
    rerender()
    await asentar(2000)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(2)

    mensajeBridge = bridge(true, { fase_1: false, fase_2: true, kits: 2 })
    rerender()
    mensajeBridge = bridge(true, { fase_1: false, fase_2: false, kits: 2 })
    rerender()
    await asentar(2000)
    expect(llamadas("estado_preparacion_plc")).toHaveLength(3)
  })

  it("descartar devuelve el estado nuevo", async () => {
    rpc.mockImplementation((f: string) => {
      if (f === "preparacion_plc_area_activo") return Promise.resolve({ data: true, error: null })
      if (f === "descartar_carga_plc") return Promise.resolve({ data: estadoBase([]), error: null })
      return Promise.resolve({ data: estadoBase([carga("c1", 1)]), error: null })
    })
    const { result } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar()
    expect(result.current.delTanque(1).cola).toHaveLength(1)

    let r: unknown
    await act(async () => {
      r = await result.current.descartar("c1")
    })
    expect(r).toEqual({ ok: true })
    expect(llamadas("descartar_carga_plc")[0][1]).toEqual({ p_usuario: "sup", p_turno_id: "turno-1", p_carga_id: "c1" })
    expect(result.current.delTanque(1).cola).toHaveLength(0)
  })

  it("descartar con error lo devuelve y no cambia nada", async () => {
    rpc.mockImplementation((f: string) => {
      if (f === "preparacion_plc_area_activo") return Promise.resolve({ data: true, error: null })
      if (f === "descartar_carga_plc") return Promise.resolve({ data: null, error: { message: "Esa carga del PLC ya se registró o se descartó. Recarga la página." } })
      return Promise.resolve({ data: estadoBase([carga("c1", 1)]), error: null })
    })
    const { result } = renderHook(() => usePreparacionPlc(PROPS))
    await asentar()
    let r: unknown
    await act(async () => {
      r = await result.current.descartar("c1")
    })
    expect(r).toEqual({ ok: false, error: "Esa carga del PLC ya se registró o se descartó. Recarga la página." })
    expect(result.current.delTanque(1).cola).toHaveLength(1)
  })
})
