import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DiasSinIncidentes } from "@/components/indicadores/DiasSinIncidentes"

describe("DiasSinIncidentes", () => {
  it("rojo con menos de 15 días, amarillo de 15 a 29, verde desde 30", () => {
    const { rerender } = render(<DiasSinIncidentes dias={14} />)
    expect(screen.getByRole("status", { name: "14 días sin incidentes" })).toHaveClass("bg-danger")
    rerender(<DiasSinIncidentes dias={15} />)
    expect(screen.getByRole("status", { name: "15 días sin incidentes" })).toHaveClass("bg-warning")
    rerender(<DiasSinIncidentes dias={29} />)
    expect(screen.getByRole("status", { name: "29 días sin incidentes" })).toHaveClass("bg-warning")
    rerender(<DiasSinIncidentes dias={30} />)
    expect(screen.getByRole("status", { name: "30 días sin incidentes" })).toHaveClass("bg-success")
  })
})
