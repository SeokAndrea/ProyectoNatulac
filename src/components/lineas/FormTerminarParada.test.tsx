import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FormTerminarParada } from "@/components/lineas/FormTerminarParada"
import { ahoraPlanta, minutosEntre, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import type { Parada } from "@/lib/paradas"

const terminarParada = vi.fn()
const clasificarFallaMantenimiento = vi.fn()
const paradaCruzoTurnoCerrado = vi.fn()
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  terminarParada: (...a: unknown[]) => terminarParada(...a),
  clasificarFallaMantenimiento: (...a: unknown[]) => clasificarFallaMantenimiento(...a),
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
vi.mock("@/lib/paradasCatalogo", () => ({
  useCatalogoParadas: () => [{ codigo: "DESVASE_PRODUCTO", nombre: "Desvase de Producto", equipoCodigo: "CARDBOARD_PACKER" }],
}))
// Catálogo propio de Mantenimiento: sus equipos y subsistemas.
vi.mock("@/lib/mttoCatalogo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mttoCatalogo")>()),
  useCatalogoMtto: () => ({
    equipos: [
      { codigo: "CBP32", nombre: "CBP32", equipoProduccionCodigo: "CARDBOARD_PACKER", activo: true },
      { codigo: "FW32", nombre: "FW32", equipoProduccionCodigo: null, activo: true },
      { codigo: "VIEJO", nombre: "VIEJO", equipoProduccionCodigo: null, activo: false },
    ],
    subsistemas: [
      { id: "1", equipoCodigo: "CBP32", codigo: "CBP-EMP-05", nombre: "EMPUJADOR", activo: true },
      { id: "2", equipoCodigo: "CBP32", codigo: "CBP-OFF-01", nombre: "DESACTIVADO", activo: false },
      { id: "3", equipoCodigo: "FW32", codigo: "FW-CUC-01", nombre: "CUCHILLA", activo: true },
    ],
    cargando: false,
    recargar: async () => {},
  }),
}))

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

async function montar(cruzo = false, p: Parada = parada, esMantenimiento = true) {
  paradaCruzoTurnoCerrado.mockResolvedValue(cruzo)
  const onTerminada = vi.fn()
  render(<FormTerminarParada parada={p} usuario="mtto1" esMantenimiento={esMantenimiento} onTerminada={onTerminada} />)
  await screen.findByRole("button", { name: /terminar parada/i })
  return { onTerminada }
}
const terminar = () => screen.getByRole("button", { name: /terminar parada/i })
const subsistema = () => screen.getByLabelText(/^subsistema/i)
const equipoMtto = () => screen.getByLabelText(/equipo de mantenimiento/i)
/** El equipo viene preseleccionado (CBP32): se elige el subsistema de la lista. */
const elegirCodigo = async (codigo = "CBP-EMP-05") => userEvent.selectOptions(subsistema(), codigo)
const queSeRealizo = () => screen.getByLabelText(/qué se realizó/i)

beforeEach(() => {
  terminarParada.mockReset()
  terminarParada.mockResolvedValue({ ok: true })
})

describe("FormTerminarParada", () => {
  it("exige subsistema (o «Sin subsistema») y qué se realizó", async () => {
    await montar()
    await userEvent.type(screen.getByLabelText(/minutos/i), "30")
    expect(terminar()).toBeDisabled()
    await elegirCodigo()
    expect(terminar()).toBeDisabled() // falta qué se realizó
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    expect(terminar()).toBeEnabled()
  })

  it("en una parada de un solo turno acepta minutos: fin = inicio + minutos", async () => {
    const { onTerminada } = await montar()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.type(screen.getByLabelText(/minutos/i), "45")
    await userEvent.click(terminar())
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    expect(terminarParada).toHaveBeenCalledWith(
      "mtto1",
      "p1",
      { tipoCodigo: "DESVASE_PRODUCTO", mttoEquipoCodigo: "CBP32", subsistemaCodigo: "CBP-EMP-05", solucion: "Se cambió el sello", fin: "2026-10-26T13:45:00", inicio: null },
      expect.any(String),
    )
  })

  it("Mantenimiento puede anotar cuánto tardó la reparación (opcional, aparte del tiempo de la parada)", async () => {
    const { onTerminada } = await montar()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.type(screen.getByLabelText(/minutos/i), "45")
    await userEvent.type(screen.getByLabelText(/tiempo de reparación/i), "20")
    await userEvent.click(terminar())
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ fin: "2026-10-26T13:45:00", reparacionMin: 20 })
  })

  it("Ponerle código a una falla ya cerrada: sin minutos, pide la falla y guarda con clasificar (las horas no cambian)", async () => {
    clasificarFallaMantenimiento.mockResolvedValue({ ok: true })
    const cerrada: Parada = { ...parada, tipoCodigo: "FALLA_SIN_ESPECIFICAR", tipoNombre: "Falla sin especificar", fin: "2026-10-26T14:00:00" }
    const onTerminada = vi.fn()
    render(<FormTerminarParada parada={cerrada} usuario="mtto1" esMantenimiento soloCodigo onTerminada={onTerminada} />)
    expect(screen.queryByLabelText(/^minutos/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.selectOptions(screen.getByLabelText(/equipo de mantenimiento/i), "FW32")
    await userEvent.selectOptions(subsistema(), "FW-CUC-01")
    await userEvent.type(queSeRealizo(), "Se cambió la cuchilla")
    await userEvent.type(screen.getByLabelText(/tiempo de reparación/i), "25")
    await userEvent.click(screen.getByRole("button", { name: /guardar código/i }))
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    expect(terminarParada).not.toHaveBeenCalled()
    expect(clasificarFallaMantenimiento).toHaveBeenCalledWith(
      "mtto1",
      "p1",
      { tipoCodigo: "FALLA_NIVEL_BTD", mttoEquipoCodigo: "FW32", subsistemaCodigo: "FW-CUC-01", solucion: "Se cambió la cuchilla", reparacionMin: 25 },
      expect.any(String),
    )
  })

  it("el supervisor no ve el tiempo de reparación", async () => {
    await montar(false, parada, false)
    expect(screen.queryByLabelText(/tiempo de reparación/i)).not.toBeInTheDocument()
  })

  it("si los minutos pasan de ahora, la parada empezó antes de abrirla: termina ahora y empieza minutos antes", async () => {
    const ahora = ahoraPlanta()
    const { onTerminada } = await montar(false, { ...parada, inicio: `${sumarMinutos(ahora, -10)}:00` })
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.type(screen.getByLabelText(/minutos/i), "62")
    expect(screen.getByText(/empezó antes de abrirla/i)).toBeInTheDocument()
    await userEvent.click(terminar())
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    const datos = terminarParada.mock.calls[0][2] as { fin: string; inicio: string }
    expect(minutosEntre(datos.inicio.slice(0, 16), datos.fin.slice(0, 16))).toBe(62)
    expect(datos.fin.slice(0, 16) <= ahoraPlanta()).toBe(true)
  })

  it("acepta hora de comienzo y de fin", async () => {
    await montar()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.click(screen.getByRole("button", { name: /hora de inicio y fin/i }))
    fireEvent.change(screen.getByLabelText(/comenzó a las/i), { target: { value: "2026-10-26T12:40" } })
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T13:50" } })
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ inicio: "2026-10-26T12:40:00", fin: "2026-10-26T13:50:00" })
  })

  it("no deja terminar antes de empezar", async () => {
    await montar()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.click(screen.getByRole("button", { name: /hora de inicio y fin/i }))
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T12:00" } })
    expect(terminar()).toBeDisabled()
  })

  it("si cruzó un turno cerrado: con minutos, el comienzo no se mueve y solo manda el fin", async () => {
    await montar(true)
    expect(screen.queryByLabelText(/comenzó a las/i)).toBeNull()
    expect(screen.getByText(/empezó 13:00 \(turno cerrado\)/i)).toBeInTheDocument()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.type(screen.getByLabelText(/minutos/i), "210")
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ inicio: null, fin: "2026-10-26T16:30:00" })
  })

  it("si cruzó un turno cerrado también se puede poner la hora de fin", async () => {
    await montar(true)
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "Se cambió el sello")
    await userEvent.click(screen.getByRole("button", { name: /hora de fin/i }))
    fireEvent.change(screen.getByLabelText(/terminó a las/i), { target: { value: "2026-10-26T16:30" } })
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ inicio: null, fin: "2026-10-26T16:30:00" })
  })

  it("el equipo y la falla de Producción no se cambian: no hay buscador y se manda el de la parada", async () => {
    await montar()
    expect(screen.queryByText("Elegir tipo")).toBeNull()
    expect(screen.queryByRole("button", { name: /cambiar/i })).toBeNull()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2].tipoCodigo).toBe("DESVASE_PRODUCTO")
  })

  it("si la parada quedó sin falla, se elige del catálogo de Producción", async () => {
    await montar(false, { ...parada, tipoCodigo: "FALLA_SIN_ESPECIFICAR", tipoNombre: "Falla sin especificar" })
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.selectOptions(equipoMtto(), "CBP32")
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2].tipoCodigo).toBe("FALLA_NIVEL_BTD")
  })

  it("preselecciona el equipo de Mantenimiento según el de Producción y ofrece solo sus subsistemas activos", async () => {
    await montar()
    expect(equipoMtto()).toHaveValue("CBP32")
    const opciones = Array.from((subsistema() as HTMLSelectElement).options).map((o) => o.textContent)
    expect(opciones).toEqual(["Elige el subsistema…", "Sin subsistema", "CBP-EMP-05 · EMPUJADOR"])
    expect(Array.from((equipoMtto() as HTMLSelectElement).options).map((o) => o.textContent)).not.toContain("VIEJO")
  })

  it("se puede cambiar el equipo de Mantenimiento; los subsistemas son los del nuevo equipo", async () => {
    await montar()
    await userEvent.selectOptions(equipoMtto(), "FW32")
    expect(subsistema()).toHaveValue("")
    await userEvent.selectOptions(subsistema(), "FW-CUC-01")
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ mttoEquipoCodigo: "FW32", subsistemaCodigo: "FW-CUC-01" })
  })

  it("el supervisor no ve equipo ni subsistema: termina con «Sin subsistema» y sin equipo de Mantenimiento", async () => {
    await montar(false, parada, false)
    expect(screen.queryByLabelText(/equipo de mantenimiento/i)).toBeNull()
    expect(screen.queryByLabelText(/^subsistema/i)).toBeNull()
    await userEvent.type(queSeRealizo(), "Se destrabó")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    expect(terminar()).toBeEnabled()
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ mttoEquipoCodigo: "", subsistemaCodigo: "SIN_SUBSISTEMA" })
  })

  it("«Sin subsistema» cuenta como una elección y manda la marca", async () => {
    await montar()
    await userEvent.selectOptions(subsistema(), "SIN_SUBSISTEMA")
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    expect(terminar()).toBeEnabled()
    await userEvent.click(terminar())
    await waitFor(() => expect(terminarParada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2]).toMatchObject({ mttoEquipoCodigo: "CBP32", subsistemaCodigo: "SIN_SUBSISTEMA" })
  })

  it("usa el comienzo verdadero (no el recortado al turno) para los minutos", async () => {
    const larga = { ...parada, inicio: "2026-10-26T13:00:00", inicioReal: "2026-10-26T10:00:00" }
    const { onTerminada } = await montar(false, larga)
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "30")
    await userEvent.click(terminar())
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
    expect(terminarParada.mock.calls[0][2].fin).toBe("2026-10-26T10:30:00")
  })

  it("si cruzó un turno cerrado dice cuándo empezó de verdad", async () => {
    await montar(true, { ...parada, inicio: "2026-10-26T13:00:00", inicioReal: "2026-10-26T10:00:00" })
    expect(screen.getByText(/empezó 10:00 \(turno cerrado\)/i)).toBeInTheDocument()
  })

  it("muestra el error del servidor y no termina", async () => {
    terminarParada.mockResolvedValue({ ok: false, error: "Solo Mantenimiento la termina." })
    const { onTerminada } = await montar()
    await elegirCodigo()
    await userEvent.type(queSeRealizo(), "x")
    await userEvent.type(screen.getByLabelText(/minutos/i), "10")
    await userEvent.click(terminar())
    expect(await screen.findByText("Solo Mantenimiento la termina.")).toBeInTheDocument()
    expect(onTerminada).not.toHaveBeenCalled()
  })
})
