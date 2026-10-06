import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import PanelProduccion from "@/pages/apps/PanelProduccion"
import type { Session } from "@/lib/auth"
import type { LineaLive, PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import type { FilaEstadistica } from "@/lib/estadisticas"
import type { Parada } from "@/lib/paradas"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida, LineaEstado } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Panel de Producción completo con un turno de prueba: lo que se ve en
 * cada sección (snapshot del HTML, sin ids generados) y cómo carga /
 * refresca los datos. Se escribió ANTES de partir PanelProduccion.tsx en
 * secciones: el HTML tiene que quedar idéntico.
 */

// ---------------------------------------------------------------- mocks
const sesion = { actual: null as Session | null }
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: sesion.actual }) }))

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock("@/components/TanqueVisual", () => ({
  TanqueVisual: ({ numeroTanque, condicion, color }: { numeroTanque: number; condicion: string; color: string }) => (
    <div data-testid="tanque-visual">{`${numeroTanque} ${condicion} ${color}`}</div>
  ),
}))
vi.mock("@/components/CintaEstadoLinea", () => ({
  CintaEstadoLinea: ({ estado, alertaMerma }: { estado: string; alertaMerma?: boolean }) => (
    <div data-testid="cinta">{`${estado}${alertaMerma ? " alerta" : ""}`}</div>
  ),
}))
vi.mock("@/components/TopFallasPanel", () => ({
  TopFallasPanel: ({ paradas, lineas }: { paradas: unknown[]; lineas: unknown[] }) => (
    <div data-testid="top-fallas">{`${paradas.length} paradas · ${lineas.length} líneas`}</div>
  ),
}))

const LINEAS = [
  { id: "l1", codigo: "LINEA_1", nombre: "Línea 1", activo: true },
  { id: "l2", codigo: "LINEA_2", nombre: "Línea 2", activo: true },
  { id: "l3", codigo: "LINEA_3", nombre: "Línea 3", activo: true },
] as LineaLive[]
const PRESENTACIONES = [
  { id: "p1000", codigo: "1000", nombre: "1 L", volumenMl: 1000, cajasXCamada: 10, cantCamada: 10, cajasXPaleta: 100, litrosXCaja: 12, envasesXCaja: 12 },
] as unknown as PresentacionLive[]
const VELOCIDADES: VelocidadLive[] = ["LINEA_1", "LINEA_2", "LINEA_3"].map((linea, i) => ({
  id: `v${i}`,
  linea: linea as VelocidadLive["linea"],
  presentacion: "1000",
  maquina: "A3",
  envasesHora: 6000,
  litrosHora: 6000,
  activo: true,
}))
vi.mock("@/lib/catalogosLive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogosLive")>()),
  useCatalogosLive: () => ({ lineas: LINEAS, presentaciones: PRESENTACIONES, velocidades: VELOCIDADES, cargando: false }),
}))

/** Datos de los 3 módulos por turno ("t-1" el actual, "t-0" el anterior). */
const datos = new Map<
  string,
  {
    tanques: TanqueRecepcion[]
    preparaciones: PreparacionRegistro[]
    corridas: Corrida[]
    contadores: ContadorRegistro[]
    lineasEstado: LineaEstado[]
    pt: ProductoTerminadoRegistro[]
  }
>()
const deTurno = (id: string | null | undefined) => (id ? datos.get(id) : undefined)
vi.mock("@/lib/preparacion/usePreparacion", () => ({
  usePreparacion: (id: string | null) => ({
    tanques: deTurno(id)?.tanques ?? [],
    preparaciones: deTurno(id)?.preparaciones ?? [],
    transferencias: [],
    desvases: [],
    cargando: false,
  }),
}))
vi.mock("@/lib/produccion/useProduccion", () => ({
  useProduccion: (id: string | null) => ({
    corridas: deTurno(id)?.corridas ?? [],
    contadores: deTurno(id)?.contadores ?? [],
    lineasEstado: deTurno(id)?.lineasEstado ?? [],
    cargando: false,
  }),
}))
vi.mock("@/lib/productoTerminado", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/productoTerminado")>()),
  useProductoTerminado: (id: string | null) => ({ registros: deTurno(id)?.pt ?? [], cargando: false }),
}))

const api = {
  estadoPlantaActual: vi.fn(),
  turnoAnterior: vi.fn(),
  turnoDeFechaTipo: vi.fn(),
  serviciosIndustriales: vi.fn(),
  produccionDia: vi.fn(),
  cargo: vi.fn(),
  ajustes: vi.fn(),
  programacionDia: vi.fn(),
  paradas: vi.fn(),
  estadisticas: vi.fn(),
}
vi.mock("@/lib/panelProduccion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/panelProduccion")>()),
  obtenerEstadoPlantaActual: (...a: unknown[]) => api.estadoPlantaActual(...a),
  obtenerTurnoAnterior: (...a: unknown[]) => api.turnoAnterior(...a),
  obtenerTurnoDeFechaTipo: (...a: unknown[]) => api.turnoDeFechaTipo(...a),
  obtenerTurnosDeFechaTipo: async (...a: unknown[]) => {
    const t = await api.turnoDeFechaTipo(...a)
    return t ? [t] : []
  },
  obtenerLecturaServiciosIndustriales: (...a: unknown[]) => api.serviciosIndustriales(...a),
  obtenerProduccionDia: (...a: unknown[]) => api.produccionDia(...a),
  cargoDeUsuario: (...a: unknown[]) => api.cargo(...a),
  ajustesSemielaboradoTurno: (...a: unknown[]) => api.ajustes(...a),
}))
vi.mock("@/lib/programacion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/programacion")>()),
  obtenerProgramacionDia: (...a: unknown[]) => api.programacionDia(...a),
}))
vi.mock("@/lib/paradas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradas")>()),
  listarParadas: (...a: unknown[]) => api.paradas(...a),
}))
vi.mock("@/lib/paradasCatalogo", () => ({
  useCatalogoParadas: () => [],
  codigoDeParadaLive: (p: { tipoCodigo: string | null }) => (p.tipoCodigo ? `C-${p.tipoCodigo}` : null),
}))
vi.mock("@/lib/estadisticas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/estadisticas")>()),
  obtenerEstadisticas: (...a: unknown[]) => api.estadisticas(...a),
}))

// ---------------------------------------------------------------- datos
const AHORA = new Date("2026-10-05T10:30:00")

function turno(over: Partial<TurnoActivo> = {}): TurnoActivo {
  return {
    id: "t-1",
    codigo: "T1-0510",
    fecha: "2026-10-05",
    horaInicio: "07:00:00",
    estado: "ABIERTO",
    fechaFin: null,
    horaFin: null,
    cierreAutomatico: false,
    turnoTipo: "TURNO_1",
    grupo: "GRUPO_1",
    supervisorUsuario: "jperez",
    supervisorNombre: "Juan Pérez",
    lineas: [],
    lineasEstado: [],
    tanques: [],
    tanquesEncontrados: null,
    contadores: [],
    productoTerminado: [],
    preparaciones: [],
    ...over,
  }
}
const TURNO_ANTERIOR = turno({ id: "t-0", codigo: "T3-0410", fecha: "2026-10-04", turnoTipo: "TURNO_3", estado: "CERRADO", horaInicio: "22:30:00", horaFin: "07:00:00", supervisorNombre: "Ana Gómez", supervisorUsuario: "agomez" })

function corrida(over: Partial<Corrida>): Corrida {
  return {
    id: "c1",
    linea: "LINEA_1",
    presentacion: "1000",
    envasesHora: 6000,
    saborId: "s1",
    saborNombre: "Fresa",
    lote: "0001",
    loteId: "p1",
    activa: true,
    activadaEn: "2026-10-05T07:30:00",
    pausadaEn: null,
    loteTerminado: null,
    finalizadaEn: null,
    esperandoCierre: false,
    entregadaEn: null,
    confirmadoInicioEn: "2026-10-05T07:30:00",
    ...over,
  }
}

function tanque(n: 1 | 2 | 3, over: Partial<TanqueRecepcion>): TanqueRecepcion {
  return {
    numeroTanque: n,
    saborId: null,
    saborNombre: null,
    condicion: "LIMPIO",
    volumenL: null,
    volumenInicialL: null,
    lote: null,
    activadaEn: "2026-10-05T07:00:00",
    ultimoSaborId: null,
    ultimoSaborNombre: null,
    ultimoLote: null,
    confirmadoInicioEn: "2026-10-05T07:05:00",
    confirmadoFinEn: null,
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    ...over,
  }
}

function prep(over: Partial<PreparacionRegistro>): PreparacionRegistro {
  return {
    id: "p1",
    turnoId: "t-1",
    numeroTanque: 1,
    saborId: "s1",
    saborNombre: "Fresa",
    lote: "0001",
    volumenActualL: 7000,
    volumenPreparadoL: 20000,
    volumenAlIniciarTurnoL: 20000,
    tambores: 100,
    agua: null,
    azucar: null,
    acidoCitrico: null,
    creadoEn: "2026-10-05T07:10:00",
    liberadoEn: "2026-10-05T07:25:00",
    cerradoEn: null,
    ...over,
  }
}

const contador = (id: string, linea: Corrida["linea"], corridaId: string, envases: number, creadoEn = "2026-10-05T10:00:00"): ContadorRegistro => ({
  id,
  linea,
  corridaId,
  envasesLlenadora: envases,
  envasesBuenos: null,
  justificacion: "",
  creadoEn,
})

const pt = (id: string, linea: Corrida["linea"], corridaId: string, sabor: string, paletas: number, sueltas: number, litros: number): ProductoTerminadoRegistro => ({
  id,
  linea,
  corridaId,
  saborId: null,
  saborNombre: sabor,
  presentacion: "1000",
  paletas,
  cajasSueltas: sueltas,
  litrosProducidos: litros,
  creadoEn: "2026-10-05T10:05:00",
  registradoPorNombre: null,
})

function parada(over: Partial<Parada>): Parada {
  return {
    id: "pa1",
    clase: "NO_PROGRAMADA",
    origen: "MANUAL",
    lineaCodigo: "LINEA_1",
    turnoTipo: "TURNO_1",
    tipoCodigo: "TAPADORA",
    tipoNombre: "Falla tapadora",
    tiempoGuiaMin: null,
    nota: null,
    justificacionDesvio: null,
    inicio: "2026-10-05T08:00:00",
    fin: "2026-10-05T08:25:00",
    supervisorNombre: "Juan Pérez",
    ...over,
  }
}

function cargarDatosDelTurno() {
  datos.clear()
  datos.set("t-1", {
    tanques: [
      tanque(1, { condicion: "LISTO", saborId: "s1", saborNombre: "Fresa", volumenL: 7000, volumenInicialL: 20000, lote: "0001" }),
      tanque(2, { condicion: "EN_PREPARACION", lote: "0002" }),
      tanque(3, { condicion: "CIP", cipIniciadoEn: "2026-10-05T08:00:00" }),
    ],
    preparaciones: [
      prep({}),
      prep({ id: "p2", numeroTanque: 2, saborNombre: "Mango", lote: "0002", tambores: 12, liberadoEn: null, volumenActualL: 2100, volumenPreparadoL: 2100, volumenAlIniciarTurnoL: 2100, creadoEn: "2026-10-05T09:40:00" }),
    ],
    corridas: [
      corrida({}),
      corrida({ id: "c2", linea: "LINEA_2", saborNombre: "Mango", lote: "0009", loteId: "p9", pausadaEn: "2026-10-05T09:00:00", activadaEn: "2026-10-05T07:15:00" }),
      corrida({ id: "c3", linea: "LINEA_3", saborNombre: "Naranja", lote: "0005", loteId: "p5", activa: false, esperandoCierre: true, activadaEn: "2026-10-05T07:05:00" }),
    ],
    contadores: [contador("k1", "LINEA_1", "c1", 12000), contador("k2", "LINEA_2", "c2", 5000)],
    lineasEstado: [
      { linea: "LINEA_2", condicion: "CIP", activadaEn: "2026-10-05T09:00:00", cipIniciadoEn: "2026-10-05T09:00:00", cipFinalizadoEn: null, observacion: "36 h de trabajo" },
      { linea: "LINEA_3", condicion: "DETENIDA", activadaEn: "2026-10-05T09:30:00", cipIniciadoEn: null, cipFinalizadoEn: null, observacion: "Falla motor" },
    ],
    pt: [pt("pt1", "LINEA_1", "c1", "Fresa", 9, 50, 11400), pt("pt2", "LINEA_2", "c2", "Mango", 3, 80, 4560)],
  })
  datos.set("t-0", {
    tanques: [],
    preparaciones: [prep({ id: "p0", turnoId: "t-0", lote: "0000", volumenActualL: 1000, volumenPreparadoL: 12000, volumenAlIniciarTurnoL: 12000 })],
    corridas: [corrida({ id: "c0", loteId: "p0", activa: false, finalizadaEn: "2026-10-05T06:30:00", activadaEn: "2026-10-04T23:00:00" })],
    contadores: [contador("k0", "LINEA_1", "c0", 10000, "2026-10-05T06:00:00")],
    lineasEstado: [],
    pt: [pt("pt0", "LINEA_1", "c0", "Fresa", 8, 20, 9840)],
  })
}

function prepararApi() {
  for (const f of Object.values(api)) f.mockReset()
  api.estadoPlantaActual.mockResolvedValue(turno())
  api.turnoAnterior.mockImplementation(async (_area: string, actual: string | null) => (actual === "t-1" ? TURNO_ANTERIOR : null))
  api.turnoDeFechaTipo.mockResolvedValue(TURNO_ANTERIOR)
  api.serviciosIndustriales.mockResolvedValue({ temperaturaQuantum: 85, aguaOsmotizada: 12000, gasoil: 3000, actualizadoEn: "2026-10-05T10:00:00", actualizadoPorNombre: "Luis" })
  api.produccionDia.mockResolvedValue([{ saborNombre: "Fresa", presentacionMl: 1000, cajas: 1500, litros: 18000 }])
  api.cargo.mockResolvedValue("SUPERVISOR")
  api.ajustes.mockResolvedValue([
    { lote: "0001", sabor: "Fresa", volumenTeorico: 7100, volumenReal: 7000, diferencia: -100, usuarioNombre: "Juan Pérez", creadoEn: "2026-10-05T09:00:00" },
  ])
  api.programacionDia.mockResolvedValue([
    { saborId: "s1", saborNombre: "Fresa", presentacionId: "p1000", presentacionMl: 1000, cajasPlan: 2000 },
    { saborId: "s3", saborNombre: "Naranja", presentacionId: "p1000", presentacionMl: 1000, cajasPlan: 500 },
  ])
  api.paradas.mockImplementation(async ({ turnoId }: { turnoId: string }) =>
    turnoId === "t-1"
      ? [
          parada({}),
          parada({ id: "pa2", lineaCodigo: "LINEA_2", clase: "PROGRAMADA", origen: "MANTENIMIENTO", tipoCodigo: "CIP36", tipoNombre: "CIP por 36 h", inicio: "2026-10-05T09:00:00", fin: null }),
        ]
      : [],
  )
  const fila = (over: Partial<FilaEstadistica>) =>
    ({
      turnoId: "t-0",
      turnoCodigo: "T3-0410",
      fecha: "2026-10-04",
      horaInicio: "22:30:00",
      horaFin: "07:00:00",
      estado: "CERRADO",
      turnoTipo: "TURNO_3",
      grupo: "GRUPO_1",
      area: "ASEPTICO",
      supervisorUsuario: "agomez",
      supervisorNombre: "Ana Gómez",
      linea: "LINEA_1",
      turnoLineaId: "c0",
      envasesLlenadora: 10000,
      paletas: 8,
      cajasSueltas: 20,
      cajasXPaleta: 100,
      envasesXCaja: 12,
      volumenMl: 1000,
      litrosProducidos: 9840,
      ...over,
    }) as FilaEstadistica
  api.estadisticas.mockResolvedValue([
    fila({}),
    fila({ turnoId: "t-9", grupo: "GRUPO_2", supervisorUsuario: "jperez", supervisorNombre: "Juan Pérez", envasesLlenadora: 9000, paletas: 7, cajasSueltas: 0, litrosProducidos: 8400 }),
  ])
}

const SUPERADMIN = { username: "admin", nombre: "Admin", cedula: null, area: null, rol: "SUPERADMINISTRADOR", esDueno: false, permisos: [] } as unknown as Session
const SUPERVISOR = { username: "jperez", nombre: "Juan Pérez", cedula: null, area: "ASEPTICO", rol: "SUPERVISOR", esDueno: false, permisos: ["TURNO_CARGAR"] } as unknown as Session

// ---------------------------------------------------------------- helpers
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => {
  // Reloj fijo; los intervalos (reloj de pantalla, carrusel, refresco en vivo) solo avanzan a mano.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
  vi.setSystemTime(AHORA)
  sesion.actual = SUPERADMIN
  cargarDatosDelTurno()
  prepararApi()
})
afterEach(() => {
  vi.useRealTimers()
})

function renderPanel() {
  return render(
    <MemoryRouter>
      <PanelProduccion />
    </MemoryRouter>,
  )
}

/** HTML sin los ids que generan React/Radix (cambian con la forma del árbol, no con lo que se ve). */
function html(container: HTMLElement) {
  return container.innerHTML
    .replace(/ (id|for|aria-controls|aria-labelledby|aria-describedby)="[^"]*"/g, "")
    .replace(/ data-radix-[a-z-]+="[^"]*"/g, "")
}

async function esperarTurno() {
  await screen.findByText("Juan Pérez")
  await screen.findByText(/T1-0510/)
  await screen.findByText("Supervisor", { exact: false })
}

async function abrirSecciones(u: ReturnType<typeof userEvent.setup>) {
  for (const titulo of ["Meta por línea", "Top Fallas — paradas por línea", "Desglose de cálculo", "Resumen de Planta"]) {
    await u.click(screen.getByRole("button", { name: titulo }))
  }
  await screen.findByText("Matriz supervisor × grupo")
  await screen.findByText(/Correcciones de volumen/)
}

// ---------------------------------------------------------------- pruebas
describe("Panel de Producción — en vivo", () => {
  it("muestra el turno completo igual que antes (snapshot)", async () => {
    const u = userEvent.setup()
    const { container } = renderPanel()
    await esperarTurno()
    await abrirSecciones(u)
    expect(html(container)).toMatchSnapshot()
  })

  it("carga el turno en vivo del área y lo de la jornada", async () => {
    renderPanel()
    await esperarTurno()
    expect(api.estadoPlantaActual).toHaveBeenCalledWith("ASEPTICO")
    expect(api.turnoAnterior).toHaveBeenCalledWith("ASEPTICO", "t-1")
    expect(api.programacionDia).toHaveBeenCalledWith("ASEPTICO", "2026-10-05")
    expect(api.produccionDia).toHaveBeenCalledWith("ASEPTICO", "2026-10-05")
    expect(api.paradas).toHaveBeenCalledWith({ desde: "2026-10-05", hasta: "2026-10-05", turnoId: "t-1" })
    expect(api.cargo).toHaveBeenCalledWith("jperez")
    expect(screen.getByText("EN VIVO")).toBeInTheDocument()
    expect(screen.getByText("En Operación")).toBeInTheDocument()
  })

  it("el carrusel de programación rota cada 2.5 s", async () => {
    renderPanel()
    await esperarTurno()
    const celda = screen.getByText("Programación diaria").parentElement!.parentElement!
    expect(within(celda).getByText("Fresa")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2500))
    expect(within(celda).getByText("Naranja")).toBeInTheDocument()
  })

  it("a los 30 min se recarga solo, sin sacar lo que se ve", async () => {
    renderPanel()
    await esperarTurno()
    expect(api.estadoPlantaActual).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(30 * 60 * 1000))
    await waitFor(() => expect(api.estadoPlantaActual).toHaveBeenCalledTimes(2))
    expect(api.serviciosIndustriales).toHaveBeenCalledTimes(2)
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument()
  })

  it("sin turnos, lo dice", async () => {
    api.estadoPlantaActual.mockResolvedValue(null)
    const { container } = renderPanel()
    await screen.findByText("Todavía no se registró ningún turno")
    expect(screen.getByText("Sin turnos registrados")).toBeInTheDocument()
    expect(html(container)).toMatchSnapshot()
  })
})

describe("Panel de Producción — buscar otro turno", () => {
  it("por fecha: busca ese turno y deja de refrescarse solo", async () => {
    const u = userEvent.setup()
    const { container } = renderPanel()
    await esperarTurno()
    await u.click(screen.getByRole("button", { name: /EN VIVO/ }))
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    await u.clear(fecha)
    await u.type(fecha, "2026-10-04")
    await waitFor(() => expect(api.turnoDeFechaTipo).toHaveBeenLastCalledWith("2026-10-04", "TURNO_1", "ASEPTICO"))
    await screen.findByText("Ana Gómez")
    expect(screen.getByText(/FECHA: 2026-10-04 · Turno 1/)).toBeInTheDocument()
    expect(screen.getByText("Turno cerrado")).toBeInTheDocument()
    expect(html(container)).toMatchSnapshot()

    const llamadas = api.estadoPlantaActual.mock.calls.length
    act(() => vi.advanceTimersByTime(30 * 60 * 1000))
    await act(async () => {})
    expect(api.estadoPlantaActual).toHaveBeenCalledTimes(llamadas)
  })

  it("por tipo de turno", async () => {
    const u = userEvent.setup()
    renderPanel()
    await esperarTurno()
    await u.click(screen.getByRole("button", { name: /EN VIVO/ }))
    const combos = screen.getAllByRole("combobox")
    await u.click(combos[1])
    await u.click(await screen.findByRole("option", { name: "Turno 3" }))
    await waitFor(() => expect(api.turnoDeFechaTipo).toHaveBeenLastCalledWith("2026-10-05", "TURNO_3", "ASEPTICO"))
  })

  it("Ver en vivo vuelve al turno actual", async () => {
    const u = userEvent.setup()
    const { container } = renderPanel()
    await esperarTurno()
    await u.click(screen.getByRole("button", { name: /EN VIVO/ }))
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    await u.clear(fecha)
    await u.type(fecha, "2026-10-04")
    await screen.findByText("Ana Gómez")
    await u.click(screen.getByRole("button", { name: "Ver en vivo" }))
    await screen.findByText("EN VIVO")
    await screen.findByText("Juan Pérez")
  })

  it("no encontrado: lo dice", async () => {
    const u = userEvent.setup()
    api.turnoDeFechaTipo.mockResolvedValue(null)
    const { container } = renderPanel()
    await esperarTurno()
    await u.click(screen.getByRole("button", { name: /EN VIVO/ }))
    const fecha = container.querySelector('input[type="date"]') as HTMLInputElement
    await u.clear(fecha)
    await u.type(fecha, "2026-10-01")
    await screen.findByText("No hay ningún turno para esa fecha/turno")
  })
})

describe("Panel de Producción — área y rol", () => {
  it("el Super Administrador elige el área", async () => {
    const u = userEvent.setup()
    renderPanel()
    await esperarTurno()
    await u.click(screen.getByRole("button", { name: /Producción Aséptico/ }))
    await u.click(screen.getAllByRole("combobox")[0])
    const opciones = await screen.findAllByRole("option")
    expect(opciones.map((o) => o.textContent)).toEqual(["Producción Aséptico", "Todas las áreas"])
    await u.click(screen.getByRole("option", { name: "Todas las áreas" }))
    await waitFor(() => expect(api.estadoPlantaActual).toHaveBeenLastCalledWith(null))
  })

  it("el supervisor ve su área fija y tanques/líneas llevan a Preparación", async () => {
    sesion.actual = SUPERVISOR
    const { container } = renderPanel()
    await esperarTurno()
    expect(screen.queryByRole("button", { name: /Producción Aséptico/ })).not.toBeInTheDocument()
    expect(container.querySelectorAll('a[href="/preparacion"]')).toHaveLength(6)
    expect(html(container)).toMatchSnapshot()
  })
})
