import { fireEvent, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useFlechas } from "./secciones"

describe("useFlechas — cambiar de pantalla con el teclado", () => {
  it("→ pasa a la siguiente y ← a la anterior; en los extremos no hace nada", () => {
    const onSeccion = vi.fn()
    const { rerender } = renderHook(({ s }) => useFlechas(s, onSeccion, true), { initialProps: { s: "1" as const } as { s: "1" | "inc" } })
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(onSeccion).toHaveBeenLastCalledWith("2")
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(onSeccion).toHaveBeenCalledTimes(1)
    rerender({ s: "inc" })
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(onSeccion).toHaveBeenCalledTimes(1)
  })

  it("no actúa mientras se escribe ni con el editor abierto", () => {
    const onSeccion = vi.fn()
    const { rerender } = renderHook(({ activo }) => useFlechas("2", onSeccion, activo), { initialProps: { activo: true } })
    const campo = document.body.appendChild(document.createElement("textarea"))
    fireEvent.keyDown(campo, { key: "ArrowRight" })
    expect(onSeccion).not.toHaveBeenCalled()
    rerender({ activo: false })
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(onSeccion).not.toHaveBeenCalled()
    campo.remove()
  })
})
