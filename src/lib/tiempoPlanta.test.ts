import { describe, expect, it } from "vitest"
import { fechaPlanta, horaCortaPlanta, instantePlanta, restarDias } from "./tiempoPlanta"

describe("instantePlanta", () => {
  // Bug real (2026-09-11): Postgres manda `time`/hora pelada CON
  // microsegundos ("15:20:54.528313"), no "HH:MM:SS" limpio. La
  // fixture de /auditoria-demo usa horas limpias ("07:00:00") y nunca
  // lo agarró; con datos reales, todo turno.horaInicio caía a un
  // Invalid Date que reventaba el primer .format() de Auditoría —
  // página en blanco, sin Error Boundary que lo contuviera.
  it("acepta hora pelada con microsegundos (Postgres real)", () => {
    const d = instantePlanta("15:20:54.528313", "2026-09-10")
    expect(Number.isNaN(d.getTime())).toBe(false)
    expect(horaCortaPlanta("15:20:54.528313", "2026-09-10")).toBe("15:20")
  })

  it("sigue aceptando HH:MM:SS sin fracción (fixtures de demo)", () => {
    expect(horaCortaPlanta("07:00:00", "2026-09-10")).toBe("07:00")
  })

  it("sigue aceptando HH:MM sin segundos", () => {
    expect(horaCortaPlanta("07:00", "2026-09-10")).toBe("07:00")
  })

  it("sigue aceptando timestamp ISO completo con offset (columnas timestamptz)", () => {
    const d = instantePlanta("2026-09-10T21:59:24.042812+00:00", "2026-09-10")
    expect(Number.isNaN(d.getTime())).toBe(false)
    expect(horaCortaPlanta("2026-09-10T21:59:24.042812+00:00", "2026-09-10")).toBe("17:59")
  })
})

describe("fechaPlanta / restarDias", () => {
  it("restarDias no cruza el mes mal", () => {
    expect(restarDias("2026-09-01", 1)).toBe("2026-08-31")
  })

  it("fechaPlanta devuelve YYYY-MM-DD", () => {
    expect(fechaPlanta(new Date("2026-09-10T15:20:54.528313-04:00"))).toBe("2026-09-10")
  })
})
