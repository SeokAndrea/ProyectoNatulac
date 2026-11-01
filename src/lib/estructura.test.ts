import { describe, expect, it } from "vitest"
import { agruparPorNivel, diferenciasMatriz, type PuestoEstructura } from "@/lib/estructura"
import type { Permiso } from "@/lib/permisos"

function puesto(id: string, permisos: Permiso[]): PuestoEstructura {
  return {
    id,
    codigo: id,
    nombre: id,
    areaCodigo: "MANTENIMIENTO",
    nivel: 3,
    activo: true,
    todosLosPermisos: false,
    personas: 1,
    permisos,
  }
}

describe("diferenciasMatriz", () => {
  const original = [puesto("tec", ["SIF_GESTIONAR", "TURNO_CARGAR"]), puesto("sup", ["VALIDAR"])]
  const copia = () => new Map<string, Set<Permiso>>(original.map((p) => [p.id, new Set(p.permisos)]))

  it("marcar y desmarcar en el técnico da exactamente esos 2 cambios", () => {
    const editada = copia()
    editada.get("tec")!.add("CATALOGO_PARADAS")
    editada.get("tec")!.delete("SIF_GESTIONAR")
    const cambios = diferenciasMatriz(original, editada)
    expect(cambios).toHaveLength(2)
    expect(cambios).toContainEqual({ puestoId: "tec", permiso: "CATALOGO_PARADAS", activo: true })
    expect(cambios).toContainEqual({ puestoId: "tec", permiso: "SIF_GESTIONAR", activo: false })
  })

  it("sin tocar nada no hay cambios", () => {
    expect(diferenciasMatriz(original, copia())).toEqual([])
  })

  it("marcar y volver a desmarcar no deja cambios", () => {
    const editada = copia()
    editada.get("tec")!.add("CATALOGO_PARADAS")
    editada.get("tec")!.delete("CATALOGO_PARADAS")
    expect(diferenciasMatriz(original, editada)).toEqual([])
  })
})

describe("agruparPorNivel", () => {
  it("agrupa por nivel en orden, sin niveles vacíos", () => {
    const grupos = agruparPorNivel([
      { id: "a", nivel: 3 as const },
      { id: "b", nivel: 1 as const },
      { id: "c", nivel: 3 as const },
    ])
    expect(grupos.map((g) => [g.nivel, g.nombre, g.items.length])).toEqual([
      [1, "Jefatura", 1],
      [3, "Operación", 2],
    ])
  })

  it("los de nivel null van en un grupo aparte al final", () => {
    const grupos = agruparPorNivel([
      { id: "a", nivel: null },
      { id: "b", nivel: 2 as const },
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].nivel).toBe(2)
    expect(grupos[1].items).toHaveLength(1)
  })
})
