import { describe, expect, it } from "vitest"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { TurnoHistorial } from "@/lib/historialTurnos"
import type { Parada } from "@/lib/paradas"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import {
  consumoLote,
  diferenciaLote,
  etiquetarTurnos,
  filasCajas,
  filasEnvases,
  filasLotes,
  filasParadas,
  mermaEnvases,
  mermaLote,
  rendimientoLote,
  revisada,
  totalLotes,
  type Validacion,
} from "./validarJornada"

const PRES = [{ codigo: "1000", volumenMl: 1000, cajasXPaleta: 100, envasesXCaja: 12 }] as unknown as PresentacionLive[]

const lote = (over: Partial<PreparacionRegistro>): PreparacionRegistro =>
  ({
    id: "L1",
    turnoId: "t1",
    numeroTanque: 1,
    saborId: "s1",
    saborNombre: "Pera",
    lote: "0412",
    volumenActualL: 0,
    volumenPreparadoL: 20000,
    volumenAlIniciarTurnoL: 20000,
    tambores: 10,
    agua: null,
    azucar: null,
    acidoCitrico: null,
    creadoEn: "2026-10-11T07:10:00",
    liberadoEn: "2026-10-11T07:30:00",
    cerradoEn: null,
    paraVacio: false,
    ...over,
  }) as PreparacionRegistro

const corrida = (over: Partial<Corrida>): Corrida =>
  ({ id: "c1", linea: "LINEA_1", presentacion: "1000", saborNombre: "Pera", lote: "0412", loteId: "L1", activa: false, ...over }) as Corrida

const pt = (corridaId: string, litros: number, paletas = 0, cajas = 0): ProductoTerminadoRegistro =>
  ({ id: `pt-${corridaId}`, corridaId, linea: "LINEA_1", presentacion: "1000", paletas, cajasSueltas: cajas, litrosProducidos: litros }) as ProductoTerminadoRegistro

const turno = (over: Partial<TurnoHistorial>): TurnoHistorial =>
  ({
    id: "t1",
    turnoTipo: "TURNO_1",
    horaInicio: "07:00:00",
    estado: "CERRADO",
    corridas: [],
    contadores: [],
    productoTerminado: [],
    preparaciones: [],
    transferencias: [],
    desvases: [],
    salidasVacio: [],
    ...over,
  }) as TurnoHistorial

const confirmado: Validacion = { estado: "CONFIRMADO", valor: null, nota: null, validadoPorNombre: null }
const corregido = (valor: number): Validacion => ({ estado: "EDITADO", valor, nota: null, validadoPorNombre: null })

describe("etiquetarTurnos", () => {
  it("T1/T2/T3, y con hora si un tipo se repite", () => {
    const r = etiquetarTurnos([
      turno({ id: "a", turnoTipo: "TURNO_1" }),
      turno({ id: "b", turnoTipo: "TURNO_2", horaInicio: "15:00:00" }),
      turno({ id: "c", turnoTipo: "TURNO_2", horaInicio: "19:00:00" }),
    ])
    expect(r.map((t) => t.etiqueta)).toEqual(["T1", "T2 15:00", "T2 19:00"])
  })
})

describe("filasLotes — semielaborado del día", () => {
  // Lote cerrado: 20.000 preparados, 1.000 pasaron al lote siguiente, 18.800 envasados en el día.
  const totales = { preparadoL: 20000, entrantesL: 0, salientesL: 1000, envasadoL: 18800, cerrado: true }

  it("suma los turnos: preparado y envasado por línea; rendimiento = envasado / preparado", () => {
    const t1 = turno({
      id: "t1",
      preparaciones: [lote({ totales })],
      corridas: [corrida({ id: "c1" })],
      productoTerminado: [pt("c1", 10900)],
    })
    const t2 = turno({
      id: "t2",
      turnoTipo: "TURNO_2",
      preparaciones: [lote({ totales })],
      corridas: [corrida({ id: "c2", linea: "LINEA_2" })],
      productoTerminado: [{ ...pt("c2", 7900), linea: "LINEA_2" }],
    })
    const [f] = filasLotes(etiquetarTurnos([t1, t2]), PRES, new Map())
    expect(f.tambores).toBe(10)
    expect(f.pt).toBe(18800)
    expect(f.consumo).toBeCloseTo(19000, 6)
    expect(f.ptPorLinea).toEqual({ LINEA_1: 10900, LINEA_2: 7900 })
    expect(rendimientoLote(f)).toBe(98.95)
    expect(mermaLote(f)).toBe(1.05)
    expect(diferenciaLote(f)).toBeCloseTo(200, 6)
  })

  it("el volumen vivo del tanque no cambia nada, y no hay final que corregir", () => {
    const t1 = turno({ preparaciones: [lote({ volumenActualL: 5000, totales })], corridas: [corrida({})], productoTerminado: [pt("c1", 18800)] })
    const [f] = filasLotes(etiquetarTurnos([t1]), PRES, new Map([["L1", corregido(800)]]))
    expect(consumoLote(f)).toBe(19000)
    expect(mermaLote(f)).toBe(1.05)
  })

  it("lote abierto: sale en curso, sin rendimiento ni merma", () => {
    const t1 = turno({ preparaciones: [lote({ totales: { ...totales, cerrado: false } })], corridas: [corrida({})], productoTerminado: [pt("c1", 9000)] })
    const [f] = filasLotes(etiquetarTurnos([t1]), PRES, new Map())
    expect(f.sinContraste).toBe("EN_CURSO")
    expect(rendimientoLote(f)).toBeNull()
    expect(mermaLote(f)).toBeNull()
  })

  it("los tambores cuentan el día en que se preparó el lote", () => {
    const deAyer = turno({ id: "t9", preparaciones: [lote({ turnoId: "t-ayer", totales })], corridas: [corrida({})], productoTerminado: [pt("c1", 18800)] })
    const [f] = filasLotes(etiquetarTurnos([deAyer]), PRES, new Map())
    expect(f.tambores).toBe(0)
  })

  it("la fila de totales suma solo los lotes que entran", () => {
    const t1 = turno({
      preparaciones: [lote({ totales }), lote({ id: "L2", lote: "0413", totales: { ...totales, cerrado: false } })],
      corridas: [corrida({}), corrida({ id: "c2", loteId: "L2", lote: "0413" })],
      productoTerminado: [pt("c1", 18800), pt("c2", 5000)],
    })
    const total = totalLotes(filasLotes(etiquetarTurnos([t1]), PRES, new Map()))
    expect(total.tambores).toBe(20)
    expect(total.pt).toBe(18800)
    expect(mermaLote(total)).toBe(1.05)
  })

  it("los lotes de Vacío no aparecen", () => {
    const t1 = turno({ preparaciones: [lote({ paraVacio: true })] })
    expect(filasLotes(etiquetarTurnos([t1]), PRES, new Map())).toEqual([])
  })
})

describe("filasEnvases", () => {
  it("contador, envases del PT y merma con el contador corregido", () => {
    const t1 = turno({
      corridas: [corrida({})],
      contadores: [{ corridaId: "c1", envasesLlenadora: 12500, envasesBuenos: 12100, justificacion: "" } as ContadorRegistro],
      productoTerminado: [pt("c1", 12000, 10, 0)],
    })
    const [f] = filasEnvases(etiquetarTurnos([t1]), PRES, new Map())
    expect(f).toMatchObject({ contador: 12500, buenos: 12100, envasesPt: 12000 })
    expect(mermaEnvases(f)).toBe(4)
    expect(mermaEnvases({ ...f, validacion: corregido(12100) })).toBe(0.83)
  })

  it("una corrida sin contador ni PT no aparece", () => {
    expect(filasEnvases(etiquetarTurnos([turno({ corridas: [corrida({})] })]), PRES, new Map())).toEqual([])
  })
})

describe("filasParadas", () => {
  const parada = (over: Partial<Parada>): Parada =>
    ({
      id: "p",
      origen: "MANUAL",
      responsable: "OPERACIONAL",
      lineaCodigo: "LINEA_1",
      turnoTipo: "TURNO_2",
      tipoNombre: "Por clasificar",
      clase: "NO_PROGRAMADA",
      inicio: "2026-10-11T16:45:00",
      fin: "2026-10-11T18:15:00",
      ...over,
    }) as Parada

  it("cada parada sale con sus minutos y su turno, se pise o no con otra", () => {
    const filas = filasParadas(
      [
        parada({ id: "sup" }),
        parada({ id: "mtto", origen: "MANUAL", responsable: "MANTENIMIENTO", tipoNombre: "Llenadora", inicio: "2026-10-11T16:40:00", fin: "2026-10-11T18:15:00" }),
      ],
      new Map(),
    )
    const por = (id: string) => filas.find((f) => f.id === id)!
    expect(por("sup")).toMatchObject({ minutos: 90, cuando: "T2 16:45" })
    expect(por("mtto")).toMatchObject({ minutos: 95, cuando: "T2 16:40" })
  })

  it("la columna de Mantenimiento sale del responsable, no del origen", () => {
    const filas = filasParadas(
      [parada({ id: "a", origen: "SHEET", responsable: "OPERACIONAL" }), parada({ id: "b", lineaCodigo: "LINEA_3", responsable: "MANTENIMIENTO" })],
      new Map(),
    )
    expect(filas.find((f) => f.id === "a")!.deMantenimiento).toBe(false)
    expect(filas.find((f) => f.id === "b")!.deMantenimiento).toBe(true)
  })

  it("la columna Responsable sale del campo, con el nombre completo", () => {
    const filas = filasParadas([parada({ id: "a" }), parada({ id: "b", lineaCodigo: "LINEA_3", responsable: "MANTENIMIENTO" })], new Map())
    expect(filas.map((f) => [f.id, f.responsable])).toEqual([
      ["a", "Operacional"],
      ["b", "Mantenimiento"],
    ])
  })

  it("marca «abierta» la que sigue sin terminar, sea de qué turno sea", () => {
    const filas = filasParadas(
      [parada({ id: "sinfin", fin: null }), parada({ id: "cerrada" }), parada({ id: "recortada", lineaCodigo: "LINEA_2" })],
      new Map(),
      new Date("2026-10-11T19:00:00"),
      new Set(["recortada"]),
    )
    const por = (id: string) => filas.find((f) => f.id === id)!
    expect(por("sinfin").abierta).toBe(true)
    expect(por("cerrada").abierta).toBe(false)
    // En un turno ya cerrado el servidor le pone fin al tramo, pero la parada sigue abierta en el siguiente.
    expect(por("recortada").abierta).toBe(true)
  })

  it("marca las de más de 4 horas", () => {
    const [f] = filasParadas([parada({ inicio: "2026-10-11T02:00:00", fin: "2026-10-11T07:40:00" })], new Map())
    expect(f.larga).toBe(true)
  })
})

describe("filasCajas y revisada", () => {
  it("una fila por turno + sabor + presentación, en orden de turno; completa cuando todas tienen validación", () => {
    const turnos = etiquetarTurnos([turno({ id: "t1" }), turno({ id: "t2", turnoTipo: "TURNO_2" })])
    const filas = filasCajas({
      turnos,
      cajas: [
        { turnoId: "t2", saborNombre: "Pera", volumenMl: 1000, cajas: 900 },
        { turnoId: "t1", saborNombre: "Pera", volumenMl: 1000, cajas: 1000 },
      ],
      validacionesCajas: [{ turnoId: "t1", saborNombre: "Pera", volumenMl: 1000, estado: "EDITADO", cajas: 995, nota: null, validadoPorNombre: null }],
    })
    expect(filas.map((f) => [f.turno, f.cajas, f.validacion?.valor ?? null])).toEqual([
      ["T1", 1000, 995],
      ["T2", 900, null],
    ])
    expect(revisada(filas)).toBe(false)
    expect(revisada(filas.map((f) => ({ ...f, validacion: confirmado })))).toBe(true)
  })
})
