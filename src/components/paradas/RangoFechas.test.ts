import { describe, expect, it } from "vitest"
import { ajustarRango, MAX_DIAS_RANGO } from "@/components/paradas/RangoFechas"
import { partesNotaSheet } from "@/lib/paradas"

describe("ajustarRango", () => {
  it("un rango normal queda igual", () => {
    expect(ajustarRango("2026-10-03", "2026-10-10", "desde")).toEqual({ desde: "2026-10-03", hasta: "2026-10-10", recortado: false })
  })

  it("si queda al revés, la otra punta se mueve a la misma fecha", () => {
    expect(ajustarRango("2026-10-12", "2026-10-10", "desde")).toEqual({ desde: "2026-10-12", hasta: "2026-10-12", recortado: false })
    expect(ajustarRango("2026-10-12", "2026-10-10", "hasta")).toEqual({ desde: "2026-10-10", hasta: "2026-10-10", recortado: false })
  })

  it(`no pasa de ${MAX_DIAS_RANGO} días: acerca la otra punta`, () => {
    expect(ajustarRango("2026-01-01", "2026-10-10", "hasta")).toEqual({ desde: "2026-08-10", hasta: "2026-10-10", recortado: true })
    expect(ajustarRango("2026-01-01", "2026-10-10", "desde")).toEqual({ desde: "2026-01-01", hasta: "2026-03-03", recortado: true })
  })
})

describe("partesNotaSheet", () => {
  it("separa lo que escribió Mantenimiento del equipo", () => {
    expect(partesNotaSheet("Mantenimiento — Cartones mal posicionados — CBP32 · CBP-MAG-13 /MAGAZINE")).toEqual({
      falla: "Cartones mal posicionados",
      equipo: "CBP32 · CBP-MAG-13 /MAGAZINE",
    })
  })

  it("sin falla o sin nota", () => {
    expect(partesNotaSheet("Mantenimiento")).toEqual({ falla: "", equipo: "" })
    expect(partesNotaSheet(null)).toEqual({ falla: "", equipo: "" })
  })
})
