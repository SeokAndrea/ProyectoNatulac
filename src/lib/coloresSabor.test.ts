import { describe, expect, it } from "vitest"
import { colorSabor } from "@/lib/coloresSabor"

describe("colorSabor", () => {
  it("sin sabor → gris", () => {
    expect(colorSabor(null)).toBe("var(--muted-foreground)")
    expect(colorSabor("")).toBe("var(--muted-foreground)")
  })

  it("la fruta define el hue", () => {
    expect(colorSabor("Manzana")).toBe("var(--flavor-red)")
    expect(colorSabor("Pera")).toBe("var(--flavor-green)")
    expect(colorSabor("Durazno")).toBe("var(--flavor-yellow)")
    expect(colorSabor("Naranja")).toBe("var(--flavor-orange)")
    expect(colorSabor("Limón")).toBe("var(--flavor-lime)")
  })

  it("la familia aclara: Jucosa más que Selecto, Selecto más que Clásico", () => {
    expect(colorSabor("Manzana")).toBe("var(--flavor-red)") // clásico = base, el más oscuro
    expect(colorSabor("Manzana (Selecto)")).toBe("color-mix(in oklab, var(--flavor-red), white 22%)")
    expect(colorSabor("Manzana (Jucosa)")).toBe("color-mix(in oklab, var(--flavor-red), white 48%)")
  })

  it("misma lógica para pera / durazno / naranja", () => {
    expect(colorSabor("Pera (Jucosa)")).toBe("color-mix(in oklab, var(--flavor-green), white 48%)")
    expect(colorSabor("Durazno (Selecto)")).toBe("color-mix(in oklab, var(--flavor-yellow), white 22%)")
    expect(colorSabor("Naranja (Jucosa)")).toBe("color-mix(in oklab, var(--flavor-orange), white 48%)")
  })

  it("Té de X → color propio, distinto del sabor normal de esa fruta", () => {
    expect(colorSabor("Té de Durazno")).toBe("#ff4900")
    expect(colorSabor("Te de Limón")).toBe("#2e7d44")
  })

  it("sabor sin fruta reconocida → color estable por hash (siempre el mismo)", () => {
    const a = colorSabor("Mango")
    expect(a).toBe(colorSabor("Mango"))
    expect(["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]).toContain(a)
    expect(colorSabor("Coctel")).toMatch(/^var\(--flavor-/)
  })
})
