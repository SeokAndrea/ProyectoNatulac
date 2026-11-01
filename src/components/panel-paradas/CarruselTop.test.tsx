import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GrupoTipo } from "@/lib/paradas"
import { CarruselTop, PASO_CARRUSEL_MS } from "./CarruselTop"

const g = (nombre: string): GrupoTipo => ({ codigo: nombre, nombre, clase: "NO_PROGRAMADA", veces: 2, minutos: 90, guiaMin: 0, desvioMin: null })
const vistas = [
  { nombre: "Equipos", items: [g("Compact Flex")] },
  { nombre: "Sistemas", items: [g("Superestructura · Compact Flex")] },
  { nombre: "Subsistemas", items: [g("Cámara aséptica · Compact Flex")] },
]
const titulo = () => screen.getByRole("heading").textContent

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("CarruselTop", () => {
  it("con modo presentar pasa solo cada 8 s y vuelve al principio", () => {
    render(<CarruselTop vistas={vistas} presentar />)
    expect(titulo()).toBe("Equipos · por tiempo")
    act(() => vi.advanceTimersByTime(PASO_CARRUSEL_MS))
    expect(titulo()).toBe("Sistemas · por tiempo")
    act(() => vi.advanceTimersByTime(PASO_CARRUSEL_MS * 2))
    expect(titulo()).toBe("Equipos · por tiempo")
  })

  it("tocarlo lo deja quieto (Pausado) y otro toque lo hace seguir", () => {
    render(<CarruselTop vistas={vistas} presentar />)
    fireEvent.click(screen.getByRole("button", { name: "Dejar quieto para analizar" }))
    expect(screen.getByText("Pausado")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(PASO_CARRUSEL_MS * 3))
    expect(titulo()).toBe("Equipos · por tiempo")
    fireEvent.click(screen.getByRole("button", { name: "Seguir pasando solo" }))
    act(() => vi.advanceTimersByTime(PASO_CARRUSEL_MS))
    expect(titulo()).toBe("Sistemas · por tiempo")
  })

  it("sin modo presentar no se mueve solo; se cambia con las flechas", () => {
    render(<CarruselTop vistas={vistas} presentar={false} />)
    act(() => vi.advanceTimersByTime(PASO_CARRUSEL_MS * 2))
    expect(titulo()).toBe("Equipos · por tiempo")
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }))
    expect(titulo()).toBe("Subsistemas · por tiempo")
    expect(screen.getByText("1 h 30 min")).toBeInTheDocument()
  })

  it("con el teclado: ← → con el carrusel enfocado; presentando, las flechas lo mueven sin enfocarlo", () => {
    const { rerender } = render(<CarruselTop vistas={vistas} presentar={false} />)
    fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowRight" })
    expect(titulo()).toBe("Sistemas · por tiempo")
    rerender(<CarruselTop vistas={vistas} presentar />)
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(titulo()).toBe("Equipos · por tiempo")
  })
})
