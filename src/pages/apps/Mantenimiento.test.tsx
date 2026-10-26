import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Parada } from "@/lib/paradas"

/*
 * Mantenimiento: lista las fallas que el supervisor paró sin saber la causa y
 * las clasifica con el código y qué se hizo (clasificar_falla).
 */

vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/components/lineas/AnimacionLinea", () => ({ AnimacionLinea: () => <div data-testid="animacion" /> }))
vi.mock("@/components/BuscadorTipoParada", () => ({
  BuscadorTipoParada: ({ onElegir }: { onElegir: (t: unknown) => void }) => (
    <button type="button" onClick={() => onElegir({ codigo: "FALLA_NIVEL_BTD", nombre: "Falla de Nivel del BTD", clase: "NO_PROGRAMADA" })}>
      Elegir tipo
    </button>
  ),
}))
vi.mock("@/lib/paradasEquipos", () => ({ useEquiposParadas: () => [] }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { username: "mtto1", area: "MANTENIMIENTO" } }) }))
vi.mock("@/lib/catalogosLive", () => ({ useCatalogosLive: () => ({ lineas: [{ codigo: "LINEA_1", nombre: "Línea 1", activo: true }] }) }))
vi.mock("@/lib/panelProduccion", () => ({ obtenerEstadoPlantaActual: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/produccion/ajustes", () => ({ paradasQueDetienenLineas: vi.fn().mockResolvedValue([]) }))
// Como el hook real, refrescar es la misma función en cada render.
const produccion = vi.hoisted(() => ({ corridas: [], lineasEstado: [], refrescar: async () => {} }))
vi.mock("@/lib/produccion/useProduccion", () => ({ useProduccion: () => produccion }))

const listarParadas = vi.fn()
const clasificarFalla = vi.fn()
const finalizarFalla = vi.fn()
vi.mock("@/lib/paradas", async (orig) => ({
  ...(await orig<object>()),
  listarParadas: (...a: unknown[]) => listarParadas(...a),
  clasificarFalla: (...a: unknown[]) => clasificarFalla(...a),
  finalizarFalla: (...a: unknown[]) => finalizarFalla(...a),
}))

const { default: Mantenimiento } = await import("./Mantenimiento")

function parada(over: Partial<Parada> = {}): Parada {
  return {
    id: "p1",
    clase: "NO_PROGRAMADA",
    origen: "MANUAL",
    lineaCodigo: "LINEA_1",
    turnoTipo: "TURNO_1",
    tipoCodigo: "FALLA_SIN_ESPECIFICAR",
    tipoNombre: "Falla sin especificar",
    tiempoGuiaMin: null,
    nota: "Ruido en la llenadora",
    justificacionDesvio: null,
    inicio: "2026-10-26T08:00:00",
    fin: "2026-10-26T08:40:00",
    supervisorNombre: "Javier",
    pendiente: false,
    solucion: null,
    ...over,
  }
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre })

beforeEach(() => {
  listarParadas.mockReset()
  clasificarFalla.mockReset()
  clasificarFalla.mockResolvedValue({ ok: true })
  finalizarFalla.mockReset()
  finalizarFalla.mockResolvedValue({ ok: true })
})

function renderPagina() {
  render(
    <MemoryRouter>
      <Mantenimiento />
    </MemoryRouter>,
  )
}

describe("Mantenimiento", () => {
  it("lista solo las fallas sin clasificar, con lo que escribió el supervisor", async () => {
    listarParadas.mockResolvedValue([
      parada(),
      parada({ id: "p2", tipoCodigo: "FALLA_NIVEL_BTD", tipoNombre: "Falla de Nivel", nota: "Ya clasificada" }),
      parada({ id: "p3", pendiente: true, nota: "Un +1 sin minutos" }),
    ])
    renderPagina()
    expect(await screen.findByText("Ruido en la llenadora")).toBeInTheDocument()
    expect(screen.getByText("La reportó Javier")).toBeInTheDocument()
    expect(screen.getByText(/40 min/)).toBeInTheDocument()
    expect(screen.queryByText("Ya clasificada")).not.toBeInTheDocument()
    expect(screen.queryByText("Un +1 sin minutos")).not.toBeInTheDocument()
  })

  it("Clasificar pide el código y qué se hizo, y lo manda", async () => {
    const u = userEvent.setup()
    listarParadas.mockResolvedValue([parada()])
    renderPagina()
    await u.click(await screen.findByRole("button", { name: "Clasificar" }))
    expect(boton("Guardar")).toBeDisabled()
    await u.click(boton("Elegir tipo"))
    expect(boton("Guardar")).toBeDisabled()
    await u.type(screen.getByPlaceholderText("Qué se hizo para resolverla"), "Se cambió el sello")
    listarParadas.mockResolvedValue([])
    await u.click(boton("Guardar"))
    await waitFor(() => expect(clasificarFalla).toHaveBeenCalledWith("mtto1", "p1", "FALLA_NIVEL_BTD", "Se cambió el sello", "Mantenimiento"))
    await waitFor(() => expect(screen.getByText("Nada por atender")).toBeInTheDocument())
  })

  it("si el servidor la rechaza, muestra el error y deja el formulario", async () => {
    const u = userEvent.setup()
    clasificarFalla.mockResolvedValue({ ok: false, error: "Esa parada ya está clasificada." })
    listarParadas.mockResolvedValue([parada()])
    renderPagina()
    await u.click(await screen.findByRole("button", { name: "Clasificar" }))
    await u.click(boton("Elegir tipo"))
    await u.type(screen.getByPlaceholderText("Qué se hizo para resolverla"), "x")
    await u.click(boton("Guardar"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa parada ya está clasificada.")
    boton("Guardar")
  })

  it("una falla abierta que termina Mantenimiento se termina (no solo se clasifica)", async () => {
    const u = userEvent.setup()
    listarParadas.mockResolvedValue([parada({ fin: null, laTerminaMantenimiento: true })])
    renderPagina()
    expect(await screen.findByText(/en curso/)).toBeInTheDocument()
    await u.click(boton("Terminar"))
    expect(screen.getByText(/la línea sigue sola/)).toBeInTheDocument()
    await u.click(boton("Elegir tipo"))
    await u.type(screen.getByPlaceholderText("Qué se hizo para resolverla"), "Se cambió el rodamiento")
    await u.click(boton("Terminar falla"))
    await waitFor(() => expect(finalizarFalla).toHaveBeenCalledWith("mtto1", "p1", "FALLA_NIVEL_BTD", "Se cambió el rodamiento", "Mantenimiento"))
    expect(clasificarFalla).not.toHaveBeenCalled()
  })

  it("la falla que tomó un reporte del Sheet trae lo que escribió Mantenimiento", async () => {
    const u = userEvent.setup()
    listarParadas.mockResolvedValue([parada({ solucion: "Mantenimiento — Cambio de mordaza" })])
    renderPagina()
    expect(await screen.findByText("Del Sheet: Mantenimiento — Cambio de mordaza")).toBeInTheDocument()
    await u.click(boton("Clasificar"))
    expect(screen.getByPlaceholderText("Qué se hizo para resolverla")).toHaveValue("Mantenimiento — Cambio de mordaza")
  })
})
