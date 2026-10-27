import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SeccionLineas } from "./SeccionLineas"
import type { FilaLineaCompacta } from "./calculosPanel"

const fila = (over: Partial<FilaLineaCompacta>): FilaLineaCompacta =>
  ({
    codigo: "LINEA_1",
    nombre: "Línea 1",
    estado: "activa",
    corrida: null,
    observacion: null,
    paradaEnVivo: null,
    cajas: 0,
    litros: 0,
    eficienciaPct: null,
    mermaPct: null,
    minutosParada: null,
    minutosParadaTotal: null,
    minutosProduccion: null,
    ...over,
  }) as FilaLineaCompacta

describe("SeccionLineas · Tiempo de parada", () => {
  it("muestra el tramo del turno y, al pasar el cursor, el total si la parada viene de otro turno", () => {
    render(<SeccionLineas conLinks={false} filas={[fila({ minutosParada: 150, minutosParadaTotal: 210 })]} />)
    const celda = screen.getByText("2h 30min")
    expect(celda).toHaveAttribute("title", "Total 210 min")
  })

  it("sin parada de otro turno no hay title", () => {
    render(<SeccionLineas conLinks={false} filas={[fila({ minutosParada: 45 })]} />)
    expect(screen.getByText("45 min")).not.toHaveAttribute("title")
  })
})
