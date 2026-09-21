import { describe, expect, it } from "vitest"
import { calcularUnidadesPorPeso } from "./conteoPeso"

/*
 * Casos dorados: valores reales de la hoja "Cálculos" del Excel
 * "Control de Existencias" (bloques "CAJA DE PITILLOS ...", "PITILLO
 * ARCEVID", "TAPAS TBA 1000", "TAPAS TPA 330"). La tapa TPA-330 usa
 * el peso unitario correcto (3.6 g), no el 3.8 g que tenía por error
 * el Excel (confirmado con el dueño del proceso).
 */
describe("calcularUnidadesPorPeso", () => {
  it("Pitillo Selva/Fantasti, 9.22 kg", () => {
    expect(calcularUnidadesPorPeso(9.22, { pesoVacioKg: 1.1, pesoUnidadG: 0.4, redondeo: "ABAJO" })).toBe(20300)
  })

  it("Pitillo MegaBox, 4.3 kg", () => {
    expect(calcularUnidadesPorPeso(4.3, { pesoVacioKg: 2.5, pesoUnidadG: 0.5, redondeo: "ABAJO" })).toBe(3600)
  })

  it("Pitillo Arcevid, 9.9 kg", () => {
    expect(calcularUnidadesPorPeso(9.9, { pesoVacioKg: 2.0, pesoUnidadG: 0.46, redondeo: "ABAJO" })).toBe(17173)
  })

  it("Tapa Helicap TBA-1000, 9.5 kg", () => {
    expect(calcularUnidadesPorPeso(9.5, { pesoVacioKg: 0.8, pesoUnidadG: 3.8, redondeo: "ARRIBA" })).toBe(2290)
  })

  it("Tapa TPA-330, 6.7 kg (peso corregido)", () => {
    expect(calcularUnidadesPorPeso(6.7, { pesoVacioKg: 0.8, pesoUnidadG: 3.6, redondeo: "ARRIBA" })).toBe(1639)
  })
})
