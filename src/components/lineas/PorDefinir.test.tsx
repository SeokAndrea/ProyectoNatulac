import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PorDefinir } from "@/components/lineas/PorDefinir"
import type { Parada } from "@/lib/paradas"

const definirResponsableParada = vi.fn()
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  definirResponsableParada: (...a: unknown[]) => definirResponsableParada(...a),
}))

const parada = {
  id: "p1",
  responsable: "POR_DEFINIR",
  inicio: "2026-11-13T08:00:00",
  fin: null,
  tipoNombre: "Falla de Nivel del BTD",
  nota: "Se botó el nivel",
} as unknown as Parada

function pintar(esMantenimiento: boolean) {
  const onListo = vi.fn(async () => {})
  render(<PorDefinir parada={parada} usuario="u" esMantenimiento={esMantenimiento} pagina="Líneas" onListo={onListo} />)
  return onListo
}

describe("PorDefinir", () => {
  beforeEach(() => {
    definirResponsableParada.mockReset()
    definirResponsableParada.mockResolvedValue({ ok: true })
  })

  it("el supervisor solo puede marcarla Operacional", async () => {
    const onListo = pintar(false)
    expect(screen.queryByRole("button", { name: /es de mantenimiento/i })).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: /es operacional/i }))
    await waitFor(() => expect(definirResponsableParada).toHaveBeenCalledWith("u", "p1", "OPERACIONAL", "Líneas"))
    expect(onListo).toHaveBeenCalled()
  })

  it("Mantenimiento la toma", async () => {
    pintar(true)
    await userEvent.click(screen.getByRole("button", { name: /es de mantenimiento/i }))
    await waitFor(() => expect(definirResponsableParada).toHaveBeenCalledWith("u", "p1", "MANTENIMIENTO", "Líneas"))
  })

  it("muestra el error del servidor y no recarga", async () => {
    definirResponsableParada.mockResolvedValue({ ok: false, error: "Esta parada ya la tomó Mantenimiento." })
    const onListo = pintar(false)
    await userEvent.click(screen.getByRole("button", { name: /es operacional/i }))
    expect(await screen.findByText(/ya la tomó Mantenimiento/)).toBeTruthy()
    expect(onListo).not.toHaveBeenCalled()
  })
})
