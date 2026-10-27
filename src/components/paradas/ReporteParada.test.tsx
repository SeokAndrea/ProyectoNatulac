import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ReporteParada } from "@/components/paradas/ReporteParada"
import type { Parada } from "@/lib/paradas"
import type { VentanaTurno } from "@/lib/paradasTramo"

vi.mock("@/lib/paradasCatalogo", () => ({
  useCatalogoParadas: () => [{ codigo: "FALLA_BANDA", nombre: "Banda trabada", equipoCodigo: "LLENADORA" }],
  codigoDeParadaLive: () => "ALL1-3",
}))
vi.mock("@/lib/paradasEquipos", () => ({
  useEquiposParadas: () => [{ codigo: "LLENADORA", nombre: "Llenadora", activo: true, lineas: [] }],
}))

const d = (hora: string, dia = "2026-10-25") => `${dia}T${hora}:00`
const T1: VentanaTurno = { id: "t1", etiqueta: "T1", desde: d("07:00"), hasta: d("15:00") }
const T2: VentanaTurno = { id: "t2", etiqueta: "T2", desde: d("15:00"), hasta: d("22:30") }

function parada(extra: Partial<Parada> = {}): Parada {
  return {
    id: "p1",
    clase: "NO_PROGRAMADA",
    origen: "MANTENIMIENTO",
    responsable: "MANTENIMIENTO",
    lineaCodigo: "LINEA_2",
    turnoTipo: "TURNO_1",
    tipoCodigo: "FALLA_BANDA",
    tipoNombre: "Banda trabada",
    tiempoGuiaMin: null,
    nota: "Se escuchó un golpe",
    justificacionDesvio: null,
    inicio: d("14:00"),
    fin: d("17:30"),
    supervisorNombre: "Ana Pérez",
    solucion: "Cambio de rodamiento",
    subsistemaCodigo: "Transmisión",
    lote: "L2610A",
    sabor: "Fresa",
    terminadaPor: "Luis Gómez",
    ...extra,
  }
}

const ahora = new Date("2026-10-25T23:00:00-04:00")

describe("ReporteParada", () => {
  it("muestra sabor, código y el desglose «210 min · T1 60 + T2 150» de una parada de dos turnos", () => {
    render(<ReporteParada parada={parada()} ventanas={[T1, T2]} ahora={ahora} />)
    expect(screen.getByText("Fresa")).toBeInTheDocument()
    expect(screen.getByText("L2610A")).toBeInTheDocument()
    expect(screen.getByText(/ALL1-3/)).toBeInTheDocument()
    expect(screen.getByText(/Transmisión/)).toBeInTheDocument()
    expect(screen.getByText("Llenadora")).toBeInTheDocument()
    expect(screen.getByText("Cambio de rodamiento")).toBeInTheDocument()
    expect(screen.getByText("210 min · T1 60 + T2 150")).toBeInTheDocument()
  })

  it("muestra el equipo y el subsistema de Mantenimiento aparte de la falla de Producción", () => {
    render(<ReporteParada parada={parada({ mttoEquipoNombre: "CBP32", subsistemaCodigo: "CBP-EMP-05", subsistemaNombre: "EMPUJADOR" })} ventanas={[T1, T2]} ahora={ahora} />)
    expect(screen.getByText("CBP32")).toBeInTheDocument()
    expect(screen.getByText("CBP-EMP-05 · EMPUJADOR")).toBeInTheDocument()
    expect(screen.getByText("Llenadora")).toBeInTheDocument()
    expect(screen.getByText("Banda trabada")).toBeInTheDocument()
  })

  it("«Sin subsistema» se lee así, no como la marca", () => {
    render(<ReporteParada parada={parada({ subsistemaCodigo: "SIN_SUBSISTEMA", subsistemaNombre: "Sin subsistema" })} ventanas={[T1, T2]} ahora={ahora} />)
    expect(screen.getByText("Sin subsistema")).toBeInTheDocument()
    expect(screen.queryByText("SIN_SUBSISTEMA")).toBeNull()
  })

  it("una parada de un solo turno muestra solo sus minutos", () => {
    render(<ReporteParada parada={parada({ inicio: d("09:00"), fin: d("10:30") })} ventanas={[T1, T2]} ahora={ahora} />)
    expect(screen.getByText("90 min")).toBeInTheDocument()
    expect(screen.queryByText(/T1 90/)).not.toBeInTheDocument()
  })

  it("muestra quién la abrió y quién la terminó", () => {
    render(<ReporteParada parada={parada()} ventanas={[T1, T2]} ahora={ahora} />)
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument()
    expect(screen.getByText("Luis Gómez")).toBeInTheDocument()
  })

  it("el botón Imprimir abre la impresión", async () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {})
    render(<ReporteParada parada={parada()} ventanas={[T1, T2]} ahora={ahora} />)
    await userEvent.click(screen.getByRole("button", { name: /Imprimir/ }))
    expect(imprimir).toHaveBeenCalled()
  })
})
