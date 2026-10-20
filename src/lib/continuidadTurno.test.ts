import { describe, expect, it } from "vitest"
import { continuidadReciente } from "./continuidadTurno"

// Caso real: A20261019_T3G1, abierto por el sistema a las 22:30 a nombre de Fernando.
const base = {
  estado: "ABIERTO" as const,
  codigo: "A20261019_T3G1",
  fecha: "2026-10-19",
  horaInicio: "22:30:00.111498",
  aperturaAutomatica: true,
  sinResponsable: false,
  supervisorUsuario: "frodriguez",
  responsables: [
    { usuario: "frodriguez", nombre: "Fernando Rodriguez", motivo: "INICIO" as const, desde: "2026-10-20T02:30:00.111498+00:00", hasta: null },
  ],
}
const a = (hora: string) => new Date(`2026-10-19T${hora}-04:00`)

describe("continuidadReciente", () => {
  it("avisa al supervisor en las primeras 2 h", () => {
    expect(continuidadReciente(base, "frodriguez", a("22:35:10"))).toEqual({ codigo: "A20261019_T3G1", hora: "22:30" })
  })

  it("después de 2 h ya no", () => {
    expect(continuidadReciente(base, "frodriguez", new Date("2026-10-20T00:31:00-04:00"))).toBeNull()
  })

  it("solo al supervisor del turno", () => {
    expect(continuidadReciente(base, "gchacon", a("22:35"))).toBeNull()
  })

  it("no si lo abrió el supervisor o lo asumió sin responsable", () => {
    expect(continuidadReciente({ ...base, aperturaAutomatica: false }, "frodriguez", a("22:35"))).toBeNull()
    expect(
      continuidadReciente({ ...base, responsables: [{ ...base.responsables[0], motivo: "ASUMIR" as const }] }, "frodriguez", a("22:35")),
    ).toBeNull()
  })
})
