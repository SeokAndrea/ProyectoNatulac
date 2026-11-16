import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import { listarFallasSif } from "@/lib/sif"

const fila = (over: Record<string, unknown>) => ({
  parada_id: "p",
  inicio: "2026-10-26T08:00:00Z",
  fin: null,
  origen: "MANUAL",
  responsable: "OPERACIONAL",
  equipo: null,
  subsistema: null,
  registro: null,
  ...over,
})

describe("listarFallasSif", () => {
  beforeEach(() => rpc.mockReset())

  it("rotula Mantenimiento o Producción por el Responsable, no por el origen", async () => {
    rpc.mockResolvedValue({
      data: [
        fila({ parada_id: "a", origen: "SHEET", responsable: "OPERACIONAL" }),
        fila({ parada_id: "b", origen: "MANUAL", responsable: "MANTENIMIENTO" }),
      ],
      error: null,
    })
    const r = await listarFallasSif("ana", "sif-1")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.map((f) => [f.id, f.responsable])).toEqual([
      ["a", "Producción"],
      ["b", "Mantenimiento"],
    ])
  })

  it("trae las observaciones de Producción y Mantenimiento, y rotula la parada por definir", async () => {
    rpc.mockResolvedValue({
      data: [
        fila({ parada_id: "a", responsable: "POR_DEFINIR", nota: "Se botó el nivel", solucion: "Se cambió el sensor" }),
        fila({ parada_id: "b" }),
      ],
      error: null,
    })
    const r = await listarFallasSif("ana", "sif-1")
    if (!r.ok) throw new Error(r.error)
    expect(r.data[0]).toMatchObject({ responsable: "Por definir", nota: "Se botó el nivel", solucion: "Se cambió el sensor" })
    // Sin la migración 20261115690000 no vienen: quedan null.
    expect(r.data[1]).toMatchObject({ nota: null, solucion: null })
  })
})
