import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DiasSinIncidentes } from "@/components/indicadores/DiasSinIncidentes"

describe("DiasSinIncidentes", () => {
  it("rojo antes de 30 días, verde desde 30", () => {
    const { rerender } = render(<DiasSinIncidentes dias={29} />)
    expect(screen.getByRole("status", { name: "29 días sin incidentes" })).toHaveClass("bg-danger")
    rerender(<DiasSinIncidentes dias={30} />)
    expect(screen.getByRole("status", { name: "30 días sin incidentes" })).toHaveClass("bg-success")
  })
})
