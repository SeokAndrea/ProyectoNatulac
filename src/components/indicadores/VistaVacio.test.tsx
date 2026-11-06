import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { VistaVacio } from "@/components/indicadores/VistaVacio"

describe("VistaVacio (previa)", () => {
  it("una eficiencia, dos columnas con cajas y las dos mermas, sin comparaciones ni cumplimiento", () => {
    render(<VistaVacio mes="2026-10-01" puedeEditar />)
    expect(screen.getAllByText("EFICIENCIA")).toHaveLength(1)
    expect(screen.getAllByText("CAJAS PRODUCIDAS")).toHaveLength(2)
    expect(screen.getAllByText("MERMA DE EMPAQUE")).toHaveLength(2)
    expect(screen.getAllByText("MERMA DE SEMIELABORADO")).toHaveLength(2)
    expect(screen.queryByText("CAJAS PLANEADAS")).toBeNull()
    expect(screen.queryByText("CUMPLIMIENTO DE PLAN")).toBeNull()
    expect(screen.queryByText(/Más alto/)).toBeNull()
    expect(screen.queryByText(/vs /)).toBeNull()
    expect(screen.queryByText(/Línea/)).toBeNull()
  })

  it("el selector ofrece las 4 presentaciones con su unidad y cambia la columna y sus fallas", () => {
    render(<VistaVacio mes="2026-10-01" puedeEditar />)
    const selector = screen.getByLabelText("Presentación de la columna 1") as HTMLSelectElement
    expect([...selector.options].map((o) => o.textContent)).toEqual(["AL-340 · cm³", "V-250 · g", "V-114 · g", "V-186 · g"])
    expect(screen.getByDisplayValue("Cambio de rollo de tapa")).toBeTruthy()
    fireEvent.change(selector, { target: { value: "V-114" } })
    expect(selector.value).toBe("V-114")
    expect(screen.queryByDisplayValue("Cambio de rollo de tapa")).toBeNull()
    expect(screen.getByDisplayValue("Falla en etiquetadora")).toBeTruthy()
  })

  it("las fallas se escriben a mano: se editan, se quitan y se agregan", () => {
    render(<VistaVacio mes="2026-10-01" puedeEditar />)
    const fallas = screen.getByRole("region", { name: "Fallas" })
    fireEvent.change(within(fallas).getAllByLabelText("Falla 1")[0], { target: { value: "Falla nueva de prueba" } })
    expect(screen.getByDisplayValue("Falla nueva de prueba")).toBeTruthy()
    fireEvent.click(within(fallas).getAllByLabelText("Quitar falla 1")[0])
    expect(screen.queryByDisplayValue("Falla nueva de prueba")).toBeNull()
    const antes = within(fallas).getAllByLabelText(/^Falla \d/).length
    fireEvent.click(within(fallas).getAllByText("Agregar falla")[0])
    expect(within(fallas).getAllByLabelText(/^Falla \d/).length).toBe(antes + 1)
  })
})
