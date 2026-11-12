import { describe, expect, it } from "vitest"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import {
  aplicarParadasEnVivo,
  estadoDeLineas,
  estadoDeUnaLinea,
  filasDeLineas,
  formatDuracion,
  minutosParadosEntre,
  paradaMasLargaDe,
  produccionPorLineaDe,
  productoConPrecargaRobot,
  programacionDelDia,
  textoUltimaActualizacion,
  totalesParadaPorLinea,
  tiempoRelativo,
} from "./calculosPanel"
import type { PrecargaRobot } from "@/lib/robotTavil"

const LINEAS = [
  { id: "1", codigo: "LINEA_1", nombre: "Línea 1", activo: true },
  { id: "2", codigo: "LINEA_2", nombre: "Línea 2", activo: true },
] as LineaLive[]
const PRES = [{ codigo: "1000", cajasXPaleta: 100 }] as unknown as PresentacionLive[]

const corrida = (over: Partial<Corrida>): Corrida =>
  ({ id: "c", linea: "LINEA_1", activa: true, pausadaEn: null, esperandoCierre: false, ...over }) as Corrida
const estado = (linea: string, condicion: LineaEstado["condicion"], observacion: string | null = null) =>
  ({ linea, condicion, observacion }) as LineaEstado
const pt = (linea: string, sabor: string, paletas: number, sueltas: number, litros: number) =>
  ({ linea, saborNombre: sabor, presentacion: "1000", paletas, cajasSueltas: sueltas, litrosProducidos: litros }) as ProductoTerminadoRegistro

describe("productoConPrecargaRobot", () => {
  const presRobot = [{ codigo: "1000", cajasXPaleta: 85, litrosXCaja: 12 }] as unknown as PresentacionLive[]
  const precarga = (corridaId: string, paletas: number, resto: number | null): PrecargaRobot => ({
    corridaId,
    paletas,
    ultimaPaletaEn: "2026-11-12T15:00:00Z",
    ultimaPaletaPor: "Op",
    resto,
    restoEn: null,
    restoPor: null,
  })
  const corridas = [
    corrida({ id: "c1", linea: "LINEA_1", presentacion: "1000", saborNombre: "Manzana" }),
    corrida({ id: "c2", linea: "LINEA_2", presentacion: "1000", saborNombre: "Pera" }),
  ]

  it("sin PT confirmado cuenta lo del robot (paletas × cajas + Resto, y sus litros)", () => {
    const r = productoConPrecargaRobot([], [precarga("c1", 3, 10)], corridas, presRobot)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ linea: "LINEA_1", corridaId: "c1", paletas: 3, cajasSueltas: 10, litrosProducidos: (3 * 85 + 10) * 12 })
    expect(produccionPorLineaDe(r, LINEAS, presRobot)[0]).toMatchObject({ cajas: 265, litros: 3180 })
  })

  it("con PT confirmado manda el PT de esa corrida; las demás siguen con el robot", () => {
    const oficial = { ...pt("LINEA_1", "Manzana", 2, 0, 2040), corridaId: "c1" }
    const r = productoConPrecargaRobot([oficial], [precarga("c1", 3, 10), precarga("c2", 1, null)], corridas, presRobot)
    expect(r.map((p) => `${p.corridaId} ${p.paletas}`)).toEqual(["c1 2", "c2 1"])
  })

  it("sin precarga (robot apagado) queda el PT de siempre; una precarga en cero no suma", () => {
    const oficial = [pt("LINEA_1", "Manzana", 2, 0, 2040)]
    expect(productoConPrecargaRobot(oficial, [], corridas, presRobot)).toBe(oficial)
    expect(productoConPrecargaRobot(oficial, [precarga("c2", 0, null)], corridas, presRobot)).toBe(oficial)
  })
})

describe("formatDuracion / tiempos relativos", () => {
  it("minutos y horas", () => {
    expect(formatDuracion(45)).toBe("45 min")
    expect(formatDuracion(60)).toBe("1h")
    expect(formatDuracion(125)).toBe("2h 5min")
  })
  it("hace s / min / h", () => {
    const ahora = new Date("2026-10-05T10:00:00")
    expect(tiempoRelativo("2026-10-05T09:59:30", ahora)).toBe("hace 30s")
    expect(tiempoRelativo("2026-10-05T09:15:00", ahora)).toBe("hace 45 min")
    expect(tiempoRelativo("2026-10-05T07:00:00", ahora)).toBe("hace 3 h")
    expect(textoUltimaActualizacion(null, ahora)).toBeNull()
    expect(textoUltimaActualizacion(new Date("2026-10-05T09:00:00"), ahora)).toBe("hace 60 min")
  })
})

describe("estadoDeLineas", () => {
  it("corriendo, en pausa, en CIP con el lote en pausa, esperando cierre y la condición sin corrida", () => {
    const filas = estadoDeLineas(
      [corrida({ id: "a" }), corrida({ id: "b", linea: "LINEA_2", pausadaEn: "x" })],
      [estado("LINEA_2", "CIP", "36 h")],
      LINEAS,
    )
    expect(filas.map((f) => [f.estado, f.observacion])).toEqual([
      ["activa", null],
      ["cip", "36 h"],
    ])
    expect(estadoDeLineas([corrida({ pausadaEn: "x" })], [], LINEAS)[0].estado).toBe("parada")
    expect(estadoDeLineas([], [estado("LINEA_1", "SIN_PROGRAMACION"), estado("LINEA_2", "LISTA")], LINEAS).map((f) => f.estado)).toEqual([
      "sin_programacion",
      "libre",
    ])
  })

  it("«Esperando PT» ya no es un estado: la corrida que espera su PT deja la línea Libre (dueña, 2026-11-05)", () => {
    expect(estadoDeLineas([corrida({ activa: false, esperandoCierre: true })], [estado("LINEA_1", "DETENIDA", "motor")], LINEAS)[0]).toMatchObject({
      estado: "libre",
      corrida: null,
      observacion: null,
    })
    // DETENIDA (la que deja Entregar PT) o sin registro: Libre. Con CIP, sigue en CIP.
    expect(estadoDeLineas([], [estado("LINEA_1", "DETENIDA")], LINEAS).map((f) => f.estado)).toEqual(["libre", "libre"])
    expect(estadoDeLineas([corrida({ activa: false, esperandoCierre: true })], [estado("LINEA_1", "CIP", "36 h")], LINEAS)[0]).toMatchObject({
      estado: "cip",
      observacion: "36 h",
    })
  })
})

describe("aplicarParadasEnVivo: las paradas abiertas, igual en todas las pantallas", () => {
  const ahora = new Date("2026-11-05T10:00:00")
  const abierta = (over: Partial<Parada>): Parada =>
    ({ id: "p", lineaCodigo: "LINEA_1", inicio: "2026-11-05T09:00:00", fin: null, pendiente: false, tipoNombre: "Falla", nota: null, origen: "MANUAL", ...over }) as Parada

  it("con corrida manda la base: pausada = Parada al instante, aunque no hayan pasado 15 min", () => {
    const [l] = aplicarParadasEnVivo(estadoDeLineas([corrida({ pausadaEn: "2026-11-05T09:58:00" })], [], LINEAS), [], ahora)
    expect(l.estado).toBe("parada")
    expect(l.paradaEnVivo?.visible).toBe(false)
  })

  it("con corrida en marcha, una parada abierta solo avisa: la pausa la pone la base", () => {
    const [l] = aplicarParadasEnVivo(estadoDeLineas([corrida({})], [], LINEAS), [abierta({})], ahora)
    expect(l.estado).toBe("activa")
    expect(l.paradaEnVivo?.visible).toBe(true)
  })

  it("sin corrida, la parada abierta la deja Detenida por parada; antes del margen sigue Libre", () => {
    const [l1, l2] = aplicarParadasEnVivo(
      estadoDeLineas([], [estado("LINEA_1", "LISTA"), estado("LINEA_2", "DETENIDA")], LINEAS),
      [abierta({}), abierta({ id: "q", lineaCodigo: "LINEA_2", inicio: "2026-11-05T09:55:00" })],
      ahora,
    )
    expect(l1.estado).toBe("detenida_por_parada")
    expect(l2.estado).toBe("libre")
  })

  it("en CIP no cambia", () => {
    const [l] = aplicarParadasEnVivo(estadoDeLineas([], [estado("LINEA_1", "CIP")], LINEAS), [abierta({})], ahora)
    expect(l.estado).toBe("cip")
  })

  it("estadoDeUnaLinea (tarjeta y Modo Paradas) da lo mismo que los paneles", () => {
    const casos: [Corrida[], LineaEstado[], Parada[]][] = [
      [[corrida({})], [], []],
      [[corrida({ pausadaEn: "2026-11-05T09:58:00" })], [], []],
      [[corrida({ pausadaEn: "2026-11-05T09:00:00" })], [estado("LINEA_1", "CIP")], []],
      [[corrida({ activa: false, esperandoCierre: true })], [estado("LINEA_1", "DETENIDA")], []],
      [[], [estado("LINEA_1", "LISTA")], [abierta({})]],
      [[], [estado("LINEA_1", "CAMBIO_PRESENTACION")], []],
      [[], [estado("LINEA_1", "SIN_PROGRAMACION")], []],
      [[], [], []],
    ]
    for (const [corridas, estados, abiertas] of casos) {
      const panel = aplicarParadasEnVivo(estadoDeLineas(corridas, estados, LINEAS), abiertas, ahora)[0]
      const tarjeta = estadoDeUnaLinea({ codigo: "LINEA_1", nombre: "Línea 1" }, corridas.filter((c) => c.activa), estados[0], abiertas, ahora)
      expect(tarjeta.estado).toBe(panel.estado)
    }
  })
})

describe("producción y programación", () => {
  it("cajas = paletas × cajas por paleta + sueltas, por línea", () => {
    expect(produccionPorLineaDe([pt("LINEA_1", "Fresa", 9, 50, 11400), pt("LINEA_1", "Fresa", 1, 0, 1200)], LINEAS, PRES)).toEqual([
      { linea: "LINEA_1", cajas: 1050, litros: 12600 },
      { linea: "LINEA_2", cajas: 0, litros: 0 },
    ])
  })

  const PLAN = [
    { saborId: "s1", saborNombre: "Fresa", presentacionId: "p", presentacionMl: 1000, cajasPlan: 2000 },
    { saborId: "s2", saborNombre: "Naranja", presentacionId: "p", presentacionMl: 1000, cajasPlan: 500 },
  ]

  it("cruza el plan con lo hecho del turno; lo no planificado va al final, de mayor a menor", () => {
    const items = programacionDelDia(PLAN, [], false, [pt("LINEA_1", "Fresa", 9, 50, 0), pt("LINEA_2", "Mango", 1, 0, 0), pt("LINEA_2", "Uva", 3, 0, 0)], PRES)
    expect(items).toEqual([
      { sabor: "Fresa", presentacionMl: 1000, hecho: 950, plan: 2000 },
      { sabor: "Naranja", presentacionMl: 1000, hecho: 0, plan: 500 },
      { sabor: "Uva", presentacionMl: 1000, hecho: 300, plan: null },
      { sabor: "Mango", presentacionMl: 1000, hecho: 100, plan: null },
    ])
  })

  it("en vivo usa el acumulado de la jornada", () => {
    const items = programacionDelDia(PLAN, [{ saborNombre: "Fresa", presentacionMl: 1000, cajas: 1500, litros: 0 }], true, [pt("LINEA_1", "Fresa", 9, 50, 0)], PRES)
    expect(items[0].hecho).toBe(1500)
  })
})

describe("paradaMasLargaDe", () => {
  it("la más larga, contando las abiertas hasta ahora", () => {
    const ahora = new Date("2026-10-05T10:00:00")
    const p = (id: string, inicio: string, fin: string | null) => ({ id, inicio, fin }) as Parada
    expect(paradaMasLargaDe([], ahora)).toBeNull()
    expect(paradaMasLargaDe([p("a", "2026-10-05T08:00:00", "2026-10-05T08:30:00"), p("b", "2026-10-05T09:15:00", null)], ahora)?.id).toBe("b")
  })
})

describe("totalesParadaPorLinea", () => {
  const par = (over: Partial<Parada>): Parada =>
    ({ id: "p", lineaCodigo: "LINEA_1", clase: "NO_PROGRAMADA", inicio: "2026-10-26T14:00:00", fin: "2026-10-26T16:30:00", ...over }) as Parada
  const AHORA = new Date("2026-10-26T17:00:00")

  it("la parada que empezó en un turno anterior: el total aparece solo en esa línea", () => {
    // El turno ve el tramo (14:00 a 16:30 = 150); la parada completa empezó a las 13:00 (210).
    const delTurno = [par({ id: "a" }), par({ id: "b", lineaCodigo: "LINEA_2" })]
    const completas = new Map([
      ["a", par({ id: "a", inicio: "2026-10-26T13:00:00" })],
      ["b", par({ id: "b", lineaCodigo: "LINEA_2" })],
    ])
    const r = totalesParadaPorLinea(delTurno, completas, AHORA)
    expect(r.get("LINEA_1")).toBe(210)
    expect(r.has("LINEA_2")).toBe(false)
  })

  it("sin paradas que vengan de antes, no hay totales", () => {
    const delTurno = [par({ id: "a" })]
    expect(totalesParadaPorLinea(delTurno, new Map([["a", par({ id: "a" })]]), AHORA).size).toBe(0)
    expect(totalesParadaPorLinea(delTurno, new Map(), AHORA).size).toBe(0)
  })
})

describe("TP: tiempo de producción del turno", () => {
  const par = (inicio: string, fin: string | null, over: Partial<Parada> = {}) =>
    ({ id: inicio, lineaCodigo: "LINEA_1", clase: "NO_PROGRAMADA", inicio, fin, pendiente: false, ...over }) as Parada
  const ms = (s: string) => new Date(s).getTime()

  it("minutosParadosEntre suma cada parada completa (aunque se solapen) y recorta al lapso", () => {
    const p = [par("2026-10-28T08:00:00", "2026-10-28T09:00:00"), par("2026-10-28T08:30:00", "2026-10-28T09:30:00"), par("2026-10-28T06:00:00", "2026-10-28T07:30:00")]
    // 07:00–07:30 (recortada) + 08:00–09:00 + 08:30–09:30 (se solapan, las dos cuentan) = 30 + 60 + 60
    expect(minutosParadosEntre(p, ms("2026-10-28T07:00:00"), ms("2026-10-28T12:00:00"))).toBe(150)
    expect(minutosParadosEntre([par("2026-10-28T10:00:00", "2026-10-28T10:00:00", { pendiente: true })], ms("2026-10-28T07:00:00"), ms("2026-10-28T12:00:00"))).toBe(0)
  })

  it("cuenta desde el inicio del turno (no desde un arranque de otro turno) y resta las paradas", () => {
    // Corrida heredada que arrancó a las 03:00; el turno cuenta desde las 07:00; ahora 12:00; paró 08:00–10:00.
    const lineas = estadoDeLineas([corrida({ activadaEn: "2026-10-28T03:00:00" })], [estado("LINEA_1", "LISTA")], LINEAS)
    const filas = filasDeLineas({
      lineasEstado: lineas, produccionPorLinea: [], corridas: [], contadores: [], productoTerminado: [], presentaciones: PRES, eficiencia: null,
      minutosParadaPorLinea: new Map(), paradasTurno: [par("2026-10-28T08:00:00", "2026-10-28T10:00:00")],
      desdeTurno: new Date("2026-10-28T07:00:00"), ahora: new Date("2026-10-28T12:00:00"),
    })
    // 5 h del turno − 2 h paradas = 3 h
    expect(filas.find((f) => f.codigo === "LINEA_1")?.minutosProduccion).toBe(180)
  })
})
