import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ColaFallasNuevas } from "@/components/catalogo-fallas/ColaFallasNuevas"
import type { FallaNuevaPendiente } from "@/lib/catalogoFallas/fallaNueva"

const listarFallasNuevas = vi.fn()
const identificarFallaNueva = vi.fn()
vi.mock("@/lib/catalogoFallas/fallaNueva", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogoFallas/fallaNueva")>()),
  listarFallasNuevas: (...a: unknown[]) => listarFallasNuevas(...a),
  identificarFallaNueva: (...a: unknown[]) => identificarFallaNueva(...a),
  descartarFallasNuevas: vi.fn(),
}))
// El selector del catálogo se prueba aparte: acá basta con elegir una falla real o la «Falla nueva».
vi.mock("./ElegirFallaMtto", () => ({
  ElegirFallaMtto: ({ onCambiar }: { onCambiar: (o: unknown) => void }) => (
    <div>
      <button type="button" onClick={() => onCambiar({ falla: { id: "real", nombre: "Sensor de nivel", codigo: "BTD.NIV.SEN-3", reservada: false } })}>
        Elegir real
      </button>
      <button type="button" onClick={() => onCambiar({ falla: { id: "fn", nombre: "Falla nueva", codigo: "BTD-0", reservada: true } })}>
        Elegir Falla nueva
      </button>
    </div>
  ),
}))

const item = (over: Partial<FallaNuevaPendiente> = {}): FallaNuevaPendiente => ({
  paradaId: "p1",
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  origen: "BTD",
  tipoNombre: "Falla nueva · Sin clasificar",
  nota: "Se botó el nivel",
  solucion: null,
  creadaPor: "Javier",
  inicio: "2026-11-13T12:00:00Z",
  fin: null,
  minutos: 20,
  terminada: false,
  fallaId: "fn",
  sifCodigo: null,
  sifParadas: null,
  ...over,
})

describe("ColaFallasNuevas — Identificar", () => {
  beforeEach(() => {
    listarFallasNuevas.mockReset()
    identificarFallaNueva.mockReset()
  })

  it("identifica con la falla real y avisa que la SIF tomó el nombre", async () => {
    listarFallasNuevas.mockResolvedValueOnce({ ok: true, valor: [item({ sifCodigo: "SIF20261113_2", sifParadas: 3 })] }).mockResolvedValue({ ok: true, valor: [] })
    identificarFallaNueva.mockResolvedValue({ ok: true, valor: { paradas: 3, sif: "SIF20261113_2", unida: false } })
    render(<ColaFallasNuevas usuario="jefe" editable />)
    await userEvent.click(await screen.findByRole("button", { name: "Identificar" }))
    const guardar = () => screen.getAllByRole("button", { name: "Identificar" }).at(-1)!
    expect(guardar()).toBeDisabled()
    // La «Falla nueva» no sirve para identificar.
    await userEvent.click(screen.getByText("Elegir Falla nueva"))
    expect(guardar()).toBeDisabled()
    await userEvent.click(screen.getByText("Elegir real"))
    await userEvent.click(guardar())
    await waitFor(() => expect(identificarFallaNueva).toHaveBeenCalledWith("jefe", "p1", "real"))
    expect(await screen.findByRole("status")).toHaveTextContent("3 paradas identificadas como Sensor de nivel (BTD.NIV.SEN-3). Solicitud SIF20261113_2 con el nuevo nombre.")
  })

  it("una «Parada nueva» (sin falla) solo se descarta", async () => {
    listarFallasNuevas.mockResolvedValue({ ok: true, valor: [item({ fallaId: null, origen: "LNPE" })] })
    render(<ColaFallasNuevas usuario="jefe" editable />)
    expect(await screen.findByRole("button", { name: "Descartar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Identificar" })).toBeNull()
  })

  it("sin permiso de editar no hay Identificar", async () => {
    listarFallasNuevas.mockResolvedValue({ ok: true, valor: [item()] })
    render(<ColaFallasNuevas usuario="ana" editable={false} />)
    expect(await screen.findByText("Se botó el nivel")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Identificar" })).toBeNull()
  })
})
