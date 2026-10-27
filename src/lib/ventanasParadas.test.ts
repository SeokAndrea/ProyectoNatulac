import { describe, expect, it } from "vitest"
import { desgloseEnTurnos } from "@/lib/paradasTramo"
import { mapearVentanas, ventanasDeParada } from "@/lib/ventanasParadas"

const turnos = mapearVentanas([
  { turno_id: "a", turno_tipo_codigo: "TURNO_1", desde: "2026-10-25T07:00:00", hasta: "2026-10-25T15:10:00" },
  { turno_id: "b", turno_tipo_codigo: "TURNO_2", desde: "2026-10-25T15:10:00", hasta: "2026-10-25T22:30:00" },
  { turno_id: "c", turno_tipo_codigo: "TURNO_3", desde: "2026-10-25T22:30:00", hasta: null },
])
const ahora = new Date("2026-10-25T23:00:00-04:00")

describe("ventanas de turnos para el reporte", () => {
  it("usa las horas reales de cada turno y etiqueta T1, T2, T3", () => {
    expect(turnos.map((t) => t.etiqueta)).toEqual(["T1", "T2", "T3"])
    const p = { inicio: "2026-10-25T14:00:00", fin: "2026-10-25T17:30:00" }
    const vs = ventanasDeParada(p, turnos, ahora)
    expect(vs.map((v) => v.etiqueta)).toEqual(["T1", "T2"])
    expect(desgloseEnTurnos(p, vs, ahora).tramos).toEqual([
      { etiqueta: "T1", min: 70 },
      { etiqueta: "T2", min: 140 },
    ])
  })

  it("una parada abierta llega hasta el turno en curso", () => {
    const vs = ventanasDeParada({ inicio: "2026-10-25T22:00:00", fin: null }, turnos, ahora)
    expect(vs.map((v) => v.etiqueta)).toEqual(["T2", "T3"])
  })
})
