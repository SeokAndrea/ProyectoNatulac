import { describe, expect, it } from "vitest"
import { cruzaTurnoCerrado, desgloseEnTurnos, tramoEnTurno, type VentanaTurno } from "@/lib/paradasTramo"

const d = (s: string) => `2026-10-26T${s}:00`
const ahora = new Date("2026-10-27T20:00:00")

const T1: VentanaTurno = { id: "t1", etiqueta: "T1", desde: d("06:00"), hasta: d("14:00") }
const T2: VentanaTurno = { id: "t2", etiqueta: "T2", desde: d("14:00"), hasta: d("22:00") }

describe("Tramos de una parada por turno", () => {
  it("una parada que cruza el cierre da a cada turno solo sus minutos", () => {
    const p = { inicio: d("13:00"), fin: d("16:30") }
    expect(tramoEnTurno(p, T1, ahora)).toBe(60)
    expect(tramoEnTurno(p, T2, ahora)).toBe(150)
    expect(desgloseEnTurnos(p, [T1, T2], ahora)).toEqual({
      total: 210,
      tramos: [
        { etiqueta: "T1", min: 60 },
        { etiqueta: "T2", min: 150 },
      ],
    })
  })

  it("cruce de medianoche entre T3 y T1 del día siguiente", () => {
    const T3: VentanaTurno = { id: "t3", etiqueta: "T3", desde: d("22:00"), hasta: "2026-10-27T06:00:00" }
    const T1s: VentanaTurno = { id: "t1s", etiqueta: "T1", desde: "2026-10-27T06:00:00", hasta: "2026-10-27T14:00:00" }
    const a = { inicio: d("23:30"), fin: "2026-10-27T00:45:00" }
    expect(tramoEnTurno(a, T3, ahora)).toBe(75)
    expect(tramoEnTurno(a, T1s, ahora)).toBe(0)
    const b = { inicio: "2026-10-27T05:30:00", fin: "2026-10-27T06:20:00" }
    expect(tramoEnTurno(b, T3, ahora)).toBe(30)
    expect(tramoEnTurno(b, T1s, ahora)).toBe(20)
  })

  it("12x12: una parada de tres turnos no pierde minutos", () => {
    const v: VentanaTurno[] = [
      { id: "a", etiqueta: "A", desde: d("06:00"), hasta: d("18:00") },
      { id: "b", etiqueta: "B", desde: d("18:00"), hasta: "2026-10-27T06:00:00" },
      { id: "c", etiqueta: "C", desde: "2026-10-27T06:00:00", hasta: "2026-10-27T18:00:00" },
    ]
    const p = { inicio: d("10:00"), fin: "2026-10-27T10:00:00" }
    const r = desgloseEnTurnos(p, v, ahora)
    expect(r.total).toBe(24 * 60)
    expect(r.tramos.map((t) => t.min)).toEqual([480, 720, 240])
    expect(r.tramos.reduce((a, t) => a + t.min, 0)).toBe(r.total)
  })

  it("los tramos suman el total aunque haya segundos sueltos", () => {
    const p = { inicio: "2026-10-26T13:00:20", fin: "2026-10-26T14:00:50" }
    const r = desgloseEnTurnos(p, [T1, T2], ahora)
    expect(r.tramos.reduce((a, t) => a + t.min, 0)).toBe(r.total)
  })

  it("parada abierta: cuenta hasta ahora dentro de la ventana y hasta el cierre fuera", () => {
    const p = { inicio: d("13:00"), fin: null }
    expect(tramoEnTurno(p, T1, new Date(d("13:40")))).toBe(40)
    expect(tramoEnTurno(p, T1, new Date(d("17:00")))).toBe(60)
    expect(tramoEnTurno(p, T2, new Date(d("17:00")))).toBe(180)
  })

  it("parada fuera de la ventana: 0 y no aparece en el desglose", () => {
    const p = { inicio: d("07:00"), fin: d("08:00") }
    expect(tramoEnTurno(p, T2, ahora)).toBe(0)
    expect(desgloseEnTurnos(p, [T1, T2], ahora).tramos).toEqual([{ etiqueta: "T1", min: 60 }])
  })
})

describe("Parada que cruza un turno cerrado", () => {
  const cerrado = { ...T1, cerrado: true }
  const abierto = { ...T2, cerrado: false }
  it("empezó en turno cerrado y sigue abierta", () => {
    expect(cruzaTurnoCerrado({ inicio: d("13:00") }, [cerrado, abierto])).toBe(true)
  })
  it("empezó en el turno abierto", () => {
    expect(cruzaTurnoCerrado({ inicio: d("15:00") }, [cerrado, abierto])).toBe(false)
  })
})
