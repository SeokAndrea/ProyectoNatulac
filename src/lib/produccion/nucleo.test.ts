import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))

import { continuarLinea } from "./nucleo"

describe("continuarLinea (una sola continuar_linea, con p_minutos opcional)", () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it("con minutos manda p_minutos", async () => {
    const r = await continuarLinea("sup", "t1", "c1", null, 20)
    expect(r.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith("continuar_linea", {
      p_usuario: "sup",
      p_turno_id: "t1",
      p_turno_linea_id: "c1",
      p_justificacion: null,
      p_minutos: 20,
    })
  })

  it("sin minutos no manda p_minutos (termina con la hora de ahora)", async () => {
    await continuarLinea("sup", "t1", "c1", "Se buscó en el almacén")
    const args = rpc.mock.calls[0][1] as Record<string, unknown>
    expect(args).not.toHaveProperty("p_minutos")
    expect(args.p_justificacion).toBe("Se buscó en el almacén")
  })

  it("el error del servidor llega tal cual (p. ej. una parada que termina Mantenimiento)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Esta parada la termina Mantenimiento: la línea sigue sola cuando la terminen." } })
    const r = await continuarLinea("sup", "t1", "c1", null, 10)
    expect(r).toEqual({ ok: false, error: "Esta parada la termina Mantenimiento: la línea sigue sola cuando la terminen." })
  })
})
