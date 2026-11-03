import { describe, expect, it } from "vitest"
import { agruparFallasNuevas, esParadaNueva, fallaNuevaDeEquipo, mapearFallaNueva, type FallaNuevaPendiente } from "./fallaNueva"
import type { OpcionFalla } from "./paradas"

const opcion = (equipoId: string, falla: { id: string; reservada?: boolean }): OpcionFalla =>
  ({
    equipo: { id: equipoId, nombre: `Equipo ${equipoId}` },
    sistema: { id: `s-${equipoId}` },
    subsistema: { id: `u-${equipoId}` },
    falla: { id: falla.id, reservada: falla.reservada, numero: 1, nombre: "x", codigo: "X" },
  }) as unknown as OpcionFalla

const pendiente = (id: string, origen: string, minutos: number, inicio: string): FallaNuevaPendiente => ({
  paradaId: id,
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  origen,
  tipoNombre: "Falla nueva · Sin clasificar",
  nota: null,
  solucion: null,
  creadaPor: null,
  inicio,
  fin: null,
  minutos,
  terminada: false,
})

describe("fallaNuevaDeEquipo", () => {
  const opciones = [opcion("a", { id: "f1" }), opcion("a", { id: "nueva-a", reservada: true }), opcion("b", { id: "nueva-b", reservada: true })]

  it("devuelve la falla reservada del equipo elegido", () => {
    expect(fallaNuevaDeEquipo(opciones, "a")?.falla.id).toBe("nueva-a")
    expect(fallaNuevaDeEquipo(opciones, "b")?.falla.id).toBe("nueva-b")
  })

  it("sin equipo elegido, o sin reservada en ese equipo, no hay falla nueva", () => {
    expect(fallaNuevaDeEquipo(opciones, "")).toBeNull()
    expect(fallaNuevaDeEquipo([opcion("c", { id: "f9" })], "c")).toBeNull()
  })
})

describe("esParadaNueva", () => {
  it("reconoce los tipos reservados por su código", () => {
    expect(esParadaNueva("PARADA_NUEVA_LNPE")).toBe(true)
    expect(esParadaNueva("CAMBIO_SABOR")).toBe(false)
    expect(esParadaNueva("NUEVA_PARADA")).toBe(false)
  })
})

describe("agruparFallasNuevas", () => {
  it("junta por equipo y pone primero el que más tiempo perdió", () => {
    const grupos = agruparFallasNuevas([
      pendiente("1", "Llenadora", 10, "2026-11-02T10:00:00Z"),
      pendiente("2", "Etiquetadora", 50, "2026-11-02T09:00:00Z"),
      pendiente("3", "Llenadora", 15, "2026-11-02T12:00:00Z"),
    ])
    expect(grupos.map((g) => g.origen)).toEqual(["Etiquetadora", "Llenadora"])
    expect(grupos[1].minutos).toBe(25)
  })

  it("dentro de un equipo, la más reciente primero", () => {
    const [g] = agruparFallasNuevas([pendiente("1", "Llenadora", 10, "2026-11-02T10:00:00Z"), pendiente("2", "Llenadora", 5, "2026-11-02T12:00:00Z")])
    expect(g.items.map((i) => i.paradaId)).toEqual(["2", "1"])
  })

  it("sin paradas no hay grupos", () => {
    expect(agruparFallasNuevas([])).toEqual([])
  })
})

describe("mapearFallaNueva", () => {
  it("pasa la fila del servidor a la forma de la app", () => {
    const f = mapearFallaNueva({
      parada_id: "p1",
      linea_codigo: "LINEA_2",
      linea_nombre: "Línea 2",
      origen: null,
      tipo_nombre: "Parada nueva · LNPE",
      nota: "se fue la luz",
      solucion: null,
      creada_por: "Ana",
      inicio: "2026-11-02T10:00:00Z",
      fin: null,
      minutos: null,
      terminada: false,
    })
    expect(f).toMatchObject({ paradaId: "p1", origen: "—", minutos: 0, creadaPor: "Ana", terminada: false })
  })
})
