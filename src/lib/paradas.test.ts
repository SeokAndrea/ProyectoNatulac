import { describe, expect, it } from "vitest"
import { paradasDemo } from "@/lib/paradasDemoFixture"
import {
  agruparPorDia,
  CATALOGO_PROGRAMADA,
  desvioMin,
  duracionMin,
  fmtDesvio,
  fmtDuracion,
  minutosPorLinea,
  paradaAbierta,
  porTipo,
  resumenPorClase,
  type Parada,
} from "@/lib/paradas"

const P = (over: Partial<Parada> = {}): Parada => ({
  id: "r1",
  clase: "PROGRAMADA",
  origen: "MANUAL",
  lineaCodigo: "LINEA_1",
  turnoTipo: "TURNO_1",
  tipoCodigo: "CAMBIO_SABOR",
  tipoNombre: "Cambio de Sabor",
  tiempoGuiaMin: 25,
  nota: null,
  inicio: "2026-09-09T10:00:00",
  fin: "2026-09-09T10:45:00",
  supervisorNombre: "RICARDO",
  ...over,
})

describe("duracionMin — fin − inicio", () => {
  it("cerrada: usa fin − inicio", () => {
    expect(duracionMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:45:00" }))).toBe(45)
  })
  it("cruza medianoche", () => {
    expect(duracionMin(P({ inicio: "2026-09-09T23:30:00", fin: "2026-09-10T00:15:00" }))).toBe(45)
  })
  it("abierta: ahora − inicio", () => {
    const ahora = new Date("2026-09-09T12:00:00")
    expect(duracionMin(P({ inicio: "2026-09-09T11:00:00", fin: null }), ahora)).toBe(60)
    expect(paradaAbierta(P({ fin: null }))).toBe(true)
  })
  it("sin piso: una parada corta cuenta lo que duró", () => {
    expect(duracionMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:05:00" }))).toBe(5)
  })
})

describe("desvío contra el tiempo guía", () => {
  it("real − guía; positivo se pasó, negativo más corta", () => {
    expect(desvioMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:45:00", tiempoGuiaMin: 25 }))).toBe(20)
    expect(desvioMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:20:00", tiempoGuiaMin: 25 }))).toBe(-5)
  })
  it("null cuando el tipo no tiene guía", () => {
    expect(desvioMin(P({ tiempoGuiaMin: null }))).toBeNull()
  })
  it("fmtDesvio", () => {
    expect(fmtDesvio(0)).toBe("en guía")
    expect(fmtDesvio(18)).toBe("+18 min")
    expect(fmtDesvio(-90)).toBe("−1 h 30 min")
  })
})

describe("resumenPorClase", () => {
  it("reparte por las 3 clases en orden fijo", () => {
    const set = [
      P({ clase: "PROGRAMADA", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:30:00" }),
      P({ clase: "OCIOSO", inicio: "2026-09-09T11:00:00", fin: "2026-09-09T11:20:00" }),
      P({ clase: "OCIOSO", inicio: "2026-09-09T12:00:00", fin: "2026-09-09T12:10:00" }),
    ]
    const r = resumenPorClase(set)
    expect(r.map((x) => x.clase)).toEqual(["PROGRAMADA", "NO_PROGRAMADA", "OCIOSO"])
    expect(r[0]).toMatchObject({ veces: 1, minutos: 30 })
    expect(r[1]).toMatchObject({ veces: 0, minutos: 0 })
    expect(r[2]).toMatchObject({ veces: 2, minutos: 30 })
  })
})

describe("porTipo", () => {
  const set = [
    P({ tipoCodigo: "CAMBIO_SABOR", tipoNombre: "Cambio de Sabor", tiempoGuiaMin: 25, inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:40:00" }),
    P({ tipoCodigo: "CAMBIO_SABOR", tipoNombre: "Cambio de Sabor", tiempoGuiaMin: 25, inicio: "2026-09-09T12:00:00", fin: "2026-09-09T12:20:00" }),
    P({ tipoCodigo: "CAMBIO_LOTE", tipoNombre: "Cambio de Lote", tiempoGuiaMin: 10, inicio: "2026-09-09T14:00:00", fin: "2026-09-09T14:12:00" }),
  ]
  it("agrupa por tipo, ordena por minutos desc", () => {
    const g = porTipo(set)
    expect(g.map((x) => x.codigo)).toEqual(["CAMBIO_SABOR", "CAMBIO_LOTE"])
    expect(g[0]).toMatchObject({ veces: 2, minutos: 60, guiaMin: 50, desvioMin: 10 })
    expect(g[1]).toMatchObject({ veces: 1, minutos: 12, guiaMin: 10, desvioMin: 2 })
  })
  it("tipo sin guía → desvioMin null", () => {
    const g = porTipo([P({ tipoCodigo: "FINAL_PRODUCCION", tipoNombre: "Final", tiempoGuiaMin: null, inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:30:00" })])
    expect(g[0].desvioMin).toBeNull()
  })
})

describe("minutosPorLinea", () => {
  it("siempre devuelve las 3 líneas, con el desglose por clase", () => {
    const set = [
      P({ lineaCodigo: "LINEA_1", clase: "PROGRAMADA", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:30:00" }),
      P({ lineaCodigo: "LINEA_1", clase: "OCIOSO", inicio: "2026-09-09T11:00:00", fin: "2026-09-09T11:15:00" }),
      P({ lineaCodigo: "LINEA_3", clase: "NO_PROGRAMADA", inicio: "2026-09-09T09:00:00", fin: "2026-09-09T10:00:00" }),
    ]
    const r = minutosPorLinea(set)
    expect(r.map((x) => x.linea)).toEqual(["LINEA_1", "LINEA_2", "LINEA_3"])
    expect(r[0]).toMatchObject({ veces: 2, minutos: 45 })
    expect(r[0].porClase).toEqual({ PROGRAMADA: 30, NO_PROGRAMADA: 0, OCIOSO: 15 })
    expect(r[1]).toMatchObject({ veces: 0, minutos: 0 })
    expect(r[2].porClase.NO_PROGRAMADA).toBe(60)
  })
})

describe("agruparPorDia", () => {
  it("ordena por fecha ascendente", () => {
    const set = [
      P({ inicio: "2026-09-10T10:00:00", fin: "2026-09-10T10:20:00" }),
      P({ inicio: "2026-09-08T10:00:00", fin: "2026-09-08T10:30:00" }),
    ]
    expect(agruparPorDia(set).map((x) => x.dia)).toEqual(["2026-09-08", "2026-09-10"])
  })
})

describe("fmtDuracion", () => {
  it("min / h / h+min", () => {
    expect(fmtDuracion(0)).toBe("< 1 min")
    expect(fmtDuracion(45)).toBe("45 min")
    expect(fmtDuracion(60)).toBe("1 h")
    expect(fmtDuracion(150)).toBe("2 h 30 min")
  })
})

describe("catálogo PROGRAMADA", () => {
  it("tiene los 11 tipos del dueño, con código de planilla", () => {
    expect(CATALOGO_PROGRAMADA).toHaveLength(11)
    expect(CATALOGO_PROGRAMADA.every((t) => t.clase === "PROGRAMADA" && t.codigoPlanilla.length > 0)).toBe(true)
    expect(CATALOGO_PROGRAMADA.find((t) => t.codigo === "TRANSFERENCIA_ENERGIA")?.codigoPlanilla).toBe("PPEL1")
    expect(CATALOGO_PROGRAMADA.find((t) => t.codigo === "ARRANQUE_PRODUCCION")?.tiempoGuiaMin).toBe(180)
  })
})

describe("fixture de demo", () => {
  const demo = paradasDemo()
  it("tiene datos y forma consistente", () => {
    expect(demo.length).toBeGreaterThan(10)
    for (const p of demo) {
      expect(["PROGRAMADA", "NO_PROGRAMADA", "OCIOSO"]).toContain(p.clase)
      expect(["MANUAL", "SHEET"]).toContain(p.origen)
      expect(p.inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
      if (p.fin) expect(p.fin >= p.inicio).toBe(true)
    }
  })
  it("incluye paradas en curso (sin fin) y no programadas del Sheet", () => {
    expect(demo.some(paradaAbierta)).toBe(true)
    expect(demo.some((p) => p.clase === "NO_PROGRAMADA" && p.origen === "SHEET")).toBe(true)
    expect(demo.some((p) => p.clase === "OCIOSO" && p.nota)).toBe(true)
  })
})
