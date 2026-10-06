import { describe, expect, it } from "vitest"
import { esT2DelDia, tramoT2 } from "@/lib/turno12x12"

describe("tramoT2", () => {
  it("T2 de 12x12 abierto a las 15:00 es el del día (4 h)", () => {
    expect(tramoT2("12x12", "TURNO_2", "15:00:12")).toEqual({ desde: "15:00", hasta: "19:00", minutos: 240 })
    expect(esT2DelDia("12x12", "TURNO_2", "15:31:00")).toBe(true)
  })
  it("T2 de 12x12 abierto desde las 18:00 es el de la noche (3,5 h)", () => {
    expect(tramoT2("12x12", "TURNO_2", "18:45:00")?.minutos).toBe(210)
    expect(tramoT2("12x12", "TURNO_2", "19:30:00")?.desde).toBe("19:00")
    expect(esT2DelDia("12x12", "TURNO_2", "19:02:00")).toBe(false)
  })
  it("fuera del T2 de 12x12 no hay tramo", () => {
    expect(tramoT2("3x8", "TURNO_2", "15:00:00")).toBeNull()
    expect(tramoT2("12x12", "TURNO_1", "07:00:00")).toBeNull()
    expect(tramoT2("12x12", "TURNO_2", null)).toBeNull()
  })
})
