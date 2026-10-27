import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { LineaLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import { ParadaMasLarga } from "./ParadaMasLarga"

const AHORA = new Date("2026-10-26T17:00:00")
const par = (over: Partial<Parada>): Parada =>
  ({ id: "a", lineaCodigo: "LINEA_1", tipoCodigo: null, tipoNombre: "Llenadora", nota: null, inicio: "2026-10-26T14:00:00", fin: "2026-10-26T16:30:00", ...over }) as Parada
const LINEAS = [{ codigo: "LINEA_1", nombre: "Línea 1" }] as LineaLive[]

describe("ParadaMasLarga", () => {
  it("muestra el tramo del turno y el total al pasar el cursor", () => {
    const completas = new Map([["a", par({ inicio: "2026-10-26T13:00:00" })]])
    render(<ParadaMasLarga paradas={[par({})]} completas={completas} lineas={LINEAS} ahora={AHORA} />)
    expect(screen.getByText("2h 30min")).toHaveAttribute("title", "Total 210 min")
  })

  it("sin otro turno no hay title", () => {
    render(<ParadaMasLarga paradas={[par({})]} lineas={LINEAS} ahora={AHORA} />)
    expect(screen.getByText("2h 30min")).not.toHaveAttribute("title")
  })
})
