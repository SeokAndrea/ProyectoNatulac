import { describe, expect, it } from "vitest"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import {
  estadoDeLineas,
  formatDuracion,
  paradaMasLargaDe,
  produccionPorLineaDe,
  programacionDelDia,
  textoUltimaActualizacion,
  tiempoRelativo,
} from "./calculosPanel"

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
    expect(estadoDeLineas([corrida({ activa: false, esperandoCierre: true })], [estado("LINEA_1", "DETENIDA", "motor")], LINEAS)[0]).toMatchObject({
      estado: "esperando_cierre",
      observacion: "motor",
    })
    expect(estadoDeLineas([], [estado("LINEA_1", "SIN_PROGRAMACION"), estado("LINEA_2", "LISTA")], LINEAS).map((f) => f.estado)).toEqual([
      "sin_programacion",
      "libre",
    ])
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
