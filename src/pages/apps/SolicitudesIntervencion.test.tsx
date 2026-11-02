import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SolicitudesIntervencion from "@/pages/apps/SolicitudesIntervencion"
import type { Session } from "@/lib/auth"
import type { ConfigSif } from "@/lib/sif"

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p data-testid="descripcion">{description}</p>
      {children}
    </div>
  ),
}))
// El detalle arrastra el PDF de la solicitud (pdfjs), que no hace falta para estas pruebas.
vi.mock("@/components/sif/DetalleSif", () => ({ DetalleSif: () => null }))
const sesion = { actual: null as Session | null }
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: sesion.actual }) }))
vi.mock("@/lib/paradasCatalogo", async (importOriginal) => ({ ...(await importOriginal<object>()), useCatalogoParadas: () => undefined }))
vi.mock("@/lib/catalogosLive", () => ({
  useCatalogosLive: () => ({
    areas: [
      { codigo: "ASEPTICO", nombre: "Aséptico", tipo: "PRODUCCION", activo: true, orden: 1, personas: 0 },
      { codigo: "PRUEBAS", nombre: "Pruebas", tipo: "PRODUCCION", activo: true, orden: 5, personas: 0 },
      { codigo: "MANTENIMIENTO", nombre: "Mantenimiento", tipo: "APOYO", activo: true, orden: 2, personas: 0 },
    ],
  }),
}))

const api = { listar: vi.fn(), leer: vi.fn(), guardar: vi.fn() }
vi.mock("@/lib/sif", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listarSif: (...a: unknown[]) => api.listar(...a),
  leerConfigSif: (...a: unknown[]) => api.leer(...a),
  guardarConfigSif: (...a: unknown[]) => api.guardar(...a),
}))

function sesionCon(permisos: Session["permisos"], extra: Partial<Session> = {}): Session {
  return { username: "jefe", nombre: "Jefe", cedula: null, area: "MANTENIMIENTO", rol: "MANTENIMIENTO", esDueno: false, permisos, debeCompletarPerfil: false, ...extra } as Session
}
const POR_DEFECTO: ConfigSif = { ventana: "DIA", inspeccionEn: 3, intervencionEn: 4 }

function pintar() {
  return render(
    <MemoryRouter>
      <SolicitudesIntervencion />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listar.mockResolvedValue({ ok: true, data: [] })
  api.leer.mockResolvedValue({ ok: true, data: POR_DEFECTO })
  api.guardar.mockResolvedValue({ ok: true })
})

describe("Solicitudes de Intervención: configurar la frecuencia", () => {
  it("el botón «Configurar SIF» solo aparece con el permiso", async () => {
    sesion.actual = sesionCon(["SIF_GESTIONAR"])
    const { unmount } = pintar()
    await waitFor(() => expect(api.leer).toHaveBeenCalled())
    expect(screen.queryByRole("button", { name: /configurar sif/i })).toBeNull()
    unmount()

    sesion.actual = sesionCon(["SIF_GESTIONAR", "SIF_CONFIGURAR"])
    pintar()
    expect(await screen.findByRole("button", { name: /configurar sif/i })).toBeTruthy()
  })

  it("la descripción del encabezado sale de la configuración del área", async () => {
    sesion.actual = sesionCon([])
    api.leer.mockResolvedValue({ ok: true, data: { ventana: "TURNO", inspeccionEn: 3, intervencionEn: 4 } })
    pintar()
    await waitFor(() => expect(screen.getByTestId("descripcion").textContent).toBe("Fallas repetidas en el turno: inspección a la 3.ª, intervención a la 4.ª"))
    // Mantenimiento mira el área de Aséptico.
    expect(api.leer).toHaveBeenCalledWith("jefe", "ASEPTICO")
  })

  it("Pruebas lee y guarda el área PRUEBAS", async () => {
    sesion.actual = sesionCon(["SIF_CONFIGURAR"], { area: "PRUEBAS" })
    pintar()
    await waitFor(() => expect(api.leer).toHaveBeenCalledWith("jefe", "PRUEBAS"))
  })

  it("al elegir Por turno y 2 / 3 la frase cambia y Guardar manda esos valores", async () => {
    const user = userEvent.setup()
    sesion.actual = sesionCon(["SIF_CONFIGURAR"])
    pintar()
    await user.click(await screen.findByRole("button", { name: /configurar sif/i }))
    expect(screen.getByTestId("frase-control").textContent).toBe("La misma falla 3 veces en un día → Inspección; a la 4.ª → Intervención.")

    await user.click(screen.getByRole("button", { name: "Por turno" }))
    await user.click(screen.getByRole("button", { name: /una vez menos: inspección/i }))
    await user.click(screen.getByRole("button", { name: /una vez menos: intervención/i }))
    expect(screen.getByTestId("frase-control").textContent).toBe("La misma falla 2 veces en un turno → Inspección; a la 3.ª → Intervención.")
    expect(screen.getByText(/las solicitudes que ya existen no cambian/i)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(api.guardar).toHaveBeenCalledTimes(1))
    expect(api.guardar).toHaveBeenCalledWith("jefe", "ASEPTICO", { ventana: "TURNO", inspeccionEn: 2, intervencionEn: 3 }, "Solicitudes de Intervención")
  })

  it("intervención igual o menor que inspección deshabilita Guardar y avisa", async () => {
    const user = userEvent.setup()
    sesion.actual = sesionCon(["SIF_CONFIGURAR"])
    pintar()
    await user.click(await screen.findByRole("button", { name: /configurar sif/i }))
    await user.click(screen.getByRole("button", { name: /una vez más: inspección/i })) // 4 y 4
    expect(screen.getByText("La intervención tiene que ser después de la inspección.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole("button", { name: /una vez más: intervención/i })) // 4 y 5
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("un error del servidor se muestra en español y el panel sigue abierto", async () => {
    const user = userEvent.setup()
    sesion.actual = sesionCon(["SIF_CONFIGURAR"])
    api.guardar.mockResolvedValue({ ok: false, error: "No tienes permiso para configurar las SIF." })
    pintar()
    await user.click(await screen.findByRole("button", { name: /configurar sif/i }))
    await user.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByText("No tienes permiso para configurar las SIF.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy()
  })

  it("quien administra todo elige el área de producción", async () => {
    const user = userEvent.setup()
    sesion.actual = sesionCon([], { rol: "SUPERADMINISTRADOR", area: null })
    pintar()
    await user.click(await screen.findByRole("button", { name: /configurar sif/i }))
    expect(screen.getByRole("button", { name: "Aséptico" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Mantenimiento" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Pruebas" }))
    await waitFor(() => expect(api.leer).toHaveBeenCalledWith("jefe", "PRUEBAS"))
  })

  it("si falla la lectura del área no se muestran los números de otra y Guardar queda apagado", async () => {
    const user = userEvent.setup()
    sesion.actual = sesionCon([], { rol: "SUPERADMINISTRADOR", area: null })
    api.leer.mockImplementation(async (_u: string, area: string) =>
      area === "PRUEBAS" ? { ok: false, error: "No hay conexión con el servidor. Revisa la red e intenta de nuevo." } : { ok: true, data: { ventana: "TURNO", inspeccionEn: 2, intervencionEn: 3 } },
    )
    pintar()
    await user.click(await screen.findByRole("button", { name: /configurar sif/i }))
    await waitFor(() => expect(screen.getByTestId("frase-control").textContent).toContain("en un turno"))
    await user.click(screen.getByRole("button", { name: "Pruebas" }))
    expect(await screen.findByText(/No se pudo leer la configuración de esta área/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true)
    expect(api.guardar).not.toHaveBeenCalled()
  })
})
