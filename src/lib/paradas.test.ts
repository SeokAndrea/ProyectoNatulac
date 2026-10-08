import { describe, expect, it } from "vitest"
import {
  agruparPorDia,
  CATALOGO_PROGRAMADA,
  CATALOGO_TIPOS,
  codigoPlanilla,
  desvioMin,
  duracionMin,
  fmtDesvio,
  fmtDuracion,
  minutosPorClaseSinSolape,
  minutosPorLinea,
  tipoACompletar,
  paradaAbierta,
  porTipo,
  porTipoPorFrecuencia,
  porTipoYLinea,
  porTipoYLineaPorFrecuencia,
  primeraDeCadaLinea,
  registraSupervisor,
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
  justificacionDesvio: null,
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
    expect(fmtDesvio(-90)).toBe("-1 h 30 min")
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

describe("minutosPorClaseSinSolape", () => {
  const np = (inicio: string, fin: string | null, over: Partial<Parada> = {}) =>
    P({ clase: "NO_PROGRAMADA", inicio: `2026-09-09T${inicio}:00`, fin: fin ? `2026-09-09T${fin}:00` : null, ...over })

  it("la misma falla cargada dos veces (supervisor y Mantenimiento) cuenta una vez", () => {
    const r = minutosPorClaseSinSolape([np("10:00", "11:00"), np("10:30", "11:30", { origen: "MANTENIMIENTO" })])
    expect(r.NO_PROGRAMADA).toBe(90)
  })
  it("una parada dentro de otra no suma nada", () => {
    expect(minutosPorClaseSinSolape([np("10:00", "12:00"), np("10:30", "11:00")]).NO_PROGRAMADA).toBe(120)
  })
  it("sin solape, suma todo", () => {
    expect(minutosPorClaseSinSolape([np("10:00", "10:30"), np("11:00", "11:15")]).NO_PROGRAMADA).toBe(45)
  })
  it("el tramo compartido se lo queda la que empezó primero", () => {
    const r = minutosPorClaseSinSolape([np("10:00", "11:00", { clase: "PROGRAMADA" }), np("10:30", "11:30")])
    expect(r).toEqual({ PROGRAMADA: 60, NO_PROGRAMADA: 30, OCIOSO: 0 })
  })
  it("abierta cuenta hasta ahora; desdeMs recorta el comienzo", () => {
    const ahora = new Date("2026-09-09T12:00:00")
    expect(minutosPorClaseSinSolape([np("11:00", null)], ahora).NO_PROGRAMADA).toBe(60)
    const desde = new Date("2026-09-09T11:30:00").getTime()
    expect(minutosPorClaseSinSolape([np("11:00", null)], ahora, desde).NO_PROGRAMADA).toBe(30)
  })
  it("minutosPorLinea tampoco cuenta dos veces el solape", () => {
    const r = minutosPorLinea([np("10:00", "11:00"), np("10:30", "11:30", { origen: "MANTENIMIENTO" })])
    expect(r[0]).toMatchObject({ linea: "LINEA_1", veces: 2, minutos: 90 })
  })
})

describe("porTipoPorFrecuencia", () => {
  it("ordena por veces, no por minutos", () => {
    const set = [
      P({ tipoCodigo: "A", tipoNombre: "A", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T11:00:00" }), // 60 min, 1 vez
      P({ tipoCodigo: "B", tipoNombre: "B", inicio: "2026-09-09T12:00:00", fin: "2026-09-09T12:05:00" }), // 5 min
      P({ tipoCodigo: "B", tipoNombre: "B", inicio: "2026-09-09T13:00:00", fin: "2026-09-09T13:05:00" }), // 5 min, total 2 veces
    ]
    const g = porTipoPorFrecuencia(set)
    expect(g.map((x) => x.codigo)).toEqual(["B", "A"])
    expect(g[0].veces).toBe(2)
  })
})

describe("porTipoYLinea", () => {
  it("mismo tipo en 2 líneas queda como 2 filas separadas, cada una con su lineaCodigo", () => {
    const set = [
      P({ tipoCodigo: "CAMBIO_SABOR", tipoNombre: "Cambio de Sabor", lineaCodigo: "LINEA_1", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T10:20:00" }),
      P({ tipoCodigo: "CAMBIO_SABOR", tipoNombre: "Cambio de Sabor", lineaCodigo: "LINEA_2", inicio: "2026-09-09T11:00:00", fin: "2026-09-09T11:20:00" }),
    ]
    const g = porTipoYLinea(set)
    expect(g).toHaveLength(2)
    expect(g.map((x) => x.lineaCodigo).sort()).toEqual(["LINEA_1", "LINEA_2"])
  })
  it("porTipoYLineaPorFrecuencia ordena por veces", () => {
    const set = [
      P({ id: "a", tipoCodigo: "A", tipoNombre: "A", lineaCodigo: "LINEA_1", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T11:00:00" }),
      P({ id: "b", tipoCodigo: "B", tipoNombre: "B", lineaCodigo: "LINEA_2", inicio: "2026-09-09T12:00:00", fin: "2026-09-09T12:05:00" }),
      P({ id: "c", tipoCodigo: "B", tipoNombre: "B", lineaCodigo: "LINEA_2", inicio: "2026-09-09T13:00:00", fin: "2026-09-09T13:05:00" }),
    ]
    const g = porTipoYLineaPorFrecuencia(set)
    expect(g[0]).toMatchObject({ nombre: "B", lineaCodigo: "LINEA_2", veces: 2 })
  })
})

describe("primeraDeCadaLinea", () => {
  it("una fila por línea (la primera del ranking), en el orden del ranking", () => {
    const set = [
      P({ id: "a", tipoCodigo: "A", tipoNombre: "A", lineaCodigo: "LINEA_1", inicio: "2026-09-09T10:00:00", fin: "2026-09-09T11:00:00" }), // L1 60
      P({ id: "b", tipoCodigo: "B", tipoNombre: "B", lineaCodigo: "LINEA_1", inicio: "2026-09-09T12:00:00", fin: "2026-09-09T12:40:00" }), // L1 40
      P({ id: "c", tipoCodigo: "C", tipoNombre: "C", lineaCodigo: "LINEA_3", inicio: "2026-09-09T13:00:00", fin: "2026-09-09T13:50:00" }), // L3 50
      P({ id: "d", tipoCodigo: "D", tipoNombre: "D", lineaCodigo: "LINEA_2", inicio: "2026-09-09T14:00:00", fin: "2026-09-09T14:10:00" }), // L2 10
    ]
    const g = primeraDeCadaLinea(porTipoYLinea(set))
    expect(g.map((x) => [x.lineaCodigo, x.nombre])).toEqual([
      ["LINEA_1", "A"],
      ["LINEA_3", "C"],
      ["LINEA_2", "D"],
    ])
  })
  it("línea sin paradas no aparece", () => {
    const g = primeraDeCadaLinea(porTipoYLinea([P({ lineaCodigo: "LINEA_2" })]))
    expect(g.map((x) => x.lineaCodigo)).toEqual(["LINEA_2"])
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
  it("tiene los 11 tipos del dueño, con código de planilla en Línea 1", () => {
    expect(CATALOGO_PROGRAMADA).toHaveLength(11)
    expect(CATALOGO_PROGRAMADA.every((t) => t.clase === "PROGRAMADA")).toBe(true)
    expect(codigoPlanilla(CATALOGO_PROGRAMADA.find((t) => t.codigo === "TRANSFERENCIA_ENERGIA")!, "LINEA_1")).toBe("PPEL1")
    expect(CATALOGO_PROGRAMADA.find((t) => t.codigo === "ARRANQUE_PRODUCCION")?.tiempoGuiaMin).toBe(180)
  })
})

describe("catálogo completo (CATALOGO_TIPOS)", () => {
  it("tiene las 8 familias, solo NO_PROGRAMADA cargada a mano fuera de Programada", () => {
    expect(CATALOGO_TIPOS.length).toBe(46)
    const noProgramada = CATALOGO_TIPOS.filter((t) => t.clase !== "PROGRAMADA")
    expect(noProgramada).toHaveLength(35)
    expect(noProgramada.every((t) => t.clase === "NO_PROGRAMADA")).toBe(true)
  })

  it("el código de planilla cambia solo el número de línea, no el nombre/guía", () => {
    const faltaVapor = CATALOGO_TIPOS.find((t) => t.codigo === "FALTA_VAPOR")!
    expect(codigoPlanilla(faltaVapor, "LINEA_1")).toBe("SCL1-1")
    expect(codigoPlanilla(faltaVapor, "LINEA_2")).toBe("SCL2-1")
    expect(codigoPlanilla(faltaVapor, "LINEA_3")).toBe("SCL3-1")

    const feriado = CATALOGO_TIPOS.find((t) => t.codigo === "FERIADO")!
    expect(codigoPlanilla(feriado, "LINEA_2")).toBe("LNPEL2-5")
  })
})

describe("codigoPlanilla sin número de línea", () => {
  const base = { nombre: "x", clase: "NO_PROGRAMADA" as const, familia: "EQUIPO" as const, tiempoGuiaMin: null }
  it("con línea: prefijo + L# + secuencia (Helix)", () => {
    expect(codigoPlanilla({ ...base, codigo: "H", prefijoPlanilla: "AH", secuenciaPlanilla: 3 }, "LINEA_1")).toBe("AHL1-3")
    expect(codigoPlanilla({ ...base, codigo: "H", prefijoPlanilla: "AH", secuenciaPlanilla: 3 }, "LINEA_3")).toBe("AHL3-3")
  })
  it("sin línea: igual en todas (A3 Flex, Cap)", () => {
    const a3 = { ...base, codigo: "A", prefijoPlanilla: "A3F", secuenciaPlanilla: 1, codigoConLinea: false }
    expect(codigoPlanilla(a3, "LINEA_1")).toBe("A3F-1")
    expect(codigoPlanilla({ ...a3, prefijoPlanilla: "CAP" }, "LINEA_3")).toBe("CAP-1")
  })
  it("forma general: prefijo + L# sin secuencia", () => {
    expect(codigoPlanilla({ ...base, codigo: "G", prefijoPlanilla: "CAP", secuenciaPlanilla: null }, "LINEA_1")).toBe("CAPL1")
  })
})

describe("codigoPlanilla con secuencia por línea (Operacional)", () => {
  const insumos = {
    codigo: "INSUMOS_NO_CONFORME",
    nombre: "Insumos (Prueba Industrial)",
    clase: "NO_PROGRAMADA" as const,
    familia: "OPERACIONAL" as const,
    tiempoGuiaMin: null,
    prefijoPlanilla: "OP",
    secuenciaPlanilla: 2,
    lineas: [
      { area: "ASEPTICO", linea: "LINEA_1", secuencia: 2 },
      { area: "ASEPTICO", linea: "LINEA_2", secuencia: 3 },
      { area: "ASEPTICO", linea: "LINEA_3", secuencia: 2 },
    ],
  }
  it("la Línea 2 numera distinto a la 1 y a la 3", () => {
    expect(codigoPlanilla(insumos, "LINEA_1", "ASEPTICO")).toBe("OPL1-2")
    expect(codigoPlanilla(insumos, "LINEA_2", "ASEPTICO")).toBe("OPL2-3")
    expect(codigoPlanilla(insumos, "LINEA_3", "ASEPTICO")).toBe("OPL3-2")
  })
  it("otra área no toma la secuencia de Aséptico", () => {
    expect(codigoPlanilla(insumos, "LINEA_2", "MANTENIMIENTO")).toBe("OPL2-2")
  })
})

describe("quién registra qué (supervisor / Mantenimiento)", () => {
  const familia = (f: (typeof CATALOGO_TIPOS)[number]["familia"]) => ({ familia: f })
  it("el supervisor registra Programadas, Línea no programada (LNPE) y Operacionales", () => {
    expect(registraSupervisor(familia("PROGRAMADA"))).toBe(true)
    expect(registraSupervisor(familia("EXTERNA"))).toBe(true)
    expect(registraSupervisor(familia("OPERACIONAL"))).toBe(true)
  })
  it("todo lo demás de No programada es de Mantenimiento", () => {
    for (const f of ["SUMINISTRO", "EQUIPO_PROCESO", "CODIFICACION", "EQUIPO"] as const) {
      expect(registraSupervisor(familia(f))).toBe(false)
    }
  })
  it("cada tipo del catálogo inicial es de uno u otro, nunca de ambos", () => {
    const delSupervisor = CATALOGO_TIPOS.filter((t) => registraSupervisor(t))
    const suyas = (t: { clase: string; familia: string }) => t.clase === "PROGRAMADA" || t.familia === "EXTERNA" || t.familia === "OPERACIONAL"
    expect(delSupervisor.every(suyas)).toBe(true)
    expect(delSupervisor.length).toBe(CATALOGO_TIPOS.filter(suyas).length)
  })
})

describe("parada pendiente (+1 sin minutos, migración 20261090)", () => {
  it("tipoACompletar: Falla sin especificar pide una falla de equipo; Parada por clasificar, cualquier tipo; el resto nada", () => {
    expect(tipoACompletar("FALLA_SIN_ESPECIFICAR")).toBe("EQUIPO")
    expect(tipoACompletar("POR_CLASIFICAR")).toBe("TODOS")
    expect(tipoACompletar("CAMBIO_LOTE")).toBeNull()
    expect(tipoACompletar(null)).toBeNull()
  })

  it("se guarda con inicio = fin: cuenta 1 vez y 0 min, y no queda 'en curso'", () => {
    const pendiente = {
      id: "p1",
      clase: "PROGRAMADA" as const,
      origen: "MANUAL" as const,
      lineaCodigo: "LINEA_1",
      turnoTipo: "TURNO_1",
      tipoCodigo: "CAMBIO_LOTE",
      tipoNombre: "Cambio de Lote",
      tiempoGuiaMin: 10,
      nota: null,
      justificacionDesvio: null,
      inicio: "2026-09-30T08:10:00",
      fin: "2026-09-30T08:10:00",
      supervisorNombre: null,
      pendiente: true,
    }
    const ahora = new Date("2026-09-30T12:00:00")
    expect(duracionMin(pendiente, ahora)).toBe(0)
    const programada = resumenPorClase([pendiente], ahora).find((r) => r.clase === "PROGRAMADA")!
    expect(programada.veces).toBe(1)
    expect(programada.minutos).toBe(0)
  })
})
