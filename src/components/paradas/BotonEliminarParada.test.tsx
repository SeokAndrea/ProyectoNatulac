import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Parada } from "@/lib/paradas"
import { BotonEliminarParada, textoDeEliminar } from "./BotonEliminarParada"

/* Eliminar una parada cargada por error (permiso PARADAS_ELIMINAR, migración 20261114890000): segunda confirmación con lo que se pierde. */

const eliminarParada = vi.fn()

vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  eliminarParada: (...a: unknown[]) => eliminarParada(...a),
}))

const parada = {
  id: "p1",
  clase: "NO_PROGRAMADA",
  origen: "MANUAL",
  lineaCodigo: "LINEA_2",
  tipoNombre: "Falla nueva · Sin clasificar",
  inicio: "2026-11-02T14:05:00",
  fin: "2026-11-02T15:20:00",
} as unknown as Parada

beforeEach(() => {
  eliminarParada.mockReset().mockResolvedValue({ ok: true })
})

describe("textoDeEliminar", () => {
  it("dice qué parada, de qué línea, cuándo y cuánto", () => {
    expect(textoDeEliminar(parada, 75)).toBe("Se elimina la parada «Falla nueva · Sin clasificar» de la Línea 2 (02/11 14:05 → 02/11 15:20, 1 h 15 min). No se puede deshacer; queda en la auditoría.")
  })

  it("una parada en curso lo dice", () => {
    expect(textoDeEliminar({ ...parada, fin: null }, 10)).toContain("→ en curso")
  })
})

describe("BotonEliminarParada", () => {
  it("no elimina hasta la segunda confirmación", async () => {
    const onEliminada = vi.fn()
    render(<BotonEliminarParada parada={parada} usuario="duena" pagina="Reportes de paradas" onEliminada={onEliminada} />)
    await userEvent.click(screen.getByRole("button", { name: /eliminar parada/i }))
    expect(eliminarParada).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }))
    await waitFor(() => expect(onEliminada).toHaveBeenCalled())
    expect(eliminarParada).toHaveBeenCalledWith("duena", "p1", "Reportes de paradas")
  })

  it("«No» vuelve atrás sin eliminar", async () => {
    render(<BotonEliminarParada parada={parada} usuario="duena" pagina="Reportes de paradas" onEliminada={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /eliminar parada/i }))
    await userEvent.click(screen.getByRole("button", { name: "No" }))
    expect(eliminarParada).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /eliminar parada/i })).toBeInTheDocument()
  })

  it("si el servidor no deja (línea detenida, jornada validada, sin permiso), muestra el motivo", async () => {
    eliminarParada.mockResolvedValue({ ok: false, error: "No tienes permiso para eliminar paradas." })
    const onEliminada = vi.fn()
    render(<BotonEliminarParada parada={parada} usuario="otro" pagina="Reportes de paradas" onEliminada={onEliminada} />)
    await userEvent.click(screen.getByRole("button", { name: /eliminar parada/i }))
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }))
    expect(await screen.findByText("No tienes permiso para eliminar paradas.")).toBeInTheDocument()
    expect(onEliminada).not.toHaveBeenCalled()
  })
})
