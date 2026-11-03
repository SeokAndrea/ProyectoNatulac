import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BotonQuitar, textoDeQuitar } from "./BotonQuitar"

/* «Quitar» del catálogo (migración 20261114890000): solo lo que nunca se usó, con segunda confirmación. */

const usoCatalogo = vi.fn()
const quitarCatalogo = vi.fn()

vi.mock("@/lib/catalogoFallas/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogoFallas/api")>()),
  usoCatalogo: (...a: unknown[]) => usoCatalogo(...a),
  quitarCatalogo: (...a: unknown[]) => quitarCatalogo(...a),
}))

const sinUso = { nombre: "Cámara mal escrita", reservada: false, fallas: 2, paradas: 0, sif: 0 }

beforeEach(() => {
  usoCatalogo.mockReset()
  quitarCatalogo.mockReset().mockResolvedValue({ ok: true, valor: undefined })
})

describe("textoDeQuitar", () => {
  it("dice qué se va, con sus fallas", () => {
    expect(textoDeQuitar("SUBSISTEMA", sinUso)).toBe("Se quita el subsistema «Cámara mal escrita» y sus 2 fallas. Nunca se usó. No se puede deshacer; queda en la auditoría.")
    expect(textoDeQuitar("SUBSISTEMA", { ...sinUso, fallas: 1 })).toContain("y sus 1 falla.")
    expect(textoDeQuitar("SUBSISTEMA", { ...sinUso, fallas: 0 })).toContain("(no tiene fallas)")
  })

  it("una falla no habla de fallas dentro", () => {
    expect(textoDeQuitar("FALLA", { nombre: "Baja presiónn", fallas: 1 })).toBe("Se quita la falla «Baja presiónn». Nunca se usó. No se puede deshacer; queda en la auditoría.")
  })
})

describe("BotonQuitar", () => {
  it("pide una segunda confirmación y recién entonces quita", async () => {
    usoCatalogo.mockResolvedValue({ ok: true, valor: sinUso })
    const onQuitado = vi.fn()
    render(<BotonQuitar nivel="SUBSISTEMA" id="u1" usuario="duena" onQuitado={onQuitado} />)
    await userEvent.click(await screen.findByRole("button", { name: /quitar/i }))
    expect(quitarCatalogo).not.toHaveBeenCalled()
    expect(screen.getByText(/Se quita el subsistema «Cámara mal escrita» y sus 2 fallas/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }))
    await waitFor(() => expect(onQuitado).toHaveBeenCalled())
    expect(quitarCatalogo).toHaveBeenCalledWith("duena", "SUBSISTEMA", "u1")
  })

  it("«No» vuelve atrás sin quitar nada", async () => {
    usoCatalogo.mockResolvedValue({ ok: true, valor: sinUso })
    render(<BotonQuitar nivel="SUBSISTEMA" id="u1" usuario="duena" onQuitado={vi.fn()} />)
    await userEvent.click(await screen.findByRole("button", { name: /quitar/i }))
    await userEvent.click(screen.getByRole("button", { name: "No" }))
    expect(quitarCatalogo).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /quitar/i })).toBeInTheDocument()
  })

  it("si ya se usó, no ofrece quitar: dice que solo se desactiva", async () => {
    usoCatalogo.mockResolvedValue({ ok: true, valor: { ...sinUso, paradas: 3, sif: 1 } })
    render(<BotonQuitar nivel="SUBSISTEMA" id="u1" usuario="duena" onQuitado={vi.fn()} />)
    expect(await screen.findByText(/Ya se usó \(3 paradas, 1 solicitud de intervención\): no se puede quitar, solo desactivar/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /quitar/i })).toBeNull()
  })

  it("lo reservado no muestra nada", async () => {
    usoCatalogo.mockResolvedValue({ ok: true, valor: { ...sinUso, reservada: true } })
    const { container } = render(<BotonQuitar nivel="FALLA" id="f1" usuario="duena" onQuitado={vi.fn()} />)
    await waitFor(() => expect(usoCatalogo).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("sin la migración (no hay respuesta) no muestra nada", async () => {
    usoCatalogo.mockResolvedValue({ ok: false, error: "no existe" })
    const { container } = render(<BotonQuitar nivel="FALLA" id="f1" usuario="duena" onQuitado={vi.fn()} />)
    await waitFor(() => expect(usoCatalogo).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it("si el servidor lo rechaza, muestra el motivo y no cierra", async () => {
    usoCatalogo.mockResolvedValue({ ok: true, valor: sinUso })
    quitarCatalogo.mockResolvedValue({ ok: false, error: "No se puede quitar: ya lo usan 1 paradas" })
    const onQuitado = vi.fn()
    render(<BotonQuitar nivel="SUBSISTEMA" id="u1" usuario="duena" onQuitado={onQuitado} />)
    await userEvent.click(await screen.findByRole("button", { name: /quitar/i }))
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }))
    expect(await screen.findByText(/ya lo usan 1 paradas/)).toBeInTheDocument()
    expect(onQuitado).not.toHaveBeenCalled()
  })
})
