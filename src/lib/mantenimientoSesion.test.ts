import { describe, expect, it } from "vitest"
import { areaPlantaDeSesion, esDeMantenimiento } from "@/lib/mantenimientoSesion"

describe("Mantenimiento por sesión", () => {
  it("es de Mantenimiento por el área o por el rol", () => {
    expect(esDeMantenimiento({ area: "MANTENIMIENTO", rol: "MANTENIMIENTO" })).toBe(true)
    expect(esDeMantenimiento({ area: "PRUEBAS", rol: "MANTENIMIENTO" })).toBe(true)
    expect(esDeMantenimiento({ area: "MANTENIMIENTO", rol: "SUPERVISOR" })).toBe(true)
    expect(esDeMantenimiento({ area: "ASEPTICO", rol: "SUPERVISOR" })).toBe(false)
    expect(esDeMantenimiento({ area: "ASEPTICO", rol: "JEFE_PRODUCCION" })).toBe(false)
    expect(esDeMantenimiento(null)).toBe(false)
  })

  it("trabaja en el área de la sesión: Pruebas en Pruebas, Aséptico en el resto", () => {
    expect(areaPlantaDeSesion({ area: "PRUEBAS" })).toBe("PRUEBAS")
    expect(areaPlantaDeSesion({ area: "MANTENIMIENTO" })).toBe("ASEPTICO")
    expect(areaPlantaDeSesion({ area: "ASEPTICO" })).toBe("ASEPTICO")
    expect(areaPlantaDeSesion(null)).toBe("ASEPTICO")
  })
})
