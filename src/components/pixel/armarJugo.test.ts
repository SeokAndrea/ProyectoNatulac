import { describe, expect, it } from "vitest"
import { interpretarSabor } from "./armarJugo"
import { FAMILIAS } from "./familias"
import { PRESENTACIONES } from "./presentaciones"
import { SABORES } from "./sabores"

describe("interpretarSabor", () => {
  it.each([
    ["Manzana", "clasico", "manzana"],
    ["Coctel", "clasico", "coctel"],
    ["Mango", "clasico", "mango"],
    ["Pera (Jucosa)", "jucosa", "pera"],
    ["Durazno 35%", "selecto", "durazno"],
    ["Manzana (Selecto)", "selecto", "manzana"],
    ["Té de Durazno", "te", "durazno"],
    ["Te de Limón", "te", "limon"],
    ["Agua de Coco (Premium)", "premium", "coco"],
    ["Naranja 100% (Premium)", "premium", "naranja"],
    ["Manzana Clarificado (Premium)", "premium", "manzana"],
  ])("%s → %s / %s", (nombre, familia, sabor) => {
    expect(interpretarSabor(nombre)).toEqual({ familia, sabor })
  })

  it("devuelve null si no hay sabor o no se reconoce la fruta", () => {
    expect(interpretarSabor(null)).toBeNull()
    expect(interpretarSabor("Algo nuevo")).toBeNull()
  })
})

describe("datos del pixel art", () => {
  it("cada dibujo tiene todas sus filas del mismo largo", () => {
    for (const p of Object.values(PRESENTACIONES)) expect(new Set(p.dibujo.map((f) => f.length)).size).toBe(1)
    for (const s of Object.values(SABORES)) expect(new Set(s.dibujo.map((f) => f.length)).size).toBe(1)
  })

  it("las familias solo nombran presentaciones y sabores que existen", () => {
    for (const f of Object.values(FAMILIAS)) {
      for (const p of f.presentaciones) expect(PRESENTACIONES[p]).toBeDefined()
      for (const s of f.sabores) expect(SABORES[s]).toBeDefined()
    }
  })
})
