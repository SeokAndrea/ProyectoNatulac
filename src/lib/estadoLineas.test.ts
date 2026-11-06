import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LineaConEstado } from "@/components/panel/calculosPanel"
import type { Corrida } from "@/lib/produccion/tipos"

const rpc = vi.fn()
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import {
  conEstadoDeLaBase,
  conEstadosDeLaBase,
  firmaEstadoLineas,
  mapearEstadoLineas,
  REFRESCO_ESTADO_MS,
  useEstadoLineas,
  useRecargarAlCambiar,
  type EstadoLineasDeLaBase,
} from "./estadoLineas"

/** Como lo devuelve estado_lineas() (migración 20261114790000). */
const respuesta = (lineas: Record<string, unknown>[], turno: string | null = "t1") => ({
  area_codigo: "ASEPTICO",
  turno_id: turno,
  calculado_en: "2026-11-05T10:00:00Z",
  lineas: lineas.map((l) => ({
    linea_codigo: "LINEA_1",
    linea_nombre: "Línea 1",
    estado: "libre",
    corrida_id: null,
    pausada_en: null,
    lote_terminado: false,
    condicion: "LISTA",
    observacion: null,
    parada: null,
    ...l,
  })),
})

const local = (over: Partial<LineaConEstado> = {}): LineaConEstado => ({
  codigo: "LINEA_1",
  nombre: "Línea 1",
  estado: "activa",
  corrida: { id: "c1" } as Corrida,
  observacion: null,
  paradaEnVivo: null,
  ...over,
})

describe("mapearEstadoLineas", () => {
  it("pasa la respuesta de la base a la forma de la app", () => {
    const e = mapearEstadoLineas(
      respuesta([
        {
          estado: "detenida_por_parada",
          parada: { id: "p1", inicio: "2026-11-05T09:00:00Z", tipo_nombre: "Falla", nota: "motor", de_mantenimiento: true, linea_no_programada: false, visible: true },
        },
      ]),
    )
    expect(e?.turnoId).toBe("t1")
    expect(e?.lineas[0]).toMatchObject({ linea: "LINEA_1", estado: "detenida_por_parada", parada: { id: "p1", tipoNombre: "Falla", deMantenimiento: true, visible: true } })
  })

  it("una respuesta rara o un estado que la app no conoce: null (se usa el cálculo propio)", () => {
    expect(mapearEstadoLineas(null)).toBeNull()
    expect(mapearEstadoLineas({ lineas: "x" })).toBeNull()
    expect(mapearEstadoLineas(respuesta([{ estado: "esperando_pt" }]))).toBeNull()
  })
})

describe("conEstadoDeLaBase: manda la base", () => {
  const ahora = new Date("2026-11-05T10:00:00Z")

  it("sin dato de la base queda lo calculado", () => {
    const l = local()
    expect(conEstadoDeLaBase(l, null, ahora, null)).toBe(l)
    expect(conEstadosDeLaBase([l], null, ahora, null)).toEqual([l])
  })

  it("la base dice detenida por parada: cambia el estado y saca la corrida vieja", () => {
    const base = mapearEstadoLineas(
      respuesta([{ estado: "detenida_por_parada", parada: { id: "p", inicio: "2026-11-05T09:00:00Z", tipo_nombre: "Falla", nota: null, de_mantenimiento: false, linea_no_programada: false, visible: true } }]),
    )!
    const [l] = conEstadosDeLaBase([local()], base, ahora, null)
    expect(l.estado).toBe("detenida_por_parada")
    expect(l.corrida).toBeNull()
    expect(l.paradaEnVivo).toMatchObject({ minutos: 60, visible: true, tipoNombre: "Falla" })
  })

  it("con corrida, se queda la de la pantalla; los minutos cuentan desde el inicio del turno", () => {
    const base = mapearEstadoLineas(
      respuesta([{ estado: "parada", corrida_id: "c1", pausada_en: "2026-11-05T05:00:00Z", parada: { id: null, inicio: "2026-11-05T05:00:00Z", tipo_nombre: null, nota: null, de_mantenimiento: false, linea_no_programada: false, visible: true } }]),
    )!
    const l = conEstadoDeLaBase(local(), base.lineas[0], ahora, new Date("2026-11-05T07:00:00Z"))
    expect(l.estado).toBe("parada")
    expect(l.corrida?.id).toBe("c1")
    expect(l.paradaEnVivo?.minutos).toBe(180)
  })

  it("una línea que la base no trae queda como estaba", () => {
    const base = mapearEstadoLineas(respuesta([{ linea_codigo: "LINEA_2" }]))!
    expect(conEstadosDeLaBase([local()], base, ahora, null)[0].estado).toBe("activa")
  })
})

describe("firma y recarga al cambiar", () => {
  const e1 = mapearEstadoLineas(respuesta([{ estado: "activa", corrida_id: "c1" }]))
  const e2 = mapearEstadoLineas(respuesta([{ estado: "parada", corrida_id: "c1", pausada_en: "2026-11-05T09:58:00Z" }]))

  it("la firma cambia con el estado y es la misma con los mismos datos", () => {
    expect(firmaEstadoLineas(null)).toBeNull()
    expect(firmaEstadoLineas(e1)).toBe(firmaEstadoLineas(mapearEstadoLineas(respuesta([{ estado: "activa", corrida_id: "c1" }]))))
    expect(firmaEstadoLineas(e1)).not.toBe(firmaEstadoLineas(e2))
  })

  it("la primera lectura no recarga; un cambio sí; lo mismo otra vez no", () => {
    const recargar = vi.fn()
    const { rerender } = renderHook(({ e }: { e: EstadoLineasDeLaBase | null }) => useRecargarAlCambiar(e, recargar), { initialProps: { e: e1 } })
    expect(recargar).not.toHaveBeenCalled()
    rerender({ e: e2 })
    expect(recargar).toHaveBeenCalledTimes(1)
    rerender({ e: mapearEstadoLineas(respuesta([{ estado: "parada", corrida_id: "c1", pausada_en: "2026-11-05T09:58:00Z" }])) })
    expect(recargar).toHaveBeenCalledTimes(1)
  })
})

describe("useEstadoLineas", () => {
  beforeEach(() => {
    rpc.mockReset()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("pide el estado del área y lo relee cada 15 s", async () => {
    rpc.mockResolvedValue({ data: respuesta([{ estado: "activa", corrida_id: "c1" }]), error: null })
    const { result } = renderHook(() => useEstadoLineas("ASEPTICO"))
    await waitFor(() => expect(result.current?.lineas[0].estado).toBe("activa"))
    expect(rpc).toHaveBeenCalledWith("estado_lineas", { p_area_codigo: "ASEPTICO" })
    rpc.mockResolvedValue({ data: respuesta([{ estado: "parada", corrida_id: "c1" }]), error: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESCO_ESTADO_MS)
    })
    await waitFor(() => expect(result.current?.lineas[0].estado).toBe("parada"))
  })

  it("si la base no responde (o falta la migración): null, y un corte no borra lo último", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function estado_lineas does not exist" } })
    const { result } = renderHook(() => useEstadoLineas(null))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current).toBeNull()

    rpc.mockResolvedValue({ data: respuesta([{ estado: "libre" }]), error: null })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESCO_ESTADO_MS)
    })
    await waitFor(() => expect(result.current?.lineas[0].estado).toBe("libre"))
    rpc.mockRejectedValue(new Error("sin red"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESCO_ESTADO_MS)
    })
    expect(result.current?.lineas[0].estado).toBe("libre")
  })

  it("deshabilitado no pide nada", () => {
    renderHook(() => useEstadoLineas("ASEPTICO", false))
    expect(rpc).not.toHaveBeenCalled()
  })
})
