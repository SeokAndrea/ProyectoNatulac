import { describe, expect, it } from "vitest"
import { armarGrupos, equiposSinSubsistemas, fallasDeNivel } from "./tabla"
import type { CatalogoFallas } from "./tipos"

const c: CatalogoFallas = {
  equipos: [
    { id: "e1", sufijo: "CF", nombre: "Compact Flex", tipo: "LINEA", activo: true, lineas: ["l2"] },
    { id: "e2", sufijo: "GEN", nombre: "Generador", tipo: "SERVICIOS", activo: true, lineas: [] },
  ],
  sistemas: [{ id: "s1", equipoId: "e1", sufijo: "SUP", nombre: "Superestructura", activo: true }],
  subsistemas: [
    { id: "u1", sistemaId: "s1", sufijo: "CAM", nombre: "Cámara aséptica", codigoSheet: "A3CF-ASE-01", activo: true },
    { id: "u2", sistemaId: "s1", sufijo: "AIR", nombre: "Aire estéril", codigoSheet: null, activo: true },
  ],
  fallas: [
    { id: "f1", subsistemaId: "u1", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
    { id: "f2", subsistemaId: "u1", numero: 2, nombre: "Contaminación", clase: "NO_PROGRAMADA", activo: false, codigo: "CF-SUP-CAM-02" },
  ],
}
const sin = { busqueda: "", equipoId: "", verInactivos: false }

describe("armarGrupos", () => {
  it("una franja por subsistema ordenada por sufijo, también los que no tienen fallas", () => {
    const g = armarGrupos(c, sin)
    expect(g.map((x) => x.subsistema.sufijo)).toEqual(["AIR", "CAM"])
    expect(g[1].fallas.map((f) => f.id)).toEqual(["f1"])
  })

  it("busca por falla, por nivel y por código del Sheet, sin tildes", () => {
    expect(armarGrupos(c, { ...sin, busqueda: "presion" }).map((x) => x.subsistema.id)).toEqual(["u1"])
    expect(armarGrupos(c, { ...sin, busqueda: "camara" })[0].fallas).toHaveLength(1)
    expect(armarGrupos(c, { ...sin, busqueda: "a3cf-ase" })).toHaveLength(1)
    expect(armarGrupos(c, { ...sin, busqueda: "nada" })).toHaveLength(0)
  })

  it("filtra por equipo y muestra inactivos solo si se pide", () => {
    expect(armarGrupos(c, { ...sin, equipoId: "e2" })).toHaveLength(0)
    expect(armarGrupos(c, { ...sin, verInactivos: true })[1].fallas).toHaveLength(2)
  })

  it("filtra en cascada por sistema y subsistema", () => {
    expect(armarGrupos(c, { ...sin, equipoId: "e1", sistemaId: "s1" }).map((x) => x.subsistema.id)).toEqual(["u2", "u1"])
    expect(armarGrupos(c, { ...sin, equipoId: "e1", sistemaId: "s1", subsistemaId: "u1" }).map((x) => x.subsistema.id)).toEqual(["u1"])
    expect(armarGrupos(c, { ...sin, equipoId: "e2", sistemaId: "s1" })).toHaveLength(0)
  })

  it("ordena por creación; lo creado igual o sin fecha, por sufijo", () => {
    const orden: CatalogoFallas = {
      ...c,
      subsistemas: [
        { id: "u1", sistemaId: "s1", sufijo: "CAM", nombre: "Cámara", codigoSheet: null, activo: true, creadoEn: "2026-11-02T10:00:00Z" },
        { id: "u2", sistemaId: "s1", sufijo: "AIR", nombre: "Aire", codigoSheet: null, activo: true, creadoEn: "2026-11-03T10:00:00Z" },
        { id: "u3", sistemaId: "s1", sufijo: "BOM", nombre: "Bomba", codigoSheet: null, activo: true, creadoEn: "2026-11-02T10:00:00Z" },
      ],
      fallas: [],
    }
    expect(armarGrupos(orden, sin).map((x) => x.subsistema.id)).toEqual(["u3", "u1", "u2"])
  })
})

it("equiposSinSubsistemas y fallasDeNivel", () => {
  expect(equiposSinSubsistemas(c).map((e) => e.id)).toEqual(["e2"])
  expect(fallasDeNivel(c, "EQUIPO", "e1")).toBe(2)
  expect(fallasDeNivel(c, "SUBSISTEMA", "u2")).toBe(0)
})
