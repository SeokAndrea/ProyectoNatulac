import { describe, expect, it } from "vitest"
import { deltaEnvases, derivarValores, type DatosPresentacion, type ValoresProduccion } from "@/lib/validacion"

// Presentación de 1000 ml: 12 envases/caja, 48 cajas/paleta, 12 L/caja.
const datos: DatosPresentacion = { cajasXPaleta: 48, envasesXCaja: 12, litrosXCaja: 12, volumenMl: 1000 }
const base: ValoresProduccion = {
  paletas: 10,
  cajasSueltas: 20,
  cajas: 500, // 10 × 48 + 20
  envasesLlenadora: 6200,
  envasesBuenos: 6000,
  litrosConsumidos: 6200,
  litrosProducidos: 6000,
  mermaEnvasesPct: 3.2, // 1 − 6000/6200
  mermaSemielaboradoPct: 3.2,
}

describe("derivarValores", () => {
  it("sin correcciones deja lo del supervisor", () => {
    const v = derivarValores(base, datos, null)
    expect(v.cajas).toBe(500)
    expect(v.mermaEnvasesPct).toBe(3.2)
  })

  it("al editar paletas recalcula cajas, litros producidos y mermas", () => {
    const v = derivarValores(base, datos, { paletas: 12 })
    expect(v.cajas).toBe(12 * 48 + 20) // 596
    expect(v.litrosProducidos).toBe(596 * 12) // 7152
    expect(v.mermaEnvasesPct).toBe(-15.4) // 1 − 7152/6200
    expect(v.mermaSemielaboradoPct).toBe(-15.4)
  })

  it("al editar el contador recalcula litros consumidos y mermas", () => {
    const v = derivarValores(base, datos, { envasesLlenadora: 6000 })
    expect(v.litrosConsumidos).toBe(6000)
    expect(v.mermaEnvasesPct).toBe(0)
    expect(v.mermaSemielaboradoPct).toBe(0)
  })

  it("un % escrito a mano manda sobre el cálculo", () => {
    const v = derivarValores(base, datos, { paletas: 12, mermaEnvasesPct: 2 })
    expect(v.mermaEnvasesPct).toBe(2)
    expect(v.mermaSemielaboradoPct).toBe(-15.4)
  })

  it("sin datos de la presentación no recalcula lo derivado", () => {
    const v = derivarValores(base, null, { paletas: 12 })
    expect(v.cajas).toBe(500)
    expect(v.mermaEnvasesPct).toBe(3.2)
  })
})

describe("deltaEnvases", () => {
  it("es |Contador 2 − envases del Producto Terminado|", () => {
    expect(deltaEnvases(base, datos)).toBe(0) // 500 × 12 = 6000 = buenos
    expect(deltaEnvases({ ...base, envasesBuenos: 5900 }, datos)).toBe(100)
  })
  it("es null sin Contador 2", () => {
    expect(deltaEnvases({ ...base, envasesBuenos: null }, datos)).toBeNull()
  })
})
