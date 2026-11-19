import { describe, expect, it } from "vitest"
import { diasEntre, esLineaNoProgramada, inicioCuentaTurno, turnosACargar } from "./paradasTurnoCompleto"
import { horaEnVentana } from "./cubrirTurno"

it("el T2 nocturno empieza a las 19:00 aunque se abra para el relevo antes", () => {
  expect(inicioCuentaTurno("TURNO_2", "2026-11-18", "2026-11-18T18:45:00", "12x12"))
    .toEqual(new Date("2026-11-18T19:00:00"))
})

it("las horas manuales se anclan al turno elegido, incluso al cruzar medianoche", () => {
  const desde = new Date("2026-11-18T22:30:00").getTime()
  const hasta = new Date("2026-11-19T07:00:00").getTime()
  expect(horaEnVentana("23:45", desde, hasta)).toBe("2026-11-18T23:45:00")
  expect(horaEnVentana("00:15", desde, hasta)).toBe("2026-11-19T00:15:00")
  expect(horaEnVentana("15:00", desde, hasta)).toBeNull()
})

describe("turno completo de Línea No Programada", () => {
  it("solo los tipos LNPE", () => {
    expect(esLineaNoProgramada({ prefijoPlanilla: "LNPE" })).toBe(true)
    expect(esLineaNoProgramada({ prefijoPlanilla: "OP" })).toBe(false)
    expect(esLineaNoProgramada(null)).toBe(false)
  })

  it("los días de un rango, inclusive; al revés, ninguno", () => {
    expect(diasEntre("2026-10-12", "2026-10-13")).toEqual(["2026-10-12", "2026-10-13"])
    expect(diasEntre("2026-10-13", "2026-10-12")).toEqual([])
  })

  it("dos días con los 3 turnos: el T3 termina al día siguiente a las 07:00", () => {
    const t = turnosACargar("2026-10-12", "2026-10-13", ["TURNO_1", "TURNO_2", "TURNO_3"], "2026-10-14T10:00")
    expect(t).toHaveLength(6)
    expect(t[0]).toMatchObject({ inicio: "2026-10-12T07:00", fin: "2026-10-12T15:00", empezo: true, enCurso: false })
    expect(t[2]).toMatchObject({ inicio: "2026-10-12T22:30", fin: "2026-10-13T07:00" })
    expect(t.every((x) => x.empezo && !x.enCurso)).toBe(true)
  })

  it("el turno de ahora entra (en curso); el que no empezó, no", () => {
    const t = turnosACargar("2026-10-14", "2026-10-14", ["TURNO_1", "TURNO_2", "TURNO_3"], "2026-10-14T16:00")
    expect(t.map((x) => [x.empezo, x.enCurso])).toEqual([[true, false], [true, true], [false, false]])
  })
})
