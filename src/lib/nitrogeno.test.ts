import { describe, expect, it } from "vitest"
import { consumoNitrogeno, errorNitrogeno, leerBombonas, mapearNitrogeno, textoBombonas } from "@/lib/nitrogeno"

describe("nitrógeno del turno", () => {
  it("consumo = recibidas + llegaron − entregadas", () => {
    expect(consumoNitrogeno({ inicio: 6, llegaron: 0, fin: 4 })).toBe(2)
    expect(consumoNitrogeno({ inicio: 3, llegaron: 2, fin: 5 })).toBe(0)
    expect(consumoNitrogeno({ inicio: 3, llegaron: 6, fin: 4 })).toBe(5)
    expect(consumoNitrogeno({ inicio: 3, llegaron: 0, fin: null })).toBeNull()
    expect(consumoNitrogeno(null)).toBeNull()
  })

  it("recibe 3 y entrega 5: pide anotar al menos 2 que llegaron", () => {
    expect(errorNitrogeno(3, 0, 5)).toMatch(/Entregas 5 bombonas llenas, pero recibiste 3 y anotaste 0 .*\(al menos 2\)/)
    expect(errorNitrogeno(3, 1, 5)).toMatch(/al menos 2/)
    expect(errorNitrogeno(3, 2, 5)).toBeNull()
    expect(errorNitrogeno(null, 0, 5)).toBeNull()
  })

  it("lee enteros de 0 a 999", () => {
    expect(leerBombonas(" 4 ")).toBe(4)
    expect(leerBombonas("0")).toBe(0)
    expect(leerBombonas("")).toBeNull()
    expect(leerBombonas("-1")).toBeNull()
    expect(leerBombonas("2,5")).toBeNull()
    expect(leerBombonas("1000")).toBeNull()
  })

  it("mapea turno_json y el texto", () => {
    expect(mapearNitrogeno({})).toEqual({ aplica: false, datos: null, turnoAnterior: null })
    expect(
      mapearNitrogeno({ nitrogeno_aplica: true, nitrogeno: { inicio: 3, llegaron: null, fin: null }, nitrogeno_turno_anterior: 3 }),
    ).toEqual({ aplica: true, datos: { inicio: 3, llegaron: 0, fin: null }, turnoAnterior: 3 })
    expect(textoBombonas(1)).toBe("1 bombona")
    expect(textoBombonas(0)).toBe("0 bombonas")
  })
})
