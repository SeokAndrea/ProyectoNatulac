import { describe, expect, it } from "vitest"
import { agruparPuestosPorArea } from "@/components/VerComo"
import type { PuestoEstructura } from "@/lib/estructura"

const p = (id: string, areaCodigo: string | null, activo = true): PuestoEstructura => ({
  id, codigo: id, nombre: id, areaCodigo, nivel: 3, activo, todosLosPermisos: false, rolEquivalente: "SUPERVISOR", personas: 0, permisos: [],
})

describe("agruparPuestosPorArea", () => {
  it("agrupa por área y deja afuera los puestos inactivos", () => {
    const grupos = agruparPuestosPorArea([p("a", "MANTENIMIENTO"), p("b", "ASEPTICO"), p("c", "MANTENIMIENTO"), p("d", "ASEPTICO", false), p("e", null)])
    expect(grupos.map((g) => [g.areaCodigo, g.puestos.map((x) => x.id)])).toEqual([
      ["MANTENIMIENTO", ["a", "c"]],
      ["ASEPTICO", ["b"]],
      [null, ["e"]],
    ])
  })

  it("un área con solo puestos inactivos no aparece", () => {
    expect(agruparPuestosPorArea([p("x", "CALIDAD", false)])).toEqual([])
  })
})
