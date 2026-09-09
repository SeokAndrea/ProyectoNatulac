import { describe, expect, it } from "vitest"
import { paradasDemo } from "@/lib/paradasDemoFixture"
import {
  agruparPorCodigo,
  agruparPorDia,
  agruparPorEquipo,
  duracionMin,
  esParadaDeLuz,
  fmtDuracion,
  minutosPorLinea,
  paradaAbierta,
  PISO_LUZ_MIN,
  resumenPorCategoria,
  type Parada,
} from "@/lib/paradas"

const P = (over: Partial<Parada> = {}): Parada => ({
  id: "r1",
  categoria: "MECANICA",
  pisoMin: null,
  area: "ASEPTICO",
  turnoTipo: "TURNO_1",
  turnoCodigo: null,
  linea: "LINEA_1",
  equipoCodigo: "A3CFLEX",
  equipoNombre: "A3CFLEX",
  subsistemaCodigo: "A3CF-SELL-03",
  subsistemaNombre: "SELLADO LONGITUDINAL",
  descripcion: "falla",
  supervisorNombre: "RICARDO",
  reporta: "TECNICO",
  estatus: "FINALIZADO",
  inicio: "2026-09-09T10:00:00",
  fin: "2026-09-09T10:45:00",
  procuraMin: null,
  downtimeSheetMin: 45,
  ...over,
})

describe("duracionMin — cálculo propio (fin − inicio)", () => {
  it("cerrada: usa fin − inicio, ignora downtimeSheetMin", () => {
    expect(duracionMin(P({ fin: "2026-09-09T10:45:00", downtimeSheetMin: 9999 }))).toBe(45)
  })
  it("cruza medianoche", () => {
    expect(duracionMin(P({ inicio: "2026-09-09T23:30:00", fin: "2026-09-10T01:00:00" }))).toBe(90)
  })
  it("abierta: ahora − inicio", () => {
    const ahora = new Date("2026-09-09T10:30:00")
    expect(duracionMin(P({ fin: null }), ahora)).toBe(30)
    expect(paradaAbierta(P({ fin: null }))).toBe(true)
  })
  it("piso de corte de luz: nunca menos que PISO_LUZ_MIN", () => {
    // tramo real de 20 min, pero pisoMin 180 -> 180
    expect(duracionMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:20:00", pisoMin: PISO_LUZ_MIN }))).toBe(180)
    // tramo real de 4 h -> gana el real
    expect(duracionMin(P({ inicio: "2026-09-09T10:00:00", fin: "2026-09-09T14:00:00", pisoMin: PISO_LUZ_MIN }))).toBe(240)
  })
})

describe("categoría y corte de luz", () => {
  it("esParadaDeLuz por subsistema ELE o por descripción", () => {
    expect(esParadaDeLuz({ subsistemaCodigo: "A3CF-ELE-25", descripcion: "x" })).toBe(true)
    expect(esParadaDeLuz({ subsistemaCodigo: null, descripcion: "Caída de suministro eléctrico" })).toBe(true)
    expect(esParadaDeLuz({ subsistemaCodigo: "A3CF-MOR-14", descripcion: "mordaza floja" })).toBe(false)
  })
  it("resumenPorCategoria reparte por las 3 categorías en orden fijo", () => {
    const set = [
      P({ id: "1", categoria: "OPERACIONAL", inicio: "2026-09-09T08:00:00", fin: "2026-09-09T08:10:00" }),
      P({ id: "2", categoria: "MECANICA", inicio: "2026-09-09T09:00:00", fin: "2026-09-09T09:30:00" }),
      P({ id: "3", categoria: "MECANICA", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:05:00" }),
    ]
    const r = resumenPorCategoria(set)
    expect(r.map((x) => x.categoria)).toEqual(["OPERACIONAL", "EXTERNA", "MECANICA"])
    expect(r[0].minutos).toBe(10)
    expect(r[1].veces).toBe(0)
    expect(r[2].veces).toBe(2)
    expect(r[2].minutos).toBe(35)
  })
})

describe("agrupaciones", () => {
  const set: Parada[] = [
    P({ id: "a", subsistemaCodigo: "X-1", equipoCodigo: "E1", linea: "LINEA_1", inicio: "2026-09-09T08:00:00", fin: "2026-09-09T08:10:00" }),
    P({ id: "b", subsistemaCodigo: "X-1", equipoCodigo: "E1", linea: "LINEA_1", inicio: "2026-09-09T09:00:00", fin: "2026-09-09T09:20:00" }),
    P({ id: "c", subsistemaCodigo: "Y-2", equipoCodigo: "E2", linea: "LINEA_2", inicio: "2026-09-10T09:00:00", fin: "2026-09-10T09:05:00" }),
    P({ id: "d", subsistemaCodigo: null, equipoCodigo: "E2", linea: "LINEA_2", inicio: "2026-09-10T10:00:00", fin: "2026-09-10T10:30:00" }),
  ]

  it("agruparPorCodigo: frecuencia + minutos, ordena por veces", () => {
    const g = agruparPorCodigo(set)
    expect(g[0].clave).toBe("X-1")
    expect(g[0].veces).toBe(2)
    expect(g[0].minutos).toBe(30)
    expect(g.find((x) => x.clave === "—")?.veces).toBe(1) // el sin código
  })
  it("agruparPorEquipo: ordena por minutos desc (E2 = 35, E1 = 30)", () => {
    expect(agruparPorEquipo(set).map((x) => x.clave)).toEqual(["E2", "E1"])
  })
  it("minutosPorLinea", () => {
    const r = minutosPorLinea(set)
    expect(r.find((x) => x.linea === "LINEA_1")?.minutos).toBe(30)
    expect(r.find((x) => x.linea === "LINEA_2")?.minutos).toBe(35)
  })
  it("agruparPorDia: ordena por fecha ascendente", () => {
    const d = agruparPorDia(set)
    expect(d.map((x) => x.dia)).toEqual(["2026-09-09", "2026-09-10"])
    expect(d[0].minutos).toBe(30)
    expect(d[1].veces).toBe(2)
  })
})

describe("fmtDuracion", () => {
  it("min / h / h+min", () => {
    expect(fmtDuracion(45)).toBe("45 min")
    expect(fmtDuracion(60)).toBe("1 h")
    expect(fmtDuracion(95)).toBe("1 h 35 min")
  })
})

describe("fixture de demo", () => {
  const paradas = paradasDemo()
  it("tiene datos y forma consistente", () => {
    expect(paradas.length).toBeGreaterThan(50)
    for (const p of paradas) {
      expect(p.id).toBeTruthy()
      expect(["ASEPTICO", "VACIO"]).toContain(p.area)
      expect(p.linea).toMatch(/^LINEA_[123]$/)
      expect(p.turnoTipo).toMatch(/^TURNO_[123]$/)
      expect(p.inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
      if (p.fin) expect(p.fin >= p.inicio).toBe(true)
    }
  })
  it("incluye algunas paradas en curso (sin fin)", () => {
    expect(paradas.some(paradaAbierta)).toBe(true)
  })
})
