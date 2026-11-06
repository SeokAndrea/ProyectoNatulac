import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SeccionTanques } from "./SeccionTanques"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { EstimacionTanque } from "@/lib/robotTavil"

vi.mock("./ServiciosIndustrialesFranja", () => ({ ServiciosIndustrialesFranja: () => null }))

/*
 * Nivel estimado del Robot Tavil en la tarjeta Tanques: el número grande es
 * el estimado, el oficial queda debajo y lo pendiente se sombrea en el vidrio.
 */

const tanque = (over: Partial<TanqueRecepcion> = {}): TanqueRecepcion => ({
  numeroTanque: 1,
  saborId: "s1",
  saborNombre: "Pera",
  condicion: "LISTO",
  volumenL: 14000,
  volumenInicialL: 15000,
  lote: "2611-P1",
  activadaEn: "2026-11-04T07:00:00Z",
  ultimoSaborId: null,
  ultimoSaborNombre: null,
  ultimoLote: null,
  confirmadoInicioEn: null,
  confirmadoFinEn: null,
  cipIniciadoEn: null,
  cipFinalizadoEn: null,
  paraVacio: false,
  ...over,
})

const pintar = (estimaciones?: EstimacionTanque[], t = tanque()) =>
  render(<SeccionTanques tanques={[t]} preparaciones={[]} servIndustriales={null} ahora={new Date()} conLinks={false} estimaciones={estimaciones} />)

describe("SeccionTanques · Robot Tavil", () => {
  it("sin estimación se ve como siempre", () => {
    pintar()
    expect(screen.getByText(/14\.000/)).toBeInTheDocument()
    expect(screen.queryByText(/Oficial/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("pendiente-robot")).not.toBeInTheDocument()
  })

  it("con precarga sin confirmar muestra el estimado, el oficial y el sombreado", () => {
    pintar([{ numeroTanque: 1, volumenOficialL: 15000, litrosPendientes: 4944 }])
    expect(screen.getByText(/≈ 10\.056/)).toBeInTheDocument()
    expect(screen.getByText("Oficial 15.000 L")).toBeInTheDocument()
    expect(screen.getByTestId("pendiente-robot")).toBeInTheDocument()
    expect(screen.getByText("≈67%")).toBeInTheDocument()
  })

  it("con todo confirmado usa el oficial del mismo momento, sin marca", () => {
    pintar([{ numeroTanque: 1, volumenOficialL: 10056, litrosPendientes: 0 }])
    expect(screen.getByText(/10\.056/)).toBeInTheDocument()
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument()
    expect(screen.queryByTestId("pendiente-robot")).not.toBeInTheDocument()
  })

  it("si la precarga supera lo que queda muestra 0 y el aviso", () => {
    pintar([{ numeroTanque: 1, volumenOficialL: 300, litrosPendientes: 480 }])
    expect(screen.getByText(/≈ 0/)).toBeInTheDocument()
    expect(screen.getByText("Supera lo que queda. Revisar")).toBeInTheDocument()
  })

  it("un tanque sin líquido no usa la estimación", () => {
    pintar([{ numeroTanque: 1, volumenOficialL: 15000, litrosPendientes: 4944 }], tanque({ condicion: "LIMPIO", volumenL: null }))
    expect(screen.getByText("Disponible para llenar.")).toBeInTheDocument()
    expect(screen.queryByText(/Oficial/)).not.toBeInTheDocument()
  })
})
