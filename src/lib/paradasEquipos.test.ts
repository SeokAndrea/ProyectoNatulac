import { describe, expect, it } from "vitest"
import { tiposDeLinea, type EquipoParada } from "@/lib/paradasEquipos"
import type { LineaDeTipo } from "@/lib/paradas"

interface T {
  nombre: string
  equipoCodigo?: string | null
  lineas?: LineaDeTipo[]
}

const equipos = [
  { codigo: "CAP_APPLICATOR", nombre: "Cap Applicator", activo: true, lineas: [{ area: "ASEPTICO", linea: "LINEA_1" }, { area: "ASEPTICO", linea: "LINEA_3" }] },
  { codigo: "HELIX", nombre: "Helix", activo: true, lineas: ["LINEA_1", "LINEA_2", "LINEA_3"].map((linea) => ({ area: "ASEPTICO", linea })) },
] as EquipoParada[]

const paletas: T = { nombre: "Falta de Paletas Vacías", lineas: [{ area: "ASEPTICO", linea: "LINEA_2", secuencia: 2 }] }
const operador: T = { nombre: "Falta de operador", lineas: [{ area: "ASEPTICO", linea: "LINEA_1", secuencia: 8 }] }
const feriado: T = { nombre: "Feriado" }
const tapa: T = { nombre: "Tapa Despegada", equipoCodigo: "CAP_APPLICATOR" }
const helix: T = { nombre: "Atasco de la Cadena", equipoCodigo: "HELIX" }
const todos: T[] = [paletas, operador, feriado, tapa, helix]
const nombres = (xs: T[]) => xs.map((x) => x.nombre)

describe("tiposDeLinea", () => {
  it("Línea 1 de Aséptico: sin Paletas Vacías, con Falta de operador y Cap", () => {
    expect(nombres(tiposDeLinea(todos, equipos, "ASEPTICO", "LINEA_1"))).toEqual(["Falta de operador", "Feriado", "Tapa Despegada", "Atasco de la Cadena"])
  })
  it("Línea 2 de Aséptico: con Paletas Vacías, sin Falta de operador ni Cap", () => {
    expect(nombres(tiposDeLinea(todos, equipos, "ASEPTICO", "LINEA_2"))).toEqual(["Falta de Paletas Vacías", "Feriado", "Atasco de la Cadena"])
  })
  it("Vacío no se ve afectado por las filas de Aséptico", () => {
    expect(nombres(tiposDeLinea([paletas, operador, feriado], equipos, "VACIO", "LINEA_2"))).toEqual(["Falta de Paletas Vacías", "Falta de operador", "Feriado"])
  })
  it("el Área de Pruebas ve todo", () => {
    expect(tiposDeLinea(todos, equipos, "PRUEBAS", "LINEA_T2")).toHaveLength(5)
  })
})

describe("por presentación (Cap, Film Wrapper y Straw en la Línea 3)", () => {
  const eq = [
    { codigo: "CAP_APPLICATOR", nombre: "Cap Applicator", activo: true, lineas: [{ area: "ASEPTICO", linea: "LINEA_3", presentaciones: [330] }] },
    { codigo: "FILM_WRAPPER", nombre: "Film Wrapper", activo: true, lineas: [{ area: "ASEPTICO", linea: "LINEA_3", presentaciones: [200, 250] }] },
    { codigo: "HELIX", nombre: "Helix", activo: true, lineas: [{ area: "ASEPTICO", linea: "LINEA_3" }] },
  ] as EquipoParada[]
  const cap: T = { nombre: "Tapa Despegada", equipoCodigo: "CAP_APPLICATOR" }
  const fw: T = { nombre: "Caida de Treepack", equipoCodigo: "FILM_WRAPPER" }
  const hx: T = { nombre: "Atasco de la Cadena", equipoCodigo: "HELIX" }
  const enfardadora: T = { nombre: "Falla enfardadora", lineas: [{ area: "ASEPTICO", linea: "LINEA_2", secuencia: 10, presentaciones: [200] }] }
  const baja: T = {
    nombre: "Baja Capacidad",
    lineas: [
      { area: "ASEPTICO", linea: "LINEA_1", secuencia: 10 },
      { area: "ASEPTICO", linea: "LINEA_2", secuencia: 10, presentaciones: [250] },
    ],
  }

  it("Línea 3 con 330: Cap y Helix, sin Film Wrapper", () => {
    expect(nombres(tiposDeLinea([cap, fw, hx], eq, "ASEPTICO", "LINEA_3", 330))).toEqual(["Tapa Despegada", "Atasco de la Cadena"])
  })
  it("Línea 3 con 200 o 250: Film Wrapper y Helix, sin Cap", () => {
    expect(nombres(tiposDeLinea([cap, fw, hx], eq, "ASEPTICO", "LINEA_3", 200))).toEqual(["Caida de Treepack", "Atasco de la Cadena"])
    expect(nombres(tiposDeLinea([cap, fw, hx], eq, "ASEPTICO", "LINEA_3", 250))).toEqual(["Caida de Treepack", "Atasco de la Cadena"])
  })
  it("sin corrida activa (presentación desconocida) se ofrece todo lo de la línea", () => {
    expect(nombres(tiposDeLinea([cap, fw, hx], eq, "ASEPTICO", "LINEA_3", null))).toHaveLength(3)
  })
  it("Línea 2: «Falla enfardadora» solo con 200 y «Baja Capacidad» solo con 250", () => {
    expect(nombres(tiposDeLinea([enfardadora, baja], eq, "ASEPTICO", "LINEA_2", 200))).toEqual(["Falla enfardadora"])
    expect(nombres(tiposDeLinea([enfardadora, baja], eq, "ASEPTICO", "LINEA_2", 250))).toEqual(["Baja Capacidad"])
  })
  it("Línea 1: Baja Capacidad con cualquier presentación", () => {
    expect(nombres(tiposDeLinea([baja], eq, "ASEPTICO", "LINEA_1", 500))).toEqual(["Baja Capacidad"])
  })
})
