import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import InventarioDiario from "@/pages/apps/InventarioDiario"
import type { Session } from "@/lib/auth"
import type { FilaInventario, MovimientoInventario } from "@/lib/inventario"

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
const sesion = { actual: null as Session | null }
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: sesion.actual }) }))

const api = { listar: vi.fn(), registrar: vi.fn(), historial: vi.fn() }
vi.mock("@/lib/inventario", () => ({
  inventarioReal: {
    listar: (...a: unknown[]) => api.listar(...a),
    registrar: (...a: unknown[]) => api.registrar(...a),
    historial: (...a: unknown[]) => api.historial(...a),
  },
}))

const fila = (over: Partial<FilaInventario>): FilaInventario => ({
  areaCodigo: "ASEPTICO",
  saborId: "s1",
  saborNombre: "Durazno",
  familiaNombre: "Clasicos",
  saborActivo: true,
  unidad: "tambores",
  ultimoEn: "2026-10-05T11:00:00Z",
  ultimoPor: "Ana Analista",
  ultimoContado: 40,
  ultimoLlego: 0,
  ultimaDiferencia: -1,
  consumido: 12,
  preparaciones: 3,
  saldo: 28,
  ...over,
})
const FILAS = [
  fila({}),
  fila({ saborId: "s2", saborNombre: "Té de Limón", unidad: "kits", saldo: 15, consumido: 0, preparaciones: 0, ultimaDiferencia: 0 }),
  fila({ saborId: "s3", saborNombre: "Naranja", saldo: null, ultimoEn: null, ultimoPor: null, ultimoContado: null, ultimaDiferencia: null, consumido: null, preparaciones: null }),
]

const SUPERVISOR = { username: "sup", rol: "SUPERVISOR", area: "ASEPTICO", permisos: ["INVENTARIO_CARGAR"] } as unknown as Session
const SIN_PERMISO = { username: "jefe2", rol: "SUPERVISOR", area: "ASEPTICO", permisos: [] } as unknown as Session
const SUPERADMIN = { username: "admin", rol: "SUPERADMINISTRADOR", area: null, permisos: [] } as unknown as Session

beforeEach(() => {
  sesion.actual = SUPERVISOR
  api.listar.mockReset().mockResolvedValue(FILAS)
  api.registrar.mockReset().mockResolvedValue({ ok: true })
  api.historial.mockReset().mockResolvedValue([])
})

const renderPagina = (ruta = "/inventario") =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <InventarioDiario />
    </MemoryRouter>,
  )
const filaDe = (sabor: string) => within(screen.getByText(sabor).closest("tr") as HTMLElement)

describe("Inventario diario — saldos", () => {
  it("muestra lo que debería haber, el último conteo y lo usado desde entonces", async () => {
    renderPagina()
    await screen.findByText("Durazno")
    expect(api.listar).toHaveBeenCalledWith("sup", null)
    const d = filaDe("Durazno")
    expect(d.getByText("28")).toBeInTheDocument()
    expect(d.getByText(/Ana Analista/)).toBeInTheDocument()
    expect(d.getByText("Falta 1 tambor")).toBeInTheDocument()
    expect(d.getByText("12 tambores · 3 prep.")).toBeInTheDocument()
    expect(filaDe("Naranja").getByText("Sin conteo")).toBeInTheDocument()
    expect(filaDe("Té de Limón").getByText("kits")).toBeInTheDocument()
  })

  it("un clic en el sabor abre su historial", async () => {
    const u = userEvent.setup()
    const movs: MovimientoInventario[] = [
      { tipo: "CONSUMO", en: "2026-10-05T12:00:00Z", cantidad: 4, sistema: null, llego: null, diferencia: null, detalle: "Lote 0003 · Turno T1-0510 · Tanque 2", usuarioNombre: "Juan" },
      { tipo: "CONTEO", en: "2026-10-05T11:00:00Z", cantidad: 40, sistema: 21, llego: 20, diferencia: -1, detalle: null, usuarioNombre: "Ana Analista" },
    ]
    api.historial.mockResolvedValue(movs)
    renderPagina()
    await u.click(await screen.findByText("Durazno"))
    expect(await screen.findByText(/Preparación: −4 tambores/)).toBeInTheDocument()
    expect(screen.getByText(/Lote 0003 · Turno T1-0510 · Tanque 2/)).toBeInTheDocument()
    expect(screen.getByText(/Conteo: 40 tambores/)).toBeInTheDocument()
    expect(screen.getByText(/llegaron 20/)).toBeInTheDocument()
    expect(api.historial).toHaveBeenCalledWith("sup", "s1", null)
  })

  it("busca por sabor", async () => {
    const u = userEvent.setup()
    renderPagina()
    await screen.findByText("Durazno")
    await u.type(screen.getByPlaceholderText("Buscar sabor"), "limón")
    expect(screen.queryByText("Durazno")).not.toBeInTheDocument()
    expect(screen.getByText("Té de Limón")).toBeInTheDocument()
  })

  it("sin permiso solo mira", async () => {
    sesion.actual = SIN_PERMISO
    renderPagina()
    await screen.findByText("Durazno")
    expect(screen.queryByRole("button", { name: /Hacer inventario diario/ })).not.toBeInTheDocument()
  })

  it("el Super Administrador elige el área", async () => {
    const u = userEvent.setup()
    sesion.actual = SUPERADMIN
    renderPagina()
    await screen.findByText("Durazno")
    expect(api.listar).toHaveBeenLastCalledWith("admin", "ASEPTICO")
    await u.click(screen.getByRole("button", { name: "Área de Pruebas" }))
    await waitFor(() => expect(api.listar).toHaveBeenLastCalledWith("admin", "PRUEBAS"))
  })
})

describe("Inventario diario — contar", () => {
  it("Coincide, llegó y contado: muestra la diferencia y guarda solo lo escrito", async () => {
    const u = userEvent.setup()
    renderPagina()
    await screen.findByText("Durazno")
    await u.click(screen.getByRole("button", { name: /Hacer inventario diario/ }))
    expect(screen.getByRole("button", { name: /Guardar inventario \(0\)/ })).toBeDisabled()

    // Durazno: llegaron 20, se cuentan 46 → esperaba 48 → faltan 2.
    await u.type(screen.getByLabelText("Llegó de Durazno"), "20")
    await u.type(screen.getByLabelText("Contado de Durazno"), "46")
    expect(filaDe("Durazno").getByText("Faltan 2 tambores")).toBeInTheDocument()

    // Té de Limón: coincide con el sistema.
    await u.click(screen.getByRole("button", { name: "Coincide Té de Limón" }))
    expect(screen.getByLabelText("Contado de Té de Limón")).toHaveValue(15)
    expect(filaDe("Té de Limón").getByText("Cuadra")).toBeInTheDocument()

    // Naranja: primer conteo, sin "Coincide".
    expect(filaDe("Naranja").getByText("Primer conteo")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Coincide Naranja" })).not.toBeInTheDocument()

    await u.click(screen.getByRole("button", { name: /Guardar inventario \(2\)/ }))
    expect(api.registrar).toHaveBeenCalledWith(
      "sup",
      [
        { saborId: "s1", contado: 46, llego: 20 },
        { saborId: "s2", contado: 15, llego: 0 },
      ],
      null,
    )
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("button", { name: /Hacer inventario diario/ })).toBeInTheDocument()
  })

  it("si llegó algo y no se contó, no deja guardar", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Hacer inventario diario/ }))
    await u.type(screen.getByLabelText("Llegó de Durazno"), "5")
    expect(filaDe("Durazno").getByText("Falta lo contado.")).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: "Coincide Té de Limón" }))
    expect(screen.getByRole("button", { name: /Guardar inventario/ })).toBeDisabled()
  })

  it("si el servidor rechaza, muestra el error y no pierde lo escrito", async () => {
    const u = userEvent.setup()
    api.registrar.mockResolvedValue({ ok: false, error: "No tienes permiso para cargar el inventario." })
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Hacer inventario diario/ }))
    await u.type(screen.getByLabelText("Contado de Durazno"), "28")
    await u.click(screen.getByRole("button", { name: /Guardar inventario \(1\)/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso para cargar el inventario.")
    expect(screen.getByLabelText("Contado de Durazno")).toHaveValue(28)
  })

  it("Cancelar vuelve a los saldos sin guardar", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Hacer inventario diario/ }))
    await u.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(api.registrar).not.toHaveBeenCalled()
    expect(screen.getByText("Debería haber")).toBeInTheDocument()
  })
})

describe("Inventario diario — modo de muestra (?demo=1)", () => {
  it("usa datos inventados, deja contar y no llama a la base", async () => {
    const u = userEvent.setup()
    sesion.actual = SIN_PERMISO
    renderPagina("/inventario?demo=1")
    expect(await screen.findByText(/Modo de muestra/)).toBeInTheDocument()
    expect(await screen.findByText("Durazno")).toBeInTheDocument()
    expect(filaDe("Durazno").getByText("28")).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: /Hacer inventario diario/ }))
    await u.type(screen.getByLabelText("Llegó de Durazno"), "10")
    await u.type(screen.getByLabelText("Contado de Durazno"), "37")
    expect(filaDe("Durazno").getByText("Falta 1 tambor")).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: /Guardar inventario \(1\)/ }))
    expect(await screen.findByText("37")).toBeInTheDocument()
    expect(api.listar).not.toHaveBeenCalled()
    expect(api.registrar).not.toHaveBeenCalled()
  })
})
