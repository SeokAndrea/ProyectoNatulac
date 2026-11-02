import { describe, expect, it } from "vitest"
import { conFallas } from "@/lib/catalogoFallas/analisis"
import type { FallasDeParada } from "@/lib/catalogoFallas/paradas"
import type { CatalogoFallas } from "@/lib/catalogoFallas/tipos"
import type { Parada } from "@/lib/paradas"
import {
  agruparResumen,
  comparacionPeriodo,
  fallasQueMasSeRepiten,
  filtrarResumen,
  limitarGrupos,
  mesPasado,
  personasQueAtendieron,
  periodoAnterior,
  esteMes,
  totalesResumen,
} from "./reportesResumen"

const c: CatalogoFallas = {
  equipos: [{ id: "cf", sufijo: "CF", nombre: "Llenadora A3", tipo: "LINEA", activo: true, lineas: ["l1"] }],
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
    { id: "f2", subsistemaId: "cam", numero: 2, nombre: "Sensor de nivel", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-02" },
    { id: "f3", subsistemaId: "val", numero: 1, nombre: "Fuga", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-LLE-VAL-01" },
  ],
}

const parada = (id: string, inicio: string, min: number, extra: Partial<Parada> = {}) =>
  ({
    id,
    inicio,
    fin: new Date(new Date(inicio).getTime() + min * 60000).toISOString(),
    responsable: "MANTENIMIENTO",
    clase: "NO_PROGRAMADA",
    lineaCodigo: "LINEA_1",
    tipoCodigo: "T",
    tipoNombre: "Tipo X",
    subsistemaCodigo: null,
    terminadaPor: null,
    ...extra,
  }) as Parada

const ahora = new Date("2026-11-01T00:00:00Z")

const paradas = [
  parada("a", "2026-10-30T14:00:00Z", 30, { terminadaPor: "Mario" }),
  parada("b", "2026-10-30T15:00:00Z", 20, { terminadaPor: "Mario" }),
  parada("c", "2026-10-30T16:00:00Z", 10, { terminadaPor: "Sofía" }),
  parada("d", "2026-10-30T17:00:00Z", 40, { terminadaPor: "Sofía" }),
  // Sin falla nueva: catálogo viejo.
  parada("v1", "2026-10-30T18:00:00Z", 15, { subsistemaCodigo: "SUB-1", subsistemaNombre: "Rodillos", tipoCodigo: "TV", tipoNombre: "Falla rodillo", responsable: "OPERACIONAL", lineaCodigo: "LINEA_2" }),
  parada("v2", "2026-10-30T19:00:00Z", 5, { tipoCodigo: "TO", tipoNombre: "Cambio de sabor", responsable: "OPERACIONAL" }),
]
const fallas = new Map<string, FallasDeParada>([
  ["a", { fallaProduccionId: "f1", fallaFinalId: null }],
  ["b", { fallaProduccionId: "f1", fallaFinalId: "f1" }],
  ["c", { fallaProduccionId: "f2", fallaFinalId: null }],
  ["d", { fallaProduccionId: "f3", fallaFinalId: null }],
])
const items = conFallas(paradas, fallas, c)

describe("períodos", () => {
  it("el período anterior tiene el mismo largo y termina el día antes", () => {
    expect(periodoAnterior({ desde: "2026-10-01", hasta: "2026-10-31" })).toEqual({ desde: "2026-08-31", hasta: "2026-09-30" })
    expect(periodoAnterior({ desde: "2026-11-10", hasta: "2026-11-10" })).toEqual({ desde: "2026-11-09", hasta: "2026-11-09" })
    expect(periodoAnterior({ desde: "2026-11-01", hasta: "2026-11-07" })).toEqual({ desde: "2026-10-25", hasta: "2026-10-31" })
  })

  it("este mes va del 1 a hoy; el mes pasado, entero", () => {
    expect(esteMes("2026-11-18")).toEqual({ desde: "2026-11-01", hasta: "2026-11-18" })
    expect(mesPasado("2026-11-18")).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" })
    expect(mesPasado("2026-01-05")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" })
    expect(mesPasado("2026-03-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" })
  })
})

describe("filtros", () => {
  it("filtra por línea, de quién es y quién la atendió", () => {
    expect(filtrarResumen(paradas, { linea: "LINEA_2", responsable: "TODOS", atendio: "TODOS" }).map((p) => p.id)).toEqual(["v1"])
    expect(filtrarResumen(paradas, { linea: "TODAS", responsable: "OPERACIONAL", atendio: "TODOS" }).map((p) => p.id)).toEqual(["v1", "v2"])
    expect(filtrarResumen(paradas, { linea: "TODAS", responsable: "TODOS", atendio: "Sofía" }).map((p) => p.id)).toEqual(["c", "d"])
  })

  it("deja afuera las pendientes", () => {
    const con = [...paradas, parada("p", "2026-10-30T20:00:00Z", 0, { pendiente: true })]
    expect(filtrarResumen(con, { linea: "TODAS", responsable: "TODOS", atendio: "TODOS" }).map((p) => p.id)).not.toContain("p")
  })

  it("las personas que atendieron salen distintas y ordenadas", () => {
    expect(personasQueAtendieron(paradas)).toEqual(["Mario", "Sofía"])
  })
})

describe("totales", () => {
  it("suma, cuenta y promedia redondeado a minutos", () => {
    expect(totalesResumen(paradas.slice(0, 3), ahora)).toEqual({ veces: 3, minutos: 60, promedio: 20 })
    expect(totalesResumen([parada("x", "2026-10-30T14:00:00Z", 10), parada("y", "2026-10-30T15:00:00Z", 5)], ahora)).toEqual({ veces: 2, minutos: 15, promedio: 8 })
  })

  it("sin paradas todo es cero", () => {
    expect(totalesResumen([], ahora)).toEqual({ veces: 0, minutos: 0, promedio: 0 })
  })

  it("una parada en curso cuenta hasta ahora", () => {
    const abierta = { ...parada("o", "2026-10-31T23:00:00Z", 0), fin: null }
    expect(totalesResumen([abierta], ahora).minutos).toBe(60)
  })
})

describe("comparación con el período anterior", () => {
  it("dice cuántas más o menos y el promedio de antes", () => {
    const c1 = comparacionPeriodo({ veces: 52, minutos: 1300, promedio: 25 }, { veces: 43, minutos: 946, promedio: 22 })
    expect(c1).toEqual({ veces: "+9 que el período anterior", tiempo: "período anterior: 15 h 46 min", promedio: "período anterior: 22 min" })
    expect(comparacionPeriodo({ veces: 3, minutos: 10, promedio: 3 }, { veces: 5, minutos: 20, promedio: 4 }).veces).toBe("-2 que el período anterior")
    expect(comparacionPeriodo({ veces: 3, minutos: 10, promedio: 3 }, { veces: 3, minutos: 20, promedio: 4 }).veces).toBe("igual que el período anterior")
  })

  it("sin paradas antes lo dice", () => {
    const c0 = comparacionPeriodo({ veces: 3, minutos: 10, promedio: 3 }, { veces: 0, minutos: 0, promedio: 0 })
    expect(c0).toEqual({ veces: "el período anterior no tuvo paradas", tiempo: "el período anterior no tuvo paradas", promedio: "el período anterior no tuvo paradas" })
  })
})

describe("agrupar", () => {
  it("por subsistema usa el catálogo nuevo y, sin falla, el subsistema viejo o el tipo", () => {
    const g = agruparResumen(paradas, items, "SUBSISTEMA", ahora)
    expect(g.map((x) => [x.nombre, x.detalle, x.veces, x.minutos, x.promedio])).toEqual([
      ["Cámara aséptica", "Llenadora A3", 3, 60, 20],
      ["Válvula", "Llenadora A3", 1, 40, 40],
      ["Rodillos", null, 1, 15, 15],
      ["Cambio de sabor", null, 1, 5, 5],
    ])
  })

  it("por equipo, sistema y falla", () => {
    expect(agruparResumen(paradas, items, "EQUIPO", ahora).map((x) => [x.nombre, x.minutos])).toEqual([["Llenadora A3", 100], ["Falla rodillo", 15], ["Cambio de sabor", 5]])
    expect(agruparResumen(paradas, items, "SISTEMA", ahora).map((x) => [x.nombre, x.detalle])).toEqual([
      ["Superestructura", "Llenadora A3"],
      ["Llenado", "Llenadora A3"],
      ["Falla rodillo", null],
      ["Cambio de sabor", null],
    ])
    expect(agruparResumen(paradas, items, "FALLA", ahora).map((x) => [x.nombre, x.detalle, x.veces])).toEqual([
      ["Baja presión", "Cámara aséptica · Llenadora A3", 2],
      ["Fuga", "Válvula · Llenadora A3", 1],
      ["Falla rodillo", null, 1],
      ["Sensor de nivel", "Cámara aséptica · Llenadora A3", 1],
      ["Cambio de sabor", null, 1],
    ])
  })

  it("sin ninguna falla nueva (switch apagado) igual agrupa por el catálogo viejo", () => {
    const g = agruparResumen(paradas, [], "SUBSISTEMA", ahora)
    expect(g.map((x) => x.nombre)).toEqual(["Tipo X", "Rodillos", "Cambio de sabor"])
    expect(g[0]).toMatchObject({ veces: 4, minutos: 100, promedio: 25 })
  })

  it("cada grupo trae sus fallas y la más común", () => {
    const [cam] = agruparResumen(paradas, items, "SUBSISTEMA", ahora)
    expect(cam.fallas.map((f) => [f.nombre, f.veces, f.minutos, f.promedio])).toEqual([["Baja presión", 2, 50, 25], ["Sensor de nivel", 1, 10, 10]])
    expect(cam.fallaMasComun).toMatchObject({ nombre: "Baja presión", veces: 2 })
  })

  it("por falla no hay sub-fallas ni falla más común", () => {
    const [primera] = agruparResumen(paradas, items, "FALLA", ahora)
    expect(primera.fallas).toEqual([])
    expect(primera.fallaMasComun).toBeNull()
  })

  it("la falla más común desempata por tiempo", () => {
    const dos = [parada("x", "2026-10-30T14:00:00Z", 10), parada("y", "2026-10-30T15:00:00Z", 30)]
    const f = new Map<string, FallasDeParada>([["x", { fallaProduccionId: "f1", fallaFinalId: null }], ["y", { fallaProduccionId: "f2", fallaFinalId: null }]])
    const [g] = agruparResumen(dos, conFallas(dos, f, c), "SUBSISTEMA", ahora)
    expect(g.fallaMasComun?.nombre).toBe("Sensor de nivel")
  })
})

describe("máximo de filas y Otros", () => {
  const muchos = Array.from({ length: 10 }, (_, i) =>
    parada(`m${i}`, "2026-10-30T14:00:00Z", 100 - i * 10, { tipoCodigo: `T${i}`, tipoNombre: `Tipo ${i}` }),
  )
  it("deja 8 y suma el resto en Otros", () => {
    const g = agruparResumen(muchos, [], "FALLA", ahora)
    const { filas, otros } = limitarGrupos(g, 8)
    expect(filas).toHaveLength(8)
    expect(otros).toEqual({ cantidad: 2, veces: 2, minutos: 30, promedio: 15 })
  })

  it("si caben todos no hay Otros", () => {
    const g = agruparResumen(muchos.slice(0, 3), [], "FALLA", ahora)
    expect(limitarGrupos(g, 8).otros).toBeNull()
  })
})

describe("fallas que más se repiten", () => {
  it("las que se repiten, por veces y desempate por tiempo, con su subsistema y equipo", () => {
    const r = fallasQueMasSeRepiten(paradas, items, ahora)
    expect(r.map((x) => [x.nombre, x.detalle, x.veces, x.minutos, x.promedio])).toEqual([["Baja presión", "Cámara aséptica · Llenadora A3", 2, 50, 25]])
  })

  it("trae como máximo 6", () => {
    const muchas = Array.from({ length: 9 }, (_, i) => [
      parada(`p${i}a`, "2026-10-30T14:00:00Z", 10, { tipoCodigo: `T${i}`, tipoNombre: `Tipo ${i}` }),
      parada(`p${i}b`, "2026-10-30T15:00:00Z", 10 + i, { tipoCodigo: `T${i}`, tipoNombre: `Tipo ${i}` }),
    ]).flat()
    const r = fallasQueMasSeRepiten(muchas, [], ahora)
    expect(r).toHaveLength(6)
    expect(r[0].nombre).toBe("Tipo 8")
  })
})
