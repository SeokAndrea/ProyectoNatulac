import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FormParadaLinea } from "@/components/lineas/FormParadaLinea"
import type { ResponsableParada } from "@/lib/paradas"

// El buscador del catálogo se prueba aparte: acá basta con elegir un tipo.
vi.mock("@/components/BuscadorTipoParada", () => ({
  BuscadorTipoParada: ({ onElegir }: { onElegir: (t: unknown) => void }) => (
    <button type="button" onClick={() => onElegir({ codigo: "DESVASE_PRODUCTO", nombre: "Desvase de Producto", clase: "NO_PROGRAMADA", tiempoGuiaMin: null })}>
      Elegir tipo
    </button>
  ),
}))
vi.mock("@/lib/paradasEquipos", () => ({ useEquiposParadas: () => [] }))

function montar(over: { responsableFijo?: ResponsableParada; desdeAntes?: boolean } = {}) {
  const pausar = vi.fn().mockResolvedValue({ ok: true })
  const onCerrar = vi.fn()
  render(<FormParadaLinea corridaId="c1" lineaCodigo="LINEA_1" areaCodigo="ASEPTICO" presentacionMl={1000} pausar={pausar} onCerrar={onCerrar} {...over} />)
  return { pausar, onCerrar }
}
const confirmar = () => screen.getByRole("button", { name: /confirmar parada/i })
const escribir = (t: string) => userEvent.type(screen.getByRole("textbox"), t)

describe("FormParadaLinea", () => {
  it("Confirmar parada está deshabilitado sin responsable, sin tipo o sin comentario", async () => {
    montar()
    expect(confirmar()).toBeDisabled()
    await userEvent.click(screen.getByRole("radio", { name: "Mantenimiento" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    expect(confirmar()).toBeDisabled() // falta comentario
    await escribir("Se rompió")
    expect(confirmar()).toBeEnabled()
  })

  it("sin responsable sigue deshabilitado aunque haya tipo y comentario", async () => {
    montar()
    await userEvent.click(screen.getByText("Elegir tipo"))
    await escribir("Se rompió")
    expect(confirmar()).toBeDisabled()
  })

  it("sin tipo sigue deshabilitado aunque haya responsable y comentario", async () => {
    montar()
    await userEvent.click(screen.getByRole("radio", { name: "Operacional" }))
    await escribir("Se rompió")
    expect(confirmar()).toBeDisabled()
  })

  it("con los tres llama a pausar con MANTENIMIENTO", async () => {
    const { pausar, onCerrar } = montar()
    await userEvent.click(screen.getByRole("radio", { name: "Mantenimiento" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await escribir("Se rompió")
    await userEvent.click(confirmar())
    expect(pausar).toHaveBeenCalledWith("c1", { motivo: "Se rompió", tipoCodigo: "DESVASE_PRODUCTO", responsable: "MANTENIMIENTO", inicio: null })
    expect(onCerrar).toHaveBeenCalled()
  })

  it("con los tres llama a pausar con OPERACIONAL", async () => {
    const { pausar } = montar()
    await userEvent.click(screen.getByRole("radio", { name: "Operacional" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await escribir("Falta tapa")
    await userEvent.click(confirmar())
    expect(pausar).toHaveBeenCalledWith("c1", expect.objectContaining({ responsable: "OPERACIONAL", tipoCodigo: "DESVASE_PRODUCTO" }))
  })

  it("no existe el botón «No sé / es una falla»", () => {
    montar()
    expect(screen.queryByText(/no sé/i)).toBeNull()
    expect(screen.queryByText(/sé la causa/i)).toBeNull()
  })

  it("«Empezó antes» abre la hora de inicio y se envía", async () => {
    const { pausar } = montar()
    expect(screen.queryByLabelText(/empezó a las/i)).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: /empezó antes/i }))
    expect(screen.getByLabelText(/empezó a las/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "Operacional" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await escribir("Falta tapa")
    await userEvent.click(confirmar())
    expect(pausar.mock.calls[0][1].inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  it("con desdeAntes la hora de inicio ya está abierta", () => {
    montar({ desdeAntes: true })
    expect(screen.getByLabelText(/empezó a las/i)).toBeInTheDocument()
  })

  it("con responsableFijo no muestra el selector y envía ese valor", async () => {
    const { pausar } = montar({ responsableFijo: "MANTENIMIENTO" })
    expect(screen.queryByRole("radio")).toBeNull()
    await userEvent.click(screen.getByText("Elegir tipo"))
    await escribir("Cambio de rodamiento")
    await userEvent.click(confirmar())
    expect(pausar).toHaveBeenCalledWith("c1", expect.objectContaining({ responsable: "MANTENIMIENTO" }))
  })
})
