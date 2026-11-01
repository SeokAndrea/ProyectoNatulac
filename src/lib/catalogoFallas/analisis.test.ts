import { describe, expect, it } from "vitest"
import type { Parada } from "@/lib/paradas"
import { conFallas, noProgramadasPorLinea, porResponsable, subsistemasMezclados, topPorNivel } from "./analisis"
import type { FallasDeParada } from "./paradas"
import type { CatalogoFallas } from "./tipos"

const c: CatalogoFallas = {
  equipos: [{ id: "cf", sufijo: "CF", nombre: "Compact Flex", tipo: "LINEA", activo: true, lineas: ["l2"] }],
  sistemas: [
    { id: "sup", equipoId: "cf", sufijo: "SUP", nombre: "Superestructura", activo: true },
    { id: "lle", equipoId: "cf", sufijo: "LLE", nombre: "Llenado", activo: true },
  ],
  subsistemas: [
    { id: "cam", sistemaId: "sup", sufijo: "CAM", nombre: "Cámara aséptica", codigoSheet: null, activo: true },
    { id: "val", sistemaId: "lle", sufijo: "VAL", nombre: "Válvula", codigoSheet: null, activo: true },
  ],
  fallas: [
    { id: "f1", subsistemaId: "cam", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
    { id: "f2", subsistemaId: "val", numero: 1, nombre: "Fuga", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-LLE-VAL-01" },
  ],
}

const parada = (id: string, inicio: string, min: number, extra: Partial<Parada> = {}) =>
  ({
    id,
    inicio,
    fin: new Date(new Date(inicio).getTime() + min * 60000).toISOString(),
    responsable: "MANTENIMIENTO",
    clase: "NO_PROGRAMADA",
    lineaCodigo: "LINEA_2",
    ...extra,
  }) as Parada

const paradas = [
  parada("a", "2026-10-30T14:00:00Z", 30),
  parada("b", "2026-10-30T15:00:00Z", 10, { responsable: "OPERACIONAL" }),
  parada("c", "2026-10-30T16:00:00Z", 15),
  parada("vieja", "2026-10-30T17:00:00Z", 40, { lineaCodigo: "LINEA_1" }),
  parada("prog", "2026-10-30T18:00:00Z", 25, { responsable: "OPERACIONAL", clase: "PROGRAMADA" }),
]
const fallas = new Map<string, FallasDeParada>([
  ["a", { fallaProduccionId: "f1", fallaFinalId: "f1" }],
  ["b", { fallaProduccionId: "f1", fallaFinalId: null }],
  ["c", { fallaProduccionId: "f1", fallaFinalId: "f2" }],
])
const ahora = new Date("2026-10-31T00:00:00Z")
const items = conFallas(paradas, fallas, c)

describe("cuentas del Panel de Paradas", () => {
  it("solo entran las que tienen falla nueva; cuenta la de Mantenimiento si la hay", () => {
    expect(items.map((x) => [x.parada.id, x.cuenta.falla.id])).toEqual([["a", "f1"], ["b", "f1"], ["c", "f2"]])
  })

  it("top por equipo, sistema y subsistema, por tiempo y con sus veces", () => {
    expect(topPorNivel(items, "EQUIPO", ahora).map((g) => [g.nombre, g.minutos, g.veces])).toEqual([["Compact Flex", 55, 3]])
    expect(topPorNivel(items, "SISTEMA", ahora).map((g) => [g.nombre, g.minutos])).toEqual([["Superestructura · Compact Flex", 40], ["Llenado · Compact Flex", 15]])
    expect(topPorNivel(items, "SUBSISTEMA", ahora).map((g) => g.nombre)).toEqual(["Cámara aséptica · Compact Flex", "Válvula · Compact Flex"])
    expect(topPorNivel(items, "FALLA", ahora).map((g) => [g.nombre, g.veces])).toEqual([["Baja presión · Cámara aséptica", 2], ["Fuga · Válvula", 1]])
  })

  it("subsistemas nuevos mezclados con los del catálogo viejo", () => {
    const viejo = { codigo: "A3F-MOR-14", nombre: "A3F-MOR-14 · MORDAZAS", clase: "NO_PROGRAMADA" as const, veces: 1, minutos: 50, guiaMin: 0, desvioMin: null }
    expect(subsistemasMezclados(items, [viejo], ahora).map((g) => [g.nombre, g.minutos])).toEqual([
      ["A3F-MOR-14 · MORDAZAS", 50],
      ["Cámara aséptica · Compact Flex", 40],
      ["Válvula · Compact Flex", 15],
    ])
  })

  it("reparto por responsable y no programadas por línea", () => {
    expect(porResponsable(paradas, ahora)).toEqual({ produccion: { veces: 2, minutos: 35 }, mantenimiento: { veces: 3, minutos: 85 } })
    expect(noProgramadasPorLinea(paradas, ["LINEA_1", "LINEA_2", "LINEA_3"], ahora)).toEqual([
      { linea: "LINEA_1", veces: 1, minutos: 40 },
      { linea: "LINEA_2", veces: 3, minutos: 55 },
      { linea: "LINEA_3", veces: 0, minutos: 0 },
    ])
  })
})
