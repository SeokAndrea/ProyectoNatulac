import { describe, expect, it } from "vitest"
import {
  LINEAS_DEMO,
  PRESENTACIONES_DEMO,
  TURNOS_DEMO,
  contador,
  corrida,
  prep,
  pt,
  turnoDemo,
} from "@/lib/auditoriaDemoFixture"
import {
  coincideBusqueda,
  construirHistorial,
  loteDeProductoTerminado,
  rangoDePreset,
  resumenTurno,
  turnoEnFiltro,
} from "@/lib/auditoriaVista"

const BASE = {
  id: "t",
  codigo: "X",
  fecha: "2026-09-02",
  horaInicio: "22:30:00",
  turnoTipo: "TURNO_3" as const,
  grupo: "GRUPO_1" as const,
  supervisorUsuario: "x",
  supervisorNombre: "X",
}

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

// ------------------------------------------------------------
// Guardrails de la merma (plan-rework-auditoria.md §7)
// ------------------------------------------------------------
describe("guardrails — merma de semielaborado", () => {
  it("los turnos sanos del fixture NO disparan el flag de parcial ni dan % negativo", () => {
    for (const t of TURNOS_DEMO) {
      const r = resumenTurno(t.detalle, LINEAS_DEMO, PRESENTACIONES_DEMO)
      expect(r.mermaSemielaboradoParcial, `turno ${t.detalle.codigo}`).toBe(false)
      if (r.mermaSemielaboradoPct !== null) {
        expect(r.mermaSemielaboradoPct, `turno ${t.detalle.codigo}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("un lote con fin ≥ inicio queda fuera del % (parcial), sin dar negativo", () => {
    // Lote que produjo pero cuyo volumen final quedó por encima del inicial
    // (transferencia entrante / re-medición al alza).
    const turno = turnoDemo({
      ...BASE,
      preparaciones: [
        prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Fresa", lote: "0001", volumenInicialL: 6000, volumenLInicio: 6000, volumenL: 200 }),
        prep({ id: "L2", numeroTanque: 2, creadoEn: "23:00:00", saborNombre: "Mango", lote: "0002", volumenInicialL: 6000, volumenLInicio: 6000, volumenL: 9000 }),
      ],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Fresa", lote: "0001", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "c2", linea: "LINEA_2", activadaEn: "23:10:00", saborNombre: "Mango", lote: "0002", loteId: "L2", presentacion: "1000" }),
      ],
      contadores: [
        contador({ id: "co1", linea: "LINEA_1", creadoEn: "02:00:00", turnoLineaId: "c1", envasesLlenadora: 5800 }),
        contador({ id: "co2", linea: "LINEA_2", creadoEn: "02:10:00", turnoLineaId: "c2", envasesLlenadora: 5200 }),
      ],
      productoTerminado: [
        pt({ id: "p1", linea: "LINEA_1", creadoEn: "02:05:00", turnoLineaId: "c1", saborNombre: "Fresa", presentacion: "1000", paletas: 9, cajasSueltas: 0, litrosProducidos: 5400 }),
        pt({ id: "p2", linea: "LINEA_2", creadoEn: "02:15:00", turnoLineaId: "c2", saborNombre: "Mango", presentacion: "1000", paletas: 8, cajasSueltas: 0, litrosProducidos: 4800 }),
      ],
    })
    const r = resumenTurno(turno, LINEAS_DEMO, PRESENTACIONES_DEMO)
    // L1 medible (6000 → 200), L2 no (6000 → 9000): su PT queda sin contrastar
    expect(r.mermaSemielaboradoParcial).toBe(true)
    expect(r.litrosSinContraste).toBe(4800)
    expect(r.mermaSemielaboradoPct).not.toBeNull()
    expect(r.mermaSemielaboradoPct!).toBeGreaterThanOrEqual(0)
  })

  it("un lote cuyo PT excede su volumen preparado (margen de redondeo) queda fuera del %", () => {
    const turno = turnoDemo({
      ...BASE,
      preparaciones: [
        prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Pera", lote: "0004", volumenInicialL: 10000, volumenLInicio: 10000, volumenL: 100 }),
      ],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "c1b", linea: "LINEA_1", activadaEn: "01:00:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
      ],
      contadores: [
        contador({ id: "co1", linea: "LINEA_1", creadoEn: "00:30:00", turnoLineaId: "c1", envasesLlenadora: 10000 }),
        contador({ id: "co1b", linea: "LINEA_1", creadoEn: "05:00:00", turnoLineaId: "c1b", envasesLlenadora: 10000 }),
      ],
      productoTerminado: [
        pt({ id: "p1", linea: "LINEA_1", creadoEn: "00:35:00", turnoLineaId: "c1", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 0, litrosProducidos: 9720 }),
        pt({ id: "p1b", linea: "LINEA_1", creadoEn: "05:05:00", turnoLineaId: "c1b", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 0, litrosProducidos: 9720 }),
      ],
    })
    const r = resumenTurno(turno, LINEAS_DEMO, PRESENTACIONES_DEMO)
    // Σ PT del lote = 19.440 > 10.000 × 1,05 → no medible → todo sin contrastar
    expect(r.mermaSemielaboradoParcial).toBe(true)
    expect(r.mermaSemielaboradoPct).toBeNull()
  })
})

describe("guardrails — porLinea", () => {
  it("agrupa por línea + lote + presentación; corridas idénticas se cuentan una vez y se marcan", () => {
    const turno = turnoDemo({
      ...BASE,
      preparaciones: [prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Pera", lote: "0004", volumenInicialL: 20000, volumenLInicio: 20000, volumenL: 200 })],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "c2", linea: "LINEA_1", activadaEn: "01:00:00", saborNombre: "Pera", lote: "0004", loteId: "L1", presentacion: "1000" }),
      ],
      contadores: [
        contador({ id: "co1", linea: "LINEA_1", creadoEn: "00:30:00", turnoLineaId: "c1", envasesLlenadora: 10300 }),
        contador({ id: "co2", linea: "LINEA_1", creadoEn: "05:00:00", turnoLineaId: "c2", envasesLlenadora: 10300 }),
      ],
      productoTerminado: [
        pt({ id: "p1", linea: "LINEA_1", creadoEn: "00:35:00", turnoLineaId: "c1", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 5, litrosProducidos: 6120 }),
        pt({ id: "p2", linea: "LINEA_1", creadoEn: "05:05:00", turnoLineaId: "c2", saborNombre: "Pera", presentacion: "1000", paletas: 10, cajasSueltas: 5, litrosProducidos: 6120 }),
      ],
    })
    const r = resumenTurno(turno, LINEAS_DEMO, PRESENTACIONES_DEMO)
    expect(r.porLinea).toHaveLength(1)
    expect(r.porLinea[0].cajas).toBe(10 * 48 + 5) // NO duplicado
    expect(r.porLinea[0].posibleDuplicado).toBe(true)
  })

  it("una corrida activada sin producción va a corridasSinProduccion, no a porLinea", () => {
    const turno = turnoDemo({
      ...BASE,
      preparaciones: [prep({ id: "L1", numeroTanque: 1, creadoEn: "22:35:00", saborNombre: "Pera", lote: "0003", volumenInicialL: 10000, volumenLInicio: 10000, volumenL: 4000 })],
      lineas: [
        corrida({ id: "c1", linea: "LINEA_1", activadaEn: "23:05:00", saborNombre: "Pera", lote: "0003", loteId: "L1", presentacion: "1000" }),
        corrida({ id: "cstub", linea: "LINEA_2", activadaEn: "23:40:00", saborNombre: "Pera", lote: "0003", loteId: "L1", presentacion: "250" }),
      ],
      contadores: [contador({ id: "co1", linea: "LINEA_1", creadoEn: "02:00:00", turnoLineaId: "c1", envasesLlenadora: 6300 })],
      productoTerminado: [pt({ id: "p1", linea: "LINEA_1", creadoEn: "02:05:00", turnoLineaId: "c1", saborNombre: "Pera", presentacion: "1000", paletas: 6, cajasSueltas: 0, litrosProducidos: 3600 })],
    })
    const r = resumenTurno(turno, LINEAS_DEMO, PRESENTACIONES_DEMO)
    expect(r.porLinea.map((l) => l.linea)).toEqual(["Línea 1"])
    expect(r.corridasSinProduccion).toEqual(["Línea 2 · Lote 0003"])
  })
})
