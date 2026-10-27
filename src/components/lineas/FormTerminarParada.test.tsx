import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FormTerminarParada } from "@/components/lineas/FormTerminarParada"
import type { Parada } from "@/lib/paradas"

const terminarParada = vi.fn()
const paradaCruzoTurnoCerrado = vi.fn()
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  terminarParada: (...a: unknown[]) => terminarParada(...a),
  paradaCruzoTurnoCerrado: (...a: unknown[]) => paradaCruzoTurnoCerrado(...a),
}))
// El buscador del catálogo se prueba aparte: acá basta con corregir el tipo.
vi.mock("@/components/BuscadorTipoParada", () => ({
  BuscadorTipoParada: ({ onElegir }: { onElegir: (t: unknown) => void }) => (
    <button type="button" onClick={() => onElegir({ codigo: "FALLA_NIVEL_BTD", nombre: "Falla de Nivel del BTD", clase: "NO_PROGRAMADA", tiempoGuiaMin: null })}>
      Elegir tipo
    </button>
  ),
}))
vi.mock("@/lib/paradasEquipos", () => ({ useEquiposParadas: () => [] }))

const parada: Parada = {
  id: "p1",
  clase: "NO_PROGRAMADA",
  origen: "MANTENIMIENTO",
  responsable: "MANTENIMIENTO",
  lineaCodigo: "LINEA_1",
  turnoTipo: "TURNO_1",
  tipoCodigo: "DESVASE_PRODUCTO",
  tipoNombre: "Desvase de Producto",
  tiempoGuiaMin: null,
  nota: "Se rompió",
  justificacionDesvio: null,
  inicio: "2026-10-26T13:00:00",
  fin: null,
  supervisorNombre: null,
  subsistemaCodigo: null,
  lote: null,
  sabor: null,
  terminadaPor: null,
}

async function montar(cruzo = false) {
  paradaCruzoTurnoCerrado.mockResolvedValue(cruzo)
  const onTerminada = vi.fn()
  render(<FormTerminarParada parada={parada} usuario="mtto1" onTerminada={onTerminada} />)
  await screen.findByRole("button", { name: /terminar parada/i })
  return { onTerminada }
}
const terminar = () => screen.getByRole("button", { name: /terminar parada/i })
const subsistema = () => screen.getByLabelText(/subsistema/i)
const queSeRealizo = () => screen.getByLabelText(/qué se realizó/i)

beforeEach(() => {
  terminarParada.mockReset()
  terminarParada.mockResolvedValue({ ok: true })
})

describe("FormTerminarParada", () => {
  it("exige código (subsistema) y qué se realizó", async () => {
    await montar()
    await userEvent.type(screen.getByLabelText(/minutos/i), "30")
    expect(terminar()).toBeDisabled()
    await userEvent.type(subsistema(), "BOMBA-1")
    expect(terminar()).toBeDisabled() // falta qué se realizó
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    expect(terminar()).toBeEnabled()
  })

  it("en una parada de un solo turno acepta minutos: fin = inicio + minutos", async () => {
    const { onTerminada } = await montar()
    await userEvent.type(subsistema(), "BOMBA-1")
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.type(screen.getByLabelText(/minutos/i), "45")
    await userEvent.click(terminar())
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    expect(terminarParada).toHaveBeenCalledWith(
      "mtto1",
      "p1",
      { tipoCodigo: "DESVASE_PRODUCTO", subsistemaCodigo: "BOMBA-1", solucion: "Se cambió el sello", fin: "2026-10-26T13:45:00", inicio: null },
      expect.any(String),
    )
  })

  it("acepta hora de comienzo y de fin", async () => {
    await montar()
    await userEvent.type(subsistema(), "BOMBA-1")
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.click(screen.getByRole("button", { name: /hora de comienzo y fin/i }))
    fireEvent.change(screen.getByLabelText(/comenzó a las/i), { target: { value: "2026-10-26T12:40" } })
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T13:50" } })
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ inicio: "2026-10-26T12:40:00", fin: "2026-10-26T13:50:00" })
  })

  it("no deja terminar antes de empezar", async () => {
    await montar()
    await userEvent.type(subsistema(), "BOMBA-1")
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.click(screen.getByRole("button", { name: /hora de comienzo y fin/i }))
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T12:00" } })
    expect(terminar()).toBeDisabled()
  })

  it("si cruzó un turno cerrado: sin minutos, comienzo bloqueado y solo manda el fin", async () => {
    await montar(true)
    expect(screen.queryByLabelText(/minutos/i)).toBeNull()
    expect(screen.queryByLabelText(/comenzó a las/i)).toBeNull()
    expect(screen.getByText(/empezó 13:00 \(turno cerrado\)/i)).toBeInTheDocument()
    await userEvent.type(subsistema(), "BOMBA-1")
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T16:30" } })
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ inicio: null, fin: "2026-10-26T16:30:00" })
  })

  it("se puede corregir equipo y falla; el cambio se envía", async () => {
    await montar()
    await userEvent.click(screen.getByRole("button", { name: /cambiar/i }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.type(subsistema(), "S1")
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2].tipoCodigo).toBe("FALLA_NIVEL_BTD")
  })

  it("muestra el error del servidor y no termina", async () => {
    terminarParada.mockResolvedValue({ ok: false, error: "Solo Mantenimiento la termina." })
    const { onTerminada } = await montar()
    await userEvent.type(subsistema(), "S1")
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    expect(await screen.findByText("Solo Mantenimiento la termina.")).toBeInTheDocument()
    expect(onTerminada).not.toHaveBeenCalled()
  })
})
