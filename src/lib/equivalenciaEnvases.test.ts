import { describe, expect, it } from "vitest"
import { equivalenciaEnvases, textoEquivalencia } from "@/lib/equivalenciaEnvases"

describe("equivalenciaEnvases", () => {
  it("paletas completas, cajas que sobran y envases sueltos", () => {
    // 1 L: 12 envases por caja, 70 cajas por paleta. 11.820 envases = 985 cajas = 14 paletas + 5 cajas
    expect(equivalenciaEnvases(11820, 12, 70)).toEqual({ paletas: 14, cajasSueltas: 5, cajasTotales: 985, envasesSueltos: 0 })
    expect(equivalenciaEnvases(11827, 12, 70)?.envasesSueltos).toBe(7)
  })
  it("sin dato de la presentación: null; sin cajas por paleta: todo en cajas", () => {
    expect(equivalenciaEnvases(1000, 0, 70)).toBeNull()
    expect(equivalenciaEnvases(1200, 12, 0)).toEqual({ paletas: 0, cajasSueltas: 100, cajasTotales: 100, envasesSueltos: 0 })
  })
  it("texto", () => {
    expect(textoEquivalencia(equivalenciaEnvases(11827, 12, 70)!)).toBe("14 paletas y 5 cajas (985 cajas) + 7 envases")
    expect(textoEquivalencia(equivalenciaEnvases(840, 12, 70)!)).toBe("1 paleta (70 cajas)")
    expect(textoEquivalencia(equivalenciaEnvases(36, 12, 70)!)).toBe("3 cajas")
  })
})
