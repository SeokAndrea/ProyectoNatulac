import { describe, expect, it } from "vitest"
import { calcularConsumoFormula, type InsumoFormula } from "./formulaMateriaPrima"

/*
 * Casos dorados: valores reales que hoy calcula el Excel "Control de
 * Existencias" (hojas " MATERIA PRIMA CLASICA ", "PREMIUM", "TE").
 */
describe("calcularConsumoFormula", () => {
  it("Clásicos · Pera · 30 tambores", () => {
    const insumosPera: InsumoFormula[] = [
      { insumo: "Azúcar", cantidad: 100, unidad: "kg" },
      { insumo: "CMC", cantidad: 2.6, unidad: "kg" },
      { insumo: "Goma", cantidad: 3.2, unidad: "kg" },
      { insumo: "Ácido Cítrico", cantidad: 5, unidad: "kg" },
      { insumo: "Ácido Ascórbico", cantidad: 1.15, unidad: "kg" },
      { insumo: "Aroma", cantidad: 0.74, unidad: "L" },
      { insumo: "Sucralosa", cantidad: 0.144, unidad: "kg" },
      { insumo: "Acesulfame", cantidad: 0.165, unidad: "kg" },
      { insumo: "Agua", cantidad: 2430, unidad: "L" },
    ]

    const resultado = calcularConsumoFormula(insumosPera, 30)
    const totales = Object.fromEntries(resultado.map((r) => [r.insumo, r.total]))

    expect(totales["Azúcar"]).toBe(3000)
    expect(totales["CMC"]).toBe(78)
    expect(totales["Goma"]).toBe(96)
    expect(totales["Ácido Cítrico"]).toBe(150)
    expect(totales["Ácido Ascórbico"]).toBeCloseTo(34.5)
    expect(totales["Aroma"]).toBeCloseTo(22.2)
    expect(totales["Sucralosa"]).toBeCloseTo(4.32)
    expect(totales["Acesulfame"]).toBeCloseTo(4.95)
    expect(totales["Agua"]).toBe(72900)
  })

  it("Premium · Agua de Coco · 2 tambores (variante con pocos insumos)", () => {
    const insumosAguaDeCoco: InsumoFormula[] = [
      { insumo: "Pectina", cantidad: 0, unidad: "kg" },
      { insumo: "Ácido Ascórbico", cantidad: 0.017, unidad: "kg" },
    ]

    const resultado = calcularConsumoFormula(insumosAguaDeCoco, 2)
    const totales = Object.fromEntries(resultado.map((r) => [r.insumo, r.total]))

    expect(totales["Pectina"]).toBe(0)
    expect(totales["Ácido Ascórbico"]).toBeCloseTo(0.034)
  })

  it("Té de Durazno · 1 kit", () => {
    const insumosTeDurazno: InsumoFormula[] = [
      { insumo: "Azúcar", cantidad: 250, unidad: "kg" },
      { insumo: "Aroma", cantidad: 1.6, unidad: "L" },
    ]

    const resultado = calcularConsumoFormula(insumosTeDurazno, 1)
    const totales = Object.fromEntries(resultado.map((r) => [r.insumo, r.total]))

    expect(totales["Azúcar"]).toBe(250)
    expect(totales["Aroma"]).toBe(1.6)
  })
})
