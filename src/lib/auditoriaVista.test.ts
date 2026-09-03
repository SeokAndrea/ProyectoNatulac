import { describe, expect, it } from "vitest"
import { LINEAS_DEMO, PRESENTACIONES_DEMO, TURNOS_DEMO } from "@/lib/auditoriaDemoFixture"
import {
  coincideBusqueda,
  construirHistorial,
  loteDeProductoTerminado,
  rangoDePreset,
  resumenTurno,
  turnoEnFiltro,
} from "@/lib/auditoriaVista"

/** El turno de Deivis con 2 sabores y PT editado (ver auditoriaDemoFixture). */
const deivis = TURNOS_DEMO.find((t) => t.detalle.supervisorNombre === "Deivis Rojas" && t.detalle.preparaciones.length === 2)!
const loteFresa = deivis.detalle.preparaciones.find((p) => p.saborNombre === "Fresa")!.lote!
const loteMango = deivis.detalle.preparaciones.find((p) => p.saborNombre === "Mango")!.lote!

describe("resumenTurno — sabores con sus lotes", () => {
  const r = resumenTurno(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)

  it("agrupa cada sabor con los lotes que se le prepararon / corrieron", () => {
    expect(r.sabores).toEqual([
      { sabor: "Fresa", lotes: [loteFresa] },
      { sabor: "Mango", lotes: [loteMango] },
    ])
  })

  it("mantiene la lista plana de lotes para el buscador", () => {
    expect(r.lotes).toEqual([loteFresa, loteMango])
  })
})

describe("resumenTurno — por línea", () => {
  const r = resumenTurno(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)

  it("una fila por corrida, con presentación, sabor, lote, cajas y merma de envases", () => {
    expect(r.porLinea).toHaveLength(2)
    const l1 = r.porLinea.find((l) => l.linea === "Línea 1")!
    expect(l1.presentacion).toBe("350 ml")
    expect(l1.sabor).toBe("Fresa")
    expect(l1.lote).toBe(loteFresa)
    expect(l1.cajas).toBe(13 * 120 + 40)
    expect(l1.mermaEnvasesPct).toBeGreaterThan(0)
    expect(l1.mermaEnvasesPct).toBeLessThan(15)
  })

  it("cajas totales = suma de las corridas", () => {
    expect(r.cajas).toBe(r.porLinea.reduce((t, l) => t + l.cajas, 0))
    expect(r.cajas).toBe(13 * 120 + 40 + (8 * 120 + 12))
  })
})

describe("resumenTurno — litros y merma de semielaborado", () => {
  const r = resumenTurno(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)

  it("consumidos ≥ producidos y la merma cae en un rango creíble", () => {
    expect(r.litrosConsumidos).toBeGreaterThan(0)
    expect(r.litrosProducidos).toBeGreaterThan(0)
    expect(r.litrosConsumidos).toBeGreaterThanOrEqual(r.litrosProducidos)
    expect(r.mermaSemielaboradoPct).not.toBeNull()
    expect(r.mermaSemielaboradoPct!).toBeGreaterThan(0)
    expect(r.mermaSemielaboradoPct!).toBeLessThan(20)
  })
})

describe("loteDeProductoTerminado", () => {
  it("saca el lote de la corrida que generó la fila (turnoLineaId → LineaEnTurno.lote)", () => {
    const ptFresa = deivis.detalle.productoTerminado.find((p) => p.saborNombre === "Fresa")!
    expect(loteDeProductoTerminado(deivis.detalle, ptFresa)).toBe(loteFresa)
  })
})

describe("construirHistorial — Producto Terminado", () => {
  it("la fila de PT muestra sabor y lote", () => {
    const eventos = construirHistorial(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)
    const filaPt = eventos.find((e) => e.seccion === "Producto Terminado" && e.detalle.includes("Línea 1"))
    expect(filaPt?.detalle).toContain("Fresa")
    expect(filaPt?.detalle).toContain(`Lote ${loteFresa}`)
  })

  it("Comenzar Turno es el primer evento aunque el T3 cruce medianoche", () => {
    const eventos = construirHistorial(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)
    expect(eventos[0].seccion).toBe("Comenzar Turno")
  })
})

describe("coincideBusqueda", () => {
  const chips = resumenTurno(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)
  const eventos = construirHistorial(deivis.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)
  const match = (q: string) => coincideBusqueda(deivis.detalle, chips, eventos, "Producción Aséptico", q)

  it("vacío = pasa siempre", () => expect(match("")).toBe(true))
  it("matchea por supervisor", () => expect(match("deivis")).toBe(true))
  it("matchea por sabor", () => expect(match("mango")).toBe(true))
  it("matchea por lote", () => expect(match(loteMango.toLowerCase())).toBe(true))
  it("no matchea algo que no está", () => expect(match("zzz-no-existe")).toBe(false))
})

describe("rangoDePreset", () => {
  const hoy = new Date("2026-09-03T10:00:00")

  it("HOY = solo hoy", () => {
    expect(rangoDePreset("HOY", "", hoy)).toEqual({ desde: "2026-09-03", hasta: "2026-09-03" })
  })
  it("AYER = solo el día anterior (el corte de las 7:00 ya está en turno.fecha)", () => {
    expect(rangoDePreset("AYER", "", hoy)).toEqual({ desde: "2026-09-02", hasta: "2026-09-02" })
  })
  it("DIAS_7 = hoy y los 6 anteriores", () => {
    expect(rangoDePreset("DIAS_7", "", hoy)).toEqual({ desde: "2026-08-28", hasta: "2026-09-03" })
  })
  it("FECHA = la fecha exacta elegida", () => {
    expect(rangoDePreset("FECHA", "2026-07-15", hoy)).toEqual({ desde: "2026-07-15", hasta: "2026-07-15" })
  })
})

describe("turnoEnFiltro", () => {
  const rango = { desde: "2026-09-01", hasta: "2026-09-03" }

  it("acepta un turno dentro del rango sin filtro de tipo", () => {
    expect(turnoEnFiltro("2026-09-02", "TURNO_3", rango, null)).toBe(true)
  })
  it("rechaza un turno fuera del rango", () => {
    expect(turnoEnFiltro("2026-08-31", "TURNO_1", rango, null)).toBe(false)
  })
  it("con filtro de tipo, solo pasa ese tipo", () => {
    expect(turnoEnFiltro("2026-09-02", "TURNO_1", rango, "TURNO_1")).toBe(true)
    expect(turnoEnFiltro("2026-09-02", "TURNO_3", rango, "TURNO_1")).toBe(false)
  })
})
