import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import InventarioDiario from "@/pages/apps/InventarioDiario"
import type { Session } from "@/lib/auth"
import type { InventarioHecho, ItemInventario, MovimientoInventario } from "@/lib/inventario"
import { fechaPlanta } from "@/lib/tiempoPlanta"

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

const api = { listar: vi.fn(), inventarios: vi.fn(), registrar: vi.fn(), historial: vi.fn() }
vi.mock("@/lib/inventario", () => ({
  inventarioReal: {
    listar: (...a: unknown[]) => api.listar(...a),
    inventarios: (...a: unknown[]) => api.inventarios(...a),
    registrar: (...a: unknown[]) => api.registrar(...a),
    historial: (...a: unknown[]) => api.historial(...a),
  },
}))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const HOY_0710 = `${fechaPlanta()}T11:10:00Z`
const item = (over: Partial<ItemInventario> & Pick<ItemInventario, "item" | "tipo" | "nombre" | "unidad">): ItemInventario => ({
  areaCodigo: "ASEPTICO",
  seccion: over.tipo === "EMPAQUE" ? "EMPAQUE" : "MATERIA_PRIMA",
  saborId: null,
  empaqueCodigo: null,
  ultimoEn: null,
  ultimoPor: null,
  ultimoMomento: null,
  ultimoContado: null,
  ultimaDiferencia: null,
  consumido: null,
  preparaciones: null,
  saldo: null,
  ...over,
})
const contado = { ultimoEn: HOY_0710, ultimoPor: "Ana Analista", ultimoMomento: "MANANA" as const }
const ITEMS: ItemInventario[] = [
  item({ item: "PULPA:s1", tipo: "PULPA", saborId: "s1", nombre: "Durazno", unidad: "tambores", ...contado, ultimoContado: 40, consumido: 12, preparaciones: 3, saldo: 28, ultimaDiferencia: -1 }),
  item({ item: "KITS:s1", tipo: "KITS", saborId: "s1", nombre: "Durazno", unidad: "kits", ...contado, ultimoContado: 10, saldo: 10 }),
  item({ item: "PULPA:s2", tipo: "PULPA", saborId: "s2", nombre: "Naranja", unidad: "tambores" }),
  item({ item: "KITS:s2", tipo: "KITS", saborId: "s2", nombre: "Naranja", unidad: "kits" }),
  item({ item: "EMPAQUE:CAJAS_1000", tipo: "EMPAQUE", empaqueCodigo: "CAJAS_1000", nombre: "Cajas 1000 ml", unidad: "cajas", ...contado, saldo: 850 }),
  item({ item: "EMPAQUE:TAPAS_BLANCAS", tipo: "EMPAQUE", empaqueCodigo: "TAPAS_BLANCAS", nombre: "Tapas blancas", unidad: "unidades" }),
]
const HECHOS: InventarioHecho[] = [{ id: "i1", momento: "MANANA", en: HOY_0710, usuarioNombre: "Ana Analista", items: 3, faltantes: 1, sobrantes: 0 }]

const SUPERVISOR = { username: "sup", rol: "SUPERVISOR", area: "ASEPTICO", permisos: ["INVENTARIO_CARGAR"] } as unknown as Session
const SIN_PERMISO = { username: "otro", rol: "SUPERVISOR", area: "ASEPTICO", permisos: [] } as unknown as Session
const SUPERADMIN = { username: "admin", rol: "SUPERADMINISTRADOR", area: null, permisos: [] } as unknown as Session

beforeEach(() => {
  sesion.actual = SUPERVISOR
  api.listar.mockReset().mockResolvedValue(ITEMS)
  api.inventarios.mockReset().mockResolvedValue(HECHOS)
  api.registrar.mockReset().mockResolvedValue({ ok: true })
  api.historial.mockReset().mockResolvedValue([])
})

const renderPagina = (ruta = "/inventario") =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <InventarioDiario />
    </MemoryRouter>,
  )
const filaDe = (texto: string) => within(screen.getByText(texto).closest("tr") as HTMLElement)
async function elegir(u: ReturnType<typeof userEvent.setup>, combo: HTMLElement, opcion: string) {
  await u.click(combo)
  await u.click(await screen.findByRole("option", { name: opcion }))
}

describe("Inventario diario — lo que hay", () => {
  it("muestra materia prima (solo lo contado) y todo el empaque", async () => {
    renderPagina()
    await screen.findByText("Durazno")
    expect(api.listar).toHaveBeenCalledWith("sup", null)
    const d = filaDe("Durazno")
    expect(d.getByText("28")).toBeInTheDocument()
    expect(d.getByText("usó 12 tambores")).toBeInTheDocument()
    expect(d.getByText("Falta 1 tambor")).toBeInTheDocument()
    expect(d.getByText("10")).toBeInTheDocument()
    expect(screen.queryByText("Naranja")).not.toBeInTheDocument()
    expect(filaDe("Cajas 1000 ml").getByText("850 cajas")).toBeInTheDocument()
    expect(filaDe("Tapas blancas").getAllByText("—")).toHaveLength(2)
  })

  it("dice si ya se hizo el de la mañana y el de la tarde de hoy", async () => {
    renderPagina()
    expect(await screen.findByText(/Hoy, inventario de la mañana:/)).toHaveTextContent("Ana Analista · 1 con faltante")
    expect(screen.getByText(/Hoy, inventario de la tarde:/)).toHaveTextContent("pendiente")
  })

  it("un clic en el sabor abre el historial de pulpa y kits", async () => {
    const u = userEvent.setup()
    const movs: MovimientoInventario[] = [
      { movimiento: "CONSUMO", en: HOY_0710, momento: null, cantidad: 4, sistema: null, diferencia: null, detalle: "Lote 0003 · Turno T1-0510 · Tanque 2", usuarioNombre: "Juan" },
      { movimiento: "CONTEO", en: HOY_0710, momento: "MANANA", cantidad: 40, sistema: 41, diferencia: -1, detalle: null, usuarioNombre: "Ana Analista" },
    ]
    api.historial.mockResolvedValue(movs)
    renderPagina()
    await u.click(await screen.findByText("Durazno"))
    expect((await screen.findAllByText(/Preparación: −4 tambores/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Inventario de la mañana: 40/).length).toBeGreaterThan(0)
    expect(api.historial).toHaveBeenCalledWith("sup", ITEMS[0], null)
    expect(api.historial).toHaveBeenCalledWith("sup", ITEMS[1], null)
  })

  it("sin permiso solo mira", async () => {
    sesion.actual = SIN_PERMISO
    renderPagina()
    await screen.findByText("Durazno")
    expect(screen.queryByRole("button", { name: /Inventario de la mañana/ })).not.toBeInTheDocument()
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
  it("de la mañana: se elige de la lista, muestra la diferencia de pulpa y guarda solo lo escrito", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Inventario de la mañana/ }))
    expect(screen.getByRole("heading", { name: "Inventario de la mañana" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Guardar inventario de la mañana" })).toBeDisabled()

    // Materia prima: Durazno, pulpa 26 (el sistema espera 28 → faltan 2), kits 9.
    await elegir(u, screen.getByLabelText("Sabor"), "Durazno")
    expect(screen.getByText(/El sistema espera 28 tambores/)).toBeInTheDocument()
    await u.type(screen.getByLabelText("Pulpa"), "26")
    expect(screen.getByText(/Faltan 2 tambores/)).toBeInTheDocument()
    await u.type(screen.getByLabelText("Kits"), "9")

    // Otro sabor: Naranja ya no ofrece Durazno; primer conteo.
    await u.click(screen.getByRole("button", { name: /Agregar sabor/ }))
    await u.click(screen.getAllByLabelText("Sabor")[1])
    expect(screen.queryByRole("option", { name: "Durazno" })).not.toBeInTheDocument()
    await u.click(screen.getByRole("option", { name: "Naranja" }))
    expect(screen.getByText("Primer conteo de este sabor.")).toBeInTheDocument()
    await u.type(screen.getAllByLabelText("Pulpa")[1], "30")

    // Empaque: Cajas 1000 ml = 800.
    await elegir(u, screen.getByLabelText("Material"), "Cajas 1000 ml")
    expect(screen.getByText("Cantidad (cajas)")).toBeInTheDocument()
    await u.type(screen.getByLabelText("Cantidad"), "800")

    await u.click(screen.getByRole("button", { name: "Guardar inventario de la mañana" }))
    expect(api.registrar).toHaveBeenCalledWith(
      "sup",
      "MANANA",
      [
        { tipo: "PULPA", saborId: "s1", empaqueCodigo: null, contado: 26 },
        { tipo: "KITS", saborId: "s1", empaqueCodigo: null, contado: 9 },
        { tipo: "PULPA", saborId: "s2", empaqueCodigo: null, contado: 30 },
        { tipo: "EMPAQUE", saborId: null, empaqueCodigo: "CAJAS_1000", contado: 800 },
      ],
      null,
    )
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("button", { name: /Inventario de la tarde/ })).toBeInTheDocument()
  })

  it("de la tarde: se guarda como TARDE", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Inventario de la tarde/ }))
    await elegir(u, screen.getByLabelText("Material"), "Tapas blancas")
    await u.type(screen.getByLabelText("Cantidad"), "24000")
    await u.click(screen.getByRole("button", { name: "Guardar inventario de la tarde" }))
    expect(api.registrar).toHaveBeenCalledWith("sup", "TARDE", [{ tipo: "EMPAQUE", saborId: null, empaqueCodigo: "TAPAS_BLANCAS", contado: 24000 }], null)
  })

  it("una fila a medias no deja guardar; quitarla sí", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Inventario de la mañana/ }))
    await elegir(u, screen.getByLabelText("Sabor"), "Durazno")
    expect(screen.getByText("Escribe la pulpa o los kits.")).toBeInTheDocument()
    await elegir(u, screen.getByLabelText("Material"), "Cajas 1000 ml")
    await u.type(screen.getByLabelText("Cantidad"), "800")
    expect(screen.getByRole("button", { name: "Guardar inventario de la mañana" })).toBeDisabled()
    await u.click(screen.getByRole("button", { name: "Quitar sabor" }))
    expect(screen.getByRole("button", { name: "Guardar inventario de la mañana" })).toBeEnabled()
  })

  it("si el servidor rechaza, muestra el error y no pierde lo escrito", async () => {
    const u = userEvent.setup()
    api.registrar.mockResolvedValue({ ok: false, error: "No tienes permiso para cargar el inventario." })
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Inventario de la mañana/ }))
    await elegir(u, screen.getByLabelText("Material"), "Cajas 1000 ml")
    await u.type(screen.getByLabelText("Cantidad"), "800")
    await u.click(screen.getByRole("button", { name: "Guardar inventario de la mañana" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No tienes permiso para cargar el inventario.")
    expect(screen.getByLabelText("Cantidad")).toHaveValue(800)
  })

  it("Cancelar vuelve sin guardar", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(await screen.findByRole("button", { name: /Inventario de la mañana/ }))
    await u.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(api.registrar).not.toHaveBeenCalled()
    expect(screen.getByText("Material de empaque")).toBeInTheDocument()
  })
})

describe("Inventario diario — modo de muestra (?demo=1)", () => {
  it("usa datos inventados, deja contar y no llama a la base", async () => {
    const u = userEvent.setup()
    sesion.actual = SIN_PERMISO
    renderPagina("/inventario?demo=1")
    expect(await screen.findByText(/Modo de muestra/)).toBeInTheDocument()
    expect(filaDe("Durazno").getByText("28")).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: /Inventario de la tarde/ }))
    await elegir(u, screen.getByLabelText("Sabor"), "Durazno")
    await u.type(screen.getByLabelText("Pulpa"), "27")
    expect(screen.getByText(/Falta 1 tambor/)).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: "Guardar inventario de la tarde" }))
    expect(await screen.findByText(/Hoy, inventario de la tarde:/)).not.toHaveTextContent("pendiente")
    expect(filaDe("Durazno").getByText("27")).toBeInTheDocument()
    expect(api.listar).not.toHaveBeenCalled()
    expect(api.registrar).not.toHaveBeenCalled()
  })
})
