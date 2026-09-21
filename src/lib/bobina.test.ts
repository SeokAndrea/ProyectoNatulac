import { describe, expect, it } from "vitest"
import { calcularEnvasesRestantes } from "./bobina"

/*
 * Casos dorados: valores reales que hoy muestra el Excel "Control de
 * Existencias" (hoja "Cálculos", bloques "CALCULO DE ENVASES ..."),
 * para confirmar que la reimplementación da el mismo número que ya
 * conoce Daniela. Ahí no todos los bloques redondean igual: los TP
 * están envueltos en ROUNDUP; los TB no tienen ROUNDUP en la fórmula
 * (la celda solo se VE entera por su formato "0", que redondea al más
 * cercano) — de ahí `redondearHaciaArriba: false` en los TB.
 */
describe("calcularEnvasesRestantes", () => {
  it("TP 250cc, B=14", () => {
    expect(
      calcularEnvasesRestantes(14, { diametroCoreCm: 15.75, espesorCm: 0.0382, largoEnvaseCm: 18.5, redondearHaciaArriba: true }),
    ).toBe(1852)
  })

  it("TP 200cc, B=33", () => {
    expect(
      calcularEnvasesRestantes(33, { diametroCoreCm: 15.75, espesorCm: 0.03712, largoEnvaseCm: 16, redondearHaciaArriba: true }),
    ).toBe(8510)
  })

  it("TB 1000cc, B=45.5", () => {
    expect(
      calcularEnvasesRestantes(45.5, { diametroCoreCm: 16.5, espesorCm: 0.0479, largoEnvaseCm: 28.5, redondearHaciaArriba: false }),
    ).toBe(6492)
  })

  it("TB 500cc, B=38.5", () => {
    // Cruda: 6926.4977 — el Excel no tiene ROUNDUP en este bloque, la
    // celda redondea al más cercano (formato "0") y muestra 6926, no 6927.
    expect(
      calcularEnvasesRestantes(38.5, { diametroCoreCm: 12, espesorCm: 0.0479, largoEnvaseCm: 18.41, redondearHaciaArriba: false }),
    ).toBe(6926)
  })

  it("TP 330cc, B=23.2", () => {
    expect(
      calcularEnvasesRestantes(23.2, { diametroCoreCm: 15.75, espesorCm: 0.04015, largoEnvaseCm: 18.7, redondearHaciaArriba: true }),
    ).toBe(3782)
  })
})
