import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PERMISOS } from "@/lib/permisos"
import type { Session } from "@/lib/auth"
import type { PersonalRegistrado } from "@/lib/personal"

/*
 * Pantalla Personal (organigrama por nivel): qué ve un Jefe de Mantenimiento
 * y qué ve quien gestiona la estructura. La base decide lo demás.
 */
let session: Session
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session }) }))
vi.mock("@/lib/catalogosLive", () => ({
  useCatalogosLive: () => ({
    areas: [
      { codigo: "MANTENIMIENTO", nombre: "Mantenimiento", tipo: "APOYO", activo: true, orden: 1, personas: 0 },
      { codigo: "ASEPTICO", nombre: "Aséptico", tipo: "PRODUCCION", activo: true, orden: 2, personas: 0 },
    ],
  }),
}))

const persona = (over: Partial<PersonalRegistrado>): PersonalRegistrado => ({
  id: "x",
  usuario: "x",
  nombre: "X",
  cedula: null,
  puestoId: "p-tec",
  puesto: "Técnico de Mantenimiento",
  areaCodigo: "MANTENIMIENTO",
  nivel: 3,
  titulo: null,
  activo: true,
  gestionable: true,
  ...over,
})
const GENTE = [
  persona({ id: "j", usuario: "jefe.mtto", nombre: "Carlos Jefe", puestoId: "p-jefe", puesto: "Jefe de Mantenimiento", nivel: 1, gestionable: false }),
  persona({ id: "a", usuario: "atorres", nombre: "Ana Torres", cedula: "12345678" }),
  persona({ id: "l", usuario: "lperez", nombre: "Luis Pérez", activo: false }),
]

const listarPersonal = vi.fn()
const listarPuestosAsignables = vi.fn()
const agregarPersonal = vi.fn()
const editarPersonal = vi.fn()
const guardarPermisosExtra = vi.fn()
vi.mock("@/lib/personal", () => ({
  listarPersonal: (...a: unknown[]) => listarPersonal(...a),
  listarPuestosAsignables: (...a: unknown[]) => listarPuestosAsignables(...a),
  listarPermisosExtra: async () => new Map(),
  agregarPersonal: (...a: unknown[]) => agregarPersonal(...a),
  editarPersonal: (...a: unknown[]) => editarPersonal(...a),
  guardarPermisosExtra: (...a: unknown[]) => guardarPermisosExtra(...a),
  restablecerPassword: vi.fn(),
  desactivarPersonal: vi.fn(),
  reactivarPersonal: vi.fn(),
  eliminarPersonal: vi.fn(),
}))
vi.mock("@/lib/estructura", async (orig) => ({
  ...(await orig<object>()),
  listarEstructura: async () => ({
    areas: [],
    permisos: [],
    puestos: [
      { id: "p-jefe", codigo: "JEFE", nombre: "Jefe de Mantenimiento", areaCodigo: "MANTENIMIENTO", nivel: 1, activo: true, todosLosPermisos: false, personas: 1, permisos: ["PERSONAL_GESTIONAR"] },
      { id: "p-tec", codigo: "TEC", nombre: "Técnico de Mantenimiento", areaCodigo: "MANTENIMIENTO", nivel: 3, activo: true, todosLosPermisos: false, personas: 2, permisos: ["PARADAS_REGISTRAR"] },
    ],
  }),
}))

import { PersonalPantalla } from "./PersonalPantalla"

const base = { nombre: "N", cedula: null, esDueno: false, debeCompletarPerfil: false }
const sesionJefe = (): Session =>
  ({ ...base, username: "jefe.mtto", area: "MANTENIMIENTO", rol: "SUPERVISOR", permisos: ["PERSONAL_GESTIONAR", "PARADAS_REGISTRAR", "SIF_GESTIONAR"] }) as unknown as Session
const sesionSuper = (): Session =>
  ({ ...base, username: "local", area: null, rol: "SUPERADMINISTRADOR", permisos: PERMISOS.map((p) => p.codigo) }) as unknown as Session

function abrir() {
  return render(
    <MemoryRouter>
      <PersonalPantalla pagina="/personal" />
    </MemoryRouter>,
  )
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => {
  session = sesionJefe()
  listarPersonal.mockResolvedValue(GENTE)
  listarPuestosAsignables.mockResolvedValue([
    { puestoId: "p-sup", codigo: "SUP", nombre: "Supervisor de Mantenimiento", areaCodigo: "MANTENIMIENTO", nivel: 2 },
    { puestoId: "p-tec", codigo: "TEC", nombre: "Técnico de Mantenimiento", areaCodigo: "MANTENIMIENTO", nivel: 3 },
  ])
})

describe("PersonalPantalla", () => {
  it("un Jefe de Mantenimiento no ve el menú de áreas y sí las franjas Jefatura y Operación", async () => {
    abrir()
    expect(await screen.findByText("Ana Torres")).toBeTruthy()
    expect(screen.queryByText(/Áreas y puestos/)).toBeNull()
    expect(screen.queryByRole("navigation", { name: "Áreas" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Jefatura" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Operación" })).toBeTruthy()
    expect(screen.getByText("Carlos Jefe")).toBeTruthy()
  })

  it("las personas inactivas se ocultan y el botón las muestra y las vuelve a ocultar", async () => {
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByText("Ana Torres")).toBeTruthy()
    expect(screen.queryByText("Luis Pérez")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Ver inactivas (1)" }))
    expect(await screen.findByText("Luis Pérez")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Ocultar inactivas" }))
    expect(screen.queryByText("Luis Pérez")).toBeNull()
  })

  it("el select de Puesto ofrece solo los puestos asignables", async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByText("Ana Torres"))
    await user.click(await screen.findByRole("combobox", { name: "Puesto" }))
    const opciones = within(await screen.findByRole("listbox")).getAllByRole("option").map((o) => o.textContent)
    expect(opciones).toEqual(["Supervisor de Mantenimiento", "Técnico de Mantenimiento"])
  })

  it("las casillas de permisos extra son solo las de la sesión que el puesto no tiene", async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByText("Ana Torres"))
    const grupo = await screen.findByRole("group", { name: "Permisos extra" })
    const nombres = within(grupo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))
    expect(nombres).toEqual(["Gestionar personal", "Gestionar solicitudes de intervención de falla"])
    // Los del puesto se muestran aparte, solo para leer.
    expect(await screen.findByText("Registrar paradas")).toBeTruthy()
  })

  it("una persona que no se puede gestionar abre el panel sin Guardar", async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByText("Carlos Jefe"))
    expect(await screen.findByRole("complementary", { name: /Carlos Jefe/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Desactivar" })).toBeNull()
  })

  it("con ESTRUCTURA_GESTIONAR aparece el menú de áreas y el botón Eliminar", async () => {
    session = sesionSuper()
    const user = userEvent.setup()
    abrir()
    expect(await screen.findByRole("button", { name: "Mantenimiento 3" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Áreas y puestos/ }).getAttribute("href")).toBe("/areas-puestos")
    await user.click(await screen.findByText("Ana Torres"))
    expect(await screen.findByRole("button", { name: "Eliminar" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Eliminar" }))
    expect(screen.getByText("¿Seguro?")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sí, eliminar" })).toBeTruthy()
  })

  it("la propia cuenta: edita nombre y cédula, pero no el puesto, los extras, Desactivar ni Eliminar", async () => {
    session = sesionSuper()
    listarPersonal.mockResolvedValue([
      ...GENTE,
      persona({ id: "yo", usuario: "local", nombre: "Andrea Local", puestoId: "p-jefe", puesto: "Jefe de Mantenimiento", nivel: 1 }),
    ])
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByText("Andrea Local"))
    const panel = await screen.findByRole("complementary", { name: /Andrea Local/ })
    expect(within(panel).getByRole("button", { name: "Guardar" })).toBeTruthy()
    expect(within(panel).getByLabelText("Nombre")).toBeTruthy()
    expect(within(panel).queryByRole("combobox", { name: "Puesto" })).toBeNull()
    expect(within(panel).getByText("Tu puesto y tus permisos extra los cambia otra persona.")).toBeTruthy()
    expect(within(panel).queryByRole("button", { name: "Desactivar" })).toBeNull()
    expect(within(panel).queryByRole("button", { name: "Eliminar" })).toBeNull()
    expect(within(panel).queryAllByRole("checkbox")).toHaveLength(0)
  })

  it("escribir «tor» en el buscador marca la tarjeta de Ana Torres", async () => {
    const user = userEvent.setup()
    abrir()
    await screen.findByText("Ana Torres")
    await user.type(screen.getByRole("searchbox", { name: "Buscar persona" }), "tor")
    await waitFor(() => expect(screen.getByRole("button", { name: /Ana Torres/ }).getAttribute("data-resaltada")).toBe("true"))
    expect(screen.getByRole("button", { name: /Carlos Jefe/ }).getAttribute("data-resaltada")).toBeNull()
  })

  it("el botón Tabla muestra la misma gente agrupada por nivel", async () => {
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByRole("button", { name: "Tabla" }))
    expect(await screen.findByRole("table")).toBeTruthy()
    expect(screen.getByRole("cell", { name: "Ana Torres" })).toBeTruthy()
  })

  it("si la llamada se cae (sin red), el panel avisa y los botones quedan activos", async () => {
    editarPersonal.mockRejectedValue(new Error("fetch failed"))
    const user = userEvent.setup()
    abrir()
    await user.click(await screen.findByText("Ana Torres"))
    await user.click(await screen.findByRole("button", { name: "Guardar" }))
    expect(await screen.findByText("No se pudo conectar. Intenta de nuevo.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("si la persona se crea pero fallan los permisos extra, se actualiza la lista y se avisa", async () => {
    agregarPersonal.mockResolvedValue({ ok: true, id: "a" })
    guardarPermisosExtra.mockResolvedValue({ ok: false, error: "No se pudieron guardar los permisos." })
    const user = userEvent.setup()
    abrir()
    await screen.findByText("Ana Torres")
    const antes = listarPersonal.mock.calls.length
    await user.click(screen.getByRole("button", { name: "Persona" }))
    await user.click(await screen.findByRole("combobox", { name: "Puesto" }))
    await user.click(await screen.findByRole("option", { name: "Técnico de Mantenimiento" }))
    await user.type(screen.getByLabelText("Nombre"), "Nuevo Nombre")
    await user.type(screen.getByLabelText("Usuario"), "nnuevo")
    await user.type(screen.getByLabelText("Contraseña inicial"), "2580")
    await user.click(screen.getByRole("checkbox", { name: "Gestionar personal" }))
    await user.click(screen.getByRole("button", { name: "Agregar" }))
    expect(await screen.findByText(/La persona se creó, pero no se guardaron los permisos extra: No se pudieron guardar/)).toBeTruthy()
    expect(listarPersonal.mock.calls.length).toBeGreaterThan(antes)
    // El panel queda en modo edición: ya no se ofrece «Agregar».
    expect(screen.queryByRole("button", { name: "Agregar" })).toBeNull()
  })
})
