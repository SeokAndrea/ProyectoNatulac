import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ReportesParadas from "@/pages/apps/ReportesParadas"
import type { Session } from "@/lib/auth"
import type { FallasDeParada } from "@/lib/catalogoFallas/paradas"
import type { CatalogoFallas } from "@/lib/catalogoFallas/tipos"
import type { Parada } from "@/lib/paradas"

/* Pestaña «Resumen» de Reportes de paradas: banner del grupo #1, tarjetas y tabla con los filtros. */

const sesion = { actual: null as Session | null }
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: sesion.actual }) }))
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/paradas/ReporteParada", () => ({
  ReporteParada: ({ parada }: { parada: Parada }) => <div data-testid="reporte">{parada.id}</div>,
  textoTiempos: () => "",
}))

const catalogo: CatalogoFallas = {
  equipos: [{ id: "cf", sufijo: "CF", nombre: "Llenadora A3", tipo: "LINEA", activo: true, lineas: [] }],
  sistemas: [{ id: "sup", equipoId: "cf", sufijo: "SUP", nombre: "Superestructura", activo: true }],
  subsistemas: [
    { id: "cam", sistemaId: "sup", sufijo: "CAM", nombre: "Cámara aséptica", codigoSheet: null, activo: true },
    { id: "mor", sistemaId: "sup", sufijo: "MOR", nombre: "Mordazas de sellado", codigoSheet: null, activo: true },
  ],
  fallas: [
    { id: "f1", subsistemaId: "cam", numero: 1, nombre: "Baja presión", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-CAM-01" },
    { id: "f2", subsistemaId: "mor", numero: 1, nombre: "Mordaza desalineada", clase: "NO_PROGRAMADA", activo: true, codigo: "CF-SUP-MOR-01" },
  ],
}
const fallasPorParada = new Map<string, FallasDeParada>([
  ["a", { fallaProduccionId: null, fallaFinalId: "f1" }],
  ["b", { fallaProduccionId: null, fallaFinalId: "f1" }],
  ["c", { fallaProduccionId: null, fallaFinalId: "f2" }],
  ["d", { fallaProduccionId: null, fallaFinalId: "f2" }],
])
vi.mock("@/lib/catalogoFallas/useCatalogoFallas", () => ({ useCatalogoFallas: () => ({ catalogo, cargando: false, error: null, recargar: async () => {} }) }))
vi.mock("@/lib/catalogoFallas/useFallasDeParadas", () => ({ useFallasDeParadas: () => fallasPorParada }))
vi.mock("@/lib/ventanasParadas", () => ({ listarVentanasTurnos: async () => [], ventanasDeParada: () => [] }))
vi.mock("@/lib/sif", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sif")>()),
  listarSif: async () => ({
    ok: true,
    data: [
      { id: "s1", estado: "INSPECCION", fechaJornada: "2026-10-12", lineaCodigo: "LINEA_1", tipoCodigo: "CF-SUP-CAM-01", generadaEn: "2026-10-12T10:00:00" },
      { id: "s2", estado: "PENDIENTE", fechaJornada: "2026-10-14", lineaCodigo: "LINEA_1", tipoCodigo: "CF-SUP-CAM-01", generadaEn: "2026-10-14T10:00:00" },
      { id: "s3", estado: "INSPECCION", fechaJornada: "2026-08-01", lineaCodigo: "LINEA_1", tipoCodigo: "CF-SUP-CAM-01", generadaEn: "2026-08-01T10:00:00" },
    ],
  }),
}))

const parada = (id: string, inicio: string, min: number, extra: Partial<Parada> = {}) =>
  ({
    id,
    inicio,
    fin: new Date(new Date(inicio).getTime() + min * 60000).toISOString(),
    responsable: "MANTENIMIENTO",
    clase: "NO_PROGRAMADA",
    lineaCodigo: "LINEA_1",
    tipoCodigo: "FALLA_EQUIPO",
    tipoNombre: "Falla de equipo",
    subsistemaCodigo: null,
    terminadaPor: "Mario Técnico",
    ...extra,
  }) as Parada

const DEL_MES = [
  parada("a", "2026-10-10T08:00:00Z", 30),
  parada("b", "2026-10-11T08:00:00Z", 30),
  parada("c", "2026-10-12T08:00:00Z", 10, { terminadaPor: "Sofía Supervisora" }),
  parada("d", "2026-10-13T08:00:00Z", 20, { lineaCodigo: "LINEA_2", terminadaPor: "Sofía Supervisora" }),
  parada("fer", "2026-10-15T08:00:00Z", 480, { clase: "PROGRAMADA", tipoNombre: "Feriado", tipoCodigo: "FERIADO" }),
  parada("oci", "2026-10-16T08:00:00Z", 60, { clase: "OCIOSO", tipoCodigo: null, tipoNombre: "Retraso en la limpieza" }),
  parada("e", "2026-10-14T08:00:00Z", 50, { responsable: "OPERACIONAL", tipoCodigo: "CAMBIO", tipoNombre: "Cambio de sabor", terminadaPor: null }),
]
const MES_ANTERIOR = [parada("z", "2026-09-10T08:00:00Z", 10)]

vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  listarParadas: async ({ hasta }: { hasta: string }) => (hasta >= "2026-10-20" ? DEL_MES : MES_ANTERIOR),
}))

function abrir(ruta = "/reportes-paradas") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ReportesParadas />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"))
  sesion.actual = { username: "local", nombre: "Local", area: "ASEPTICO" } as Session
})
afterEach(() => {
  vi.useRealTimers()
})

describe("Reportes de paradas · Resumen", () => {
  it("entra al Resumen y muestra el banner del grupo que más paró, las tarjetas y la tabla", async () => {
    abrir()
    const banner = await screen.findByRole("region", { name: "Lo que más paró" })
    // Mordazas: 10 + 20 = 30 min en 2 veces; Cámara: 60 min en 2 veces (gana por tiempo).
    expect(within(banner).getByText("Cámara aséptica")).toBeTruthy()
    expect(within(banner).getByText("Llenadora A3")).toBeTruthy()
    expect(within(banner).getByText(/Se repitió/).textContent).toContain("2 veces")
    expect(within(banner).getByText(/Se repitió/).textContent).toContain("1 h parada")
    expect(within(banner).getByText(/Se repitió/).textContent).toContain("30 min cada vez")
    expect(within(banner).getByText(/La falla más común: Baja presión \(2 veces\)/)).toBeTruthy()
    // Solo fallas: lo programado y el ocioso no cuentan, y se avisa.
    expect(screen.getByText("Cuenta las paradas no programadas (fallas); no cuenta programadas, LNP ni ocioso.")).toBeTruthy()
    expect(screen.queryByText("Feriado")).toBeNull()
    expect(within(screen.getByRole("region", { name: "Totales" })).getByText("5")).toBeTruthy()
    // Badge de SIF en la falla repetida: Intervención pendiente de Baja presión (código CF-SUP-CAM-01).
    const badge = await screen.findByRole("link", { name: "Intervención pendiente" })
    expect(badge.getAttribute("href")).toBe("/solicitudes-intervencion?sif=s2")

    const tarjetas = screen.getByRole("region", { name: "Totales" })
    expect(within(tarjetas).getByText("+4 que el período anterior")).toBeTruthy()
    expect(within(tarjetas).getAllByText("período anterior: 10 min")).toHaveLength(2)
    await waitFor(() => expect(within(tarjetas).getByText("1 inspección · 1 intervención")).toBeTruthy())

    const tabla = screen.getByRole("region", { name: "Por subsistema" })
    expect(within(tabla).getByText("Mordazas de sellado")).toBeTruthy()
    expect(within(tabla).getByText("Cambio de sabor")).toBeTruthy()
  })

  it("el filtro de línea y «De quién es» cambian la tabla", async () => {
    const u = userEvent.setup({ advanceTimers: () => {} })
    abrir()
    await screen.findByRole("region", { name: "Lo que más paró" })

    await u.click(within(screen.getByRole("group", { name: "Línea" })).getByRole("button", { name: "Línea 2" }))
    const tabla = screen.getByRole("region", { name: "Por subsistema" })
    expect(within(tabla).getByText("Mordazas de sellado")).toBeTruthy()
    expect(within(tabla).queryByText("Cámara aséptica")).toBeNull()

    await u.click(within(screen.getByRole("group", { name: "Línea" })).getByRole("button", { name: "Todas" }))
    await u.click(within(screen.getByRole("group", { name: "De quién es" })).getByRole("button", { name: "Producción" }))
    const solo = screen.getByRole("region", { name: "Por subsistema" })
    expect(within(solo).getByText("Cambio de sabor")).toBeTruthy()
    expect(within(solo).queryByText("Cámara aséptica")).toBeNull()
  })

  it("toca una fila y muestra sus fallas; «Ver sus fallas» abre el primer grupo", async () => {
    const u = userEvent.setup({ advanceTimers: () => {} })
    abrir()
    await screen.findByRole("region", { name: "Lo que más paró" })
    await u.click(screen.getByRole("button", { name: "Ver sus fallas" }))
    expect(within(screen.getByRole("region", { name: "Por subsistema" })).getByText(/2 veces · 1 h · 30 min/)).toBeTruthy()
  })

  it("filtra por quien atendió", async () => {
    const u = userEvent.setup({ advanceTimers: () => {} })
    abrir()
    await screen.findByRole("region", { name: "Lo que más paró" })
    await u.selectOptions(screen.getByLabelText("Responsable (quién la atendió)"), "Sofía Supervisora")
    const tabla = screen.getByRole("region", { name: "Por subsistema" })
    expect(within(tabla).queryByText("Cámara aséptica")).toBeNull()
    expect(within(tabla).getByText("Mordazas de sellado")).toBeTruthy()
  })

  it("sin paradas con los filtros no hay banner y avisa", async () => {
    const u = userEvent.setup({ advanceTimers: () => {} })
    abrir()
    await screen.findByRole("region", { name: "Lo que más paró" })
    await u.click(within(screen.getByRole("group", { name: "Línea" })).getByRole("button", { name: "Línea 3" }))
    expect(screen.getByText("No hay paradas con esos filtros.")).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Lo que más paró" })).toBeNull()
  })

  it("Mantenimiento arranca en «De quién es: Mantenimiento»", async () => {
    sesion.actual = { username: "mtto", nombre: "Mtto", area: "MANTENIMIENTO" } as Session
    abrir()
    await screen.findByRole("region", { name: "Lo que más paró" })
    expect(within(screen.getByRole("group", { name: "De quién es" })).getByRole("button", { name: "Mantenimiento" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.queryByText("Cambio de sabor")).toBeNull()
  })

  it("?parada abre la Lista con ese reporte, y la pestaña Lista sigue ahí", async () => {
    const u = userEvent.setup({ advanceTimers: () => {} })
    abrir("/reportes-paradas?parada=a")
    expect((await screen.findByTestId("reporte")).textContent).toBe("a")
    expect(screen.getByRole("tab", { name: "Lista de paradas" }).getAttribute("aria-selected")).toBe("true")
    await u.click(screen.getByRole("tab", { name: "Resumen" }))
    expect(await screen.findByRole("region", { name: "Totales" })).toBeTruthy()
  })
})
