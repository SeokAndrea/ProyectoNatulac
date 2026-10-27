import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Parada } from "@/lib/paradas"
import { totalesParadaPorLinea } from "./calculosPanel"

const TURNO = { id: "t2", fecha: "2026-10-26", turnoTipo: "TURNO_2", supervisorUsuario: null }

const listarParadas = vi.fn()

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { area: "ASEPTICO" } }) }))
vi.mock("@/lib/panelProduccion", () => ({
  cargoDeUsuario: vi.fn().mockResolvedValue(null),
  obtenerEstadoPlantaActual: vi.fn().mockResolvedValue({ id: "t2", fecha: "2026-10-26", turnoTipo: "TURNO_2", supervisorUsuario: null }),
  obtenerLecturaServiciosIndustriales: vi.fn().mockResolvedValue(null),
  obtenerProduccionDia: vi.fn().mockResolvedValue([]),
  obtenerTurnoAnterior: vi.fn().mockResolvedValue(null),
  obtenerTurnosDeFechaTipo: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/paradas", async (orig) => ({ ...(await orig<typeof import("@/lib/paradas")>()), listarParadas: (...a: unknown[]) => listarParadas(...a) }))
vi.mock("@/lib/paradasCatalogo", () => ({ useCatalogoParadas: () => undefined }))
const modulo = { recargar: vi.fn() }
vi.mock("@/lib/preparacion/usePreparacion", () => ({ usePreparacion: () => modulo }))
vi.mock("@/lib/produccion/useProduccion", () => ({ useProduccion: () => modulo }))
vi.mock("@/lib/productoTerminado", () => ({ useProductoTerminado: () => modulo }))
vi.mock("@/lib/programacion", () => ({ fechaJornada: () => "2026-10-26", obtenerPlanDelDia: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/ventanasParadas", () => ({ listarVentanasTurnos: vi.fn().mockResolvedValue([]) }))

import { usePanelTurno } from "./usePanelTurno"

const par = (over: Partial<Parada>): Parada =>
  ({ id: "a", clase: "NO_PROGRAMADA", responsable: "OPERACIONAL", lineaCodigo: "LINEA_1", tipoCodigo: null, tipoNombre: "Llenadora", inicio: "2026-10-26T14:00:00", fin: "2026-10-26T16:30:00", ...over }) as Parada

describe("usePanelTurno: total de la parada", () => {
  beforeEach(() => {
    listarParadas.mockReset()
    listarParadas.mockImplementation(async (f: { turnoId?: string }) =>
      f.turnoId ? [par({})] : [par({ inicio: "2026-10-26T13:00:00" })],
    )
  })

  it("pide las paradas sin recortar con una fecha real y el total llega a la salida", async () => {
    const { result } = renderHook(() => usePanelTurno())
    await waitFor(() => expect(result.current.paradasCompletas.size + result.current.paradasTurno.length).toBe(2))
    expect(listarParadas).toHaveBeenCalledWith({ desde: "2026-10-19", hasta: "2026-10-26", area: "ASEPTICO" })
    const totales = totalesParadaPorLinea(result.current.paradasTurno, result.current.paradasCompletas, new Date("2026-10-26T17:00:00"))
    expect(totales.get("LINEA_1")).toBe(210)
  })
})
