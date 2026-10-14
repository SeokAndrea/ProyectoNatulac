import { describe, expect, it } from "vitest"
import { diasEntre, esLineaNoProgramada, turnosACargar } from "./paradasTurnoCompleto"

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
    expect(t[0]).toMatchObject({ inicio: "2026-10-12T07:00", fin: "2026-10-12T15:00", termino: true })
    expect(t[2]).toMatchObject({ inicio: "2026-10-12T22:30", fin: "2026-10-13T07:00" })
    expect(t.every((x) => x.termino)).toBe(true)
  })

  it("el turno que todavía no termina no se puede cargar", () => {
    const t = turnosACargar("2026-10-14", "2026-10-14", ["TURNO_1", "TURNO_2"], "2026-10-14T15:00")
    expect(t.map((x) => x.termino)).toEqual([true, false])
  })
})
