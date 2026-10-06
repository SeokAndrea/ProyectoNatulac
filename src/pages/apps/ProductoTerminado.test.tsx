import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ProductoTerminado from "@/pages/apps/ProductoTerminado"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"

/*
 * Producto Terminado y Contador, página completa: qué se ve en cada
 * estado de la corrida (snapshot del HTML) y qué se manda — y en qué
 * orden — al guardar. Se escribió ANTES de partir FilaProductoTerminado
 * en componentes chicos: el HTML y las llamadas tienen que quedar iguales.
 */

// ---------------------------------------------------------------- mocks
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p data-testid="descripcion">{description}</p>
      {children}
    </div>
  ),
}))
vi.mock("@/components/ModoCorreccionBanner", () => ({
  ModoCorreccionBanner: ({ turno }: { turno: { codigo: string } }) => <div data-testid="banner-correccion">{turno.codigo}</div>,
}))

const sesion = {
  turnoId: "t-1" as string | null,
  codigo: "T2-0510" as string | null,
  turnoGraciaPT: null as { turnoId: string; codigo: string } | null,
  cargando: false,
}
vi.mock("@/lib/sesionTurno", () => ({ useSesionTurno: () => sesion }))

const correccion = {
  turnoIdEfectivo: null as string | null,
  cargando: false,
  enModoCorreccion: false,
  turnoCorregido: null as { codigo: string } | null,
  errorCorreccion: false,
  salirDeCorreccion: vi.fn(),
}
vi.mock("@/lib/turnoCorreccion", () => ({ useTurnoEfectivo: () => correccion }))

const LINEAS = [
  { id: "l1", codigo: "LINEA_1", nombre: "Línea 1", activo: true },
  { id: "l2", codigo: "LINEA_2", nombre: "Línea 2", activo: true },
  { id: "l3", codigo: "LINEA_3", nombre: "Línea 3", activo: true },
] as LineaLive[]
const PRESENTACIONES = [
  { id: "p1000", codigo: "1000", nombre: "1 L", volumenMl: 1000, cajasXCamada: 10, cantCamada: 10, cajasXPaleta: 100, litrosXCaja: 12, envasesXCaja: 12 },
] as unknown as PresentacionLive[]
// El acta que se rearma sola (turno cerrado): acá solo se cuenta cuándo se pide.
const actaPedida = vi.fn()
vi.mock("@/components/producto-terminado/useActaAlDia", () => ({
  useActaAlDia: (turnoId: string | null) => ({
    estado: "quieta",
    conActa:
      <A extends unknown[], R extends { ok: boolean }>(fn: (...a: A) => Promise<R>) =>
      async (...a: A) => {
        const r = await fn(...a)
        if (r.ok) actaPedida(turnoId)
        return r
      },
  }),
}))
vi.mock("@/lib/catalogosLive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalogosLive")>()),
  useCatalogosLive: () => ({ lineas: LINEAS, presentaciones: PRESENTACIONES, velocidades: [], cargando: false }),
}))

/** Orden en que se llamó a cada acción al guardar. */
const orden: string[] = []
const OK = { ok: true as const }
const falla = (error: string) => ({ ok: false as const, error })
const acc = {
  registrarContador: vi.fn(),
  entregarCorrida: vi.fn(),
  terminarSaborLinea: vi.fn(),
  registrarProductoTerminado: vi.fn(),
  medirTanque: vi.fn(),
  recargar: vi.fn(),
}
const pedidoCon = { produccion: [] as (string | null)[], pt: [] as (string | null)[], preparacion: [] as (string | null)[] }
const datos = {
  corridas: [] as Corrida[],
  contadores: [] as ContadorRegistro[],
  pt: [] as ProductoTerminadoRegistro[],
  tanques: [] as TanqueRecepcion[],
  preparaciones: [] as PreparacionRegistro[],
}
vi.mock("@/lib/produccion/useProduccion", () => ({
  useProduccion: (id: string | null) => {
    pedidoCon.produccion.push(id)
    return {
      corridas: datos.corridas,
      contadores: datos.contadores,
      cargando: false,
      registrarContador: acc.registrarContador,
      entregarCorrida: acc.entregarCorrida,
      terminarSaborLinea: acc.terminarSaborLinea,
    }
  },
}))
vi.mock("@/lib/productoTerminado", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/productoTerminado")>()),
  useProductoTerminado: (id: string | null) => {
    pedidoCon.pt.push(id)
    return { registros: datos.pt, cargando: false, registrarProductoTerminado: acc.registrarProductoTerminado }
  },
}))
vi.mock("@/lib/preparacion/usePreparacion", () => ({
  usePreparacion: (id: string | null) => {
    pedidoCon.preparacion.push(id)
    return { tanques: datos.tanques, preparaciones: datos.preparaciones, medirTanque: acc.medirTanque, recargar: acc.recargar, cargando: false }
  },
}))

// ---------------------------------------------------------------- datos
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
    activadaEn: "2026-10-05T08:00:00",
    pausadaEn: null,
    loteTerminado: null,
    finalizadaEn: null,
    esperandoCierre: false,
    entregadaEn: null,
    confirmadoInicioEn: "2026-10-05T08:00:00",
    ...over,
  }
}
const contador = (id: string, corridaId: string, llenadora: number, buenos: number | null): ContadorRegistro => ({
  id,
  linea: "LINEA_1",
  corridaId,
  envasesLlenadora: llenadora,
  envasesBuenos: buenos,
  justificacion: "",
  creadoEn: "2026-10-05T12:00:00",
})
const registroPT = (id: string, corridaId: string, saborId: string, paletas: number, cajas: number, litros: number): ProductoTerminadoRegistro => ({
  id,
  linea: "LINEA_1",
  corridaId,
  saborId,
  saborNombre: null,
  presentacion: "1000",
  paletas,
  cajasSueltas: cajas,
  litrosProducidos: litros,
  creadoEn: "2026-10-05T12:05:00",
  registradoPorNombre: null,
})
const tanque = (n: 1 | 2 | 3, over: Partial<TanqueRecepcion>): TanqueRecepcion => ({
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
  confirmadoInicioEn: null,
  confirmadoFinEn: null,
  cipIniciadoEn: null,
  cipFinalizadoEn: null,
  ...over,
})

function cargarDatos() {
  datos.corridas = [
    corrida({ id: "c1", activadaEn: "2026-10-05T08:00:00" }),
    corrida({ id: "c2", linea: "LINEA_2", pausadaEn: "2026-10-05T11:00:00", activadaEn: "2026-10-05T08:10:00" }),
    corrida({ id: "c3", linea: "LINEA_3", activa: false, esperandoCierre: true, activadaEn: "2026-10-05T08:20:00" }),
    corrida({ id: "c4", saborId: "s2", saborNombre: "Mango", lote: "0002", loteId: "p2", entregadaEn: "2026-10-05T14:50:00", activadaEn: "2026-10-05T07:30:00" }),
    corrida({ id: "c5", linea: "LINEA_2", saborId: "s3", saborNombre: "Naranja", lote: "0003", loteId: "p3", activa: false, finalizadaEn: "2026-10-05T07:20:00", activadaEn: "2026-10-05T07:05:00" }),
  ]
  datos.contadores = [contador("k1", "c1", 6000, 5800), contador("k2", "c1", 6000, 5900), contador("k4", "c4", 3000, 2900)]
  datos.pt = [registroPT("pt1", "c1", "s1", 9, 50, 11400), registroPT("pt4", "c4", "s2", 2, 40, 2880)]
  datos.tanques = [
    tanque(1, { condicion: "LISTO", saborId: "s1", saborNombre: "Fresa", lote: "1", volumenL: 7000 }),
    tanque(2, { condicion: "STANDBY", saborId: "s2", saborNombre: "Mango", lote: "0002", volumenL: 300 }),
  ]
  datos.preparaciones = [
    { id: "p1", turnoId: "t-1", numeroTanque: 1, saborId: "s1", saborNombre: "Fresa", lote: "0001", volumenActualL: 6500, volumenPreparadoL: 20000, volumenAlIniciarTurnoL: 20000, tambores: 100, agua: null, azucar: null, acidoCitrico: null, creadoEn: "2026-10-05T07:00:00", liberadoEn: "2026-10-05T07:30:00", cerradoEn: null },
  ]
}

beforeEach(() => {
  sesion.turnoId = "t-1"
  sesion.codigo = "T2-0510"
  sesion.turnoGraciaPT = null
  sesion.cargando = false
  Object.assign(correccion, { turnoIdEfectivo: null, cargando: false, enModoCorreccion: false, turnoCorregido: null, errorCorreccion: false })
  orden.length = 0
  pedidoCon.produccion.length = 0
  pedidoCon.pt.length = 0
  pedidoCon.preparacion.length = 0
  const registrar = (nombre: string) => vi.fn(async (...args: unknown[]) => (orden.push(`${nombre} ${JSON.stringify(args)}`), OK))
  acc.registrarContador = registrar("contador")
  acc.entregarCorrida = registrar("entregar")
  acc.terminarSaborLinea = registrar("terminar")
  acc.registrarProductoTerminado = registrar("producto")
  acc.medirTanque = registrar("medir")
  acc.recargar = vi.fn(async () => {
    orden.push("recargar")
  })
  cargarDatos()
})

function renderPagina() {
  return render(
    <MemoryRouter>
      <ProductoTerminado />
    </MemoryRouter>,
  )
}

const html = (c: HTMLElement) => c.innerHTML

/** La tarjeta de una línea y lote (por lo que dice su cabecera). */
function tarjeta(nombreLinea: string, lote = "0001") {
  const card = [...document.querySelectorAll<HTMLElement>('[data-slot="card"]')].find(
    (c) => c.textContent?.includes(nombreLinea) && c.textContent?.includes(`Lote ${lote}`),
  )
  if (!card) throw new Error(`no encontré la tarjeta de ${nombreLinea} · Lote ${lote}`)
  return within(card)
}

async function escribir(u: ReturnType<typeof userEvent.setup>, t: ReturnType<typeof tarjeta>, placeholder: string, valor: string) {
  const input = t.getByPlaceholderText(placeholder)
  await u.clear(input)
  await u.type(input, valor)
}

// ---------------------------------------------------------------- pruebas
describe("Producto Terminado — cómo se ve", () => {
  it("corridas pendientes: activa (formulario), parada y esperando cierre (snapshot)", () => {
    const { container } = renderPagina()
    expect(screen.getByTestId("descripcion")).toHaveTextContent("Turno T2-0510")
    expect(html(container)).toMatchSnapshot()
  })

  it("corridas cerradas: detrás de un botón, con su sabor y lote (snapshot)", async () => {
    const u = userEvent.setup()
    const { container } = renderPagina()
    await u.click(screen.getByRole("button", { name: /Ver corridas cerradas \(2\)/ }))
    await u.click(screen.getByRole("button", { name: /Mango/ }))
    expect(html(container)).toMatchSnapshot()
  })

  it("con datos a medio escribir: totales, equivalencia de buenos y merma (snapshot)", async () => {
    const u = userEvent.setup()
    const { container } = renderPagina()
    const t = tarjeta("Línea 1")
    await escribir(u, t, "Sumar al contador", "1200")
    await escribir(u, t, "Envases buenos", "1150")
    await escribir(u, t, "Paletas", "10")
    await escribir(u, t, "Cajas sueltas", "0")
    expect(html(container)).toMatchSnapshot()
  })

  it("sin turno, sin corridas y turno de corrección que no abre", () => {
    sesion.turnoId = null
    const r1 = renderPagina()
    expect(screen.getByText("Primero debes iniciar un turno")).toBeInTheDocument()
    r1.unmount()

    sesion.turnoId = "t-1"
    datos.corridas = []
    const r2 = renderPagina()
    expect(screen.getByText("Ninguna línea usada todavía")).toBeInTheDocument()
    r2.unmount()

    correccion.errorCorreccion = true
    renderPagina()
    expect(screen.getByText("Ese turno no se pudo abrir")).toBeInTheDocument()
  })

  it("todas cerradas: lo dice", () => {
    datos.corridas = datos.corridas.filter((c) => c.id === "c4" || c.id === "c5")
    renderPagina()
    expect(screen.getByText(/No hay corridas pendientes de carga/)).toBeInTheDocument()
  })

  it("varios sabores y lotes: se eligen con botones", async () => {
    const u = userEvent.setup()
    datos.corridas = [
      corrida({ id: "a1" }),
      corrida({ id: "a2", linea: "LINEA_2", lote: "0005", loteId: "p5" }),
      corrida({ id: "b1", linea: "LINEA_3", saborId: "s2", saborNombre: "Mango", lote: "0002", loteId: "p2" }),
    ]
    renderPagina()
    expect(screen.queryByPlaceholderText("Paletas")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Fresa.*2 lotes · 2 líneas/ })).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: /Fresa/ }))
    expect(screen.queryByPlaceholderText("Paletas")).not.toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: /Lote 0005/ }))
    expect(screen.getAllByPlaceholderText("Paletas")).toHaveLength(1)
    expect(tarjeta("Línea 2", "0005").getByPlaceholderText("Paletas")).toBeInTheDocument()
  })
})

describe("Producto Terminado — cerrar una corrida", () => {
  it("Terminar: termina, suma contador, carga PT y pide medir el tanque", async () => {
    const u = userEvent.setup()
    renderPagina()
    const t = tarjeta("Línea 1")
    expect(t.getByRole("button", { name: "Cerrar" })).toBeDisabled()
    await escribir(u, t, "Sumar al contador", "1200")
    await escribir(u, t, "Envases buenos", "1150")
    await escribir(u, t, "Paletas", "10")
    await escribir(u, t, "Cajas sueltas", "90")
    expect(t.getByRole("button", { name: "Cerrar" })).toBeDisabled()
    await u.click(t.getByRole("button", { name: "Terminar" }))
    await u.click(t.getByRole("button", { name: "Cerrar" }))
    await screen.findByText("Medir Tanque 1")
    expect(orden).toEqual([
      'terminar ["c1"]',
      'contador [{"corridaId":"c1","linea":"LINEA_1","envasesLlenadora":1200,"envasesBuenos":1150,"justificacion":""}]',
      'producto [{"corridaId":"c1","linea":"LINEA_1","saborId":"s1","presentacion":"1000","paletas":10,"cajasSueltas":90}]',
      "recargar",
    ])
    expect(screen.getByText("Teórico ahora: 6.500 L")).toBeInTheDocument()
    await u.type(screen.getByPlaceholderText("Litros medidos"), "500")
    await u.click(screen.getByRole("button", { name: "Guardar medición" }))
    expect(orden.at(-1)).toBe("medir [1,500]")
    await waitFor(() => expect(screen.queryByText("Medir Tanque 1")).not.toBeInTheDocument())
  })

  it("Entregar línea: carga PT y entrega (sin contador nuevo)", async () => {
    const u = userEvent.setup()
    renderPagina()
    const t = tarjeta("Línea 1")
    await escribir(u, t, "Paletas", "12")
    await u.click(t.getByRole("button", { name: "Entregar línea (sigue el próximo turno)" }))
    await u.click(t.getByRole("button", { name: "Cerrar" }))
    await screen.findByText("Medir Tanque 1")
    expect(orden).toEqual([
      'producto [{"corridaId":"c1","linea":"LINEA_1","saborId":"s1","presentacion":"1000","paletas":12,"cajasSueltas":50}]',
      "recargar",
      'entregar ["c1"]',
    ])
    await u.click(screen.getByRole("button", { name: "No medir ahora" }))
    expect(screen.queryByText("Medir Tanque 1")).not.toBeInTheDocument()
  })

  it("si falla un paso, se corta ahí y muestra el error", async () => {
    const u = userEvent.setup()
    acc.registrarProductoTerminado = vi.fn(async () => (orden.push("producto"), falla("La corrida ya cerró")))
    renderPagina()
    const t = tarjeta("Línea 1")
    await escribir(u, t, "Paletas", "12")
    await u.click(t.getByRole("button", { name: "Terminar" }))
    await u.click(t.getByRole("button", { name: "Cerrar" }))
    expect(await t.findByRole("alert")).toHaveTextContent("La corrida ya cerró")
    expect(orden).toEqual(['terminar ["c1"]', "producto"])
    expect(screen.queryByText("Medir Tanque 1")).not.toBeInTheDocument()
  })

  it("si la medición falla, muestra el error y no se va", async () => {
    const u = userEvent.setup()
    acc.medirTanque = vi.fn(async () => falla("Tanque cerrado"))
    renderPagina()
    const t = tarjeta("Línea 1")
    await escribir(u, t, "Paletas", "12")
    await u.click(t.getByRole("button", { name: "Terminar" }))
    await u.click(t.getByRole("button", { name: "Cerrar" }))
    await screen.findByText("Medir Tanque 1")
    await u.type(screen.getByPlaceholderText("Litros medidos"), "0")
    await u.click(screen.getByRole("button", { name: "Guardar medición" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Tanque cerrado")
    expect(screen.getByText("Medir Tanque 1")).toBeInTheDocument()
  })
})

describe("Producto Terminado — validaciones", () => {
  it("el Contador 2 es obligatorio y no puede superar al de la llenadora", async () => {
    const u = userEvent.setup()
    renderPagina()
    const t = tarjeta("Línea 1")
    await u.click(t.getByRole("button", { name: "Terminar" }))
    await escribir(u, t, "Sumar al contador", "1000")
    expect(t.getByRole("alert")).toHaveTextContent("El Contador 2 (envases buenos) es obligatorio")
    expect(t.getByRole("button", { name: "Cerrar" })).toBeDisabled()
    await escribir(u, t, "Envases buenos", "1100")
    expect(t.getByRole("alert")).toHaveTextContent("Los envases buenos no pueden superar el total de la llenadora.")
    await escribir(u, t, "Envases buenos", "900")
    expect(t.queryByRole("alert")).not.toBeInTheDocument()
    // Con el PT ya cargado (9 paletas + 50 cajas) la merma pasa del 3%: falta la justificación.
    expect(t.getByRole("button", { name: "Cerrar" })).toBeDisabled()
    await u.type(t.getByPlaceholderText("Justificación de la merma..."), "x")
    expect(t.getByRole("button", { name: "Cerrar" })).toBeEnabled()
  })

  it("con merma sobre el límite pide justificación y la manda con el contador", async () => {
    const u = userEvent.setup()
    renderPagina()
    const t = tarjeta("Línea 1")
    await escribir(u, t, "Sumar al contador", "1200")
    await escribir(u, t, "Envases buenos", "1150")
    await escribir(u, t, "Paletas", "10")
    await escribir(u, t, "Cajas sueltas", "0")
    expect(t.getByText(/supera el 3%, requiere justificación/)).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: "Terminar" }))
    expect(t.getByRole("button", { name: "Cerrar" })).toBeDisabled()
    await u.type(t.getByPlaceholderText("Justificación de la merma..."), " Se rompió una bobina ")
    await u.click(t.getByRole("button", { name: "Cerrar" }))
    await screen.findByText("Medir Tanque 1")
    expect(orden[1]).toContain('"justificacion":"Se rompió una bobina"')
  })
})

describe("Producto Terminado — otros estados de la corrida", () => {
  it("esperando cierre: solo Registrar, sin elegir qué pasa ni medir", async () => {
    const u = userEvent.setup()
    renderPagina()
    const t = tarjeta("Línea 3")
    expect(t.queryByText("¿Qué pasa con esta línea?")).not.toBeInTheDocument()
    await escribir(u, t, "Paletas", "3")
    await u.click(t.getByRole("button", { name: "Registrar" }))
    await waitFor(() => expect(orden).toContain("recargar"))
    expect(orden[0]).toContain('"corridaId":"c3"')
    expect(screen.queryByText(/Medir Tanque/)).not.toBeInTheDocument()
  })

  it("parada: avisa pero deja cargar el PT y entregarla (corte de turno sin reanudar)", () => {
    renderPagina()
    expect(screen.getByText(/Línea 2 está parada \(o en CIP\) desde las/)).toBeInTheDocument()
    const t = tarjeta("Línea 2")
    expect(t.getByPlaceholderText("Paletas")).toBeInTheDocument()
    expect(t.getByRole("button", { name: /Entregar línea/ })).toBeInTheDocument()
  })

  it("cerrada (entregada): solo lectura; «Editar un error» corrige y Cancelar vuelve", async () => {
    const u = userEvent.setup()
    renderPagina()
    await u.click(screen.getByRole("button", { name: /Ver corridas cerradas/ }))
    await u.click(screen.getByRole("button", { name: /Mango/ }))
    let t = tarjeta("Línea 1", "0002")
    expect(t.getByText("Cerrada")).toBeInTheDocument()
    expect(t.getByText("Entregada a las 14:50")).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: "Editar un error" }))
    t = tarjeta("Línea 1", "0002")
    expect(t.getByPlaceholderText("Paletas")).toHaveValue(2)
    await escribir(u, t, "Paletas", "3")
    await u.click(t.getByRole("button", { name: "Guardar corrección" }))
    await waitFor(() => expect(orden[0]).toContain('"corridaId":"c4","linea":"LINEA_1","saborId":"s2","presentacion":"1000","paletas":3,"cajasSueltas":40'))
    expect(screen.queryByText(/Medir Tanque/)).not.toBeInTheDocument()
    await waitFor(() => expect(tarjeta("Línea 1", "0002").getByText("Cerrada")).toBeInTheDocument())

    await u.click(tarjeta("Línea 1", "0002").getByRole("button", { name: "Editar un error" }))
    await u.click(tarjeta("Línea 1", "0002").getByRole("button", { name: "Cancelar" }))
    expect(tarjeta("Línea 1", "0002").getByText("Cerrada")).toBeInTheDocument()
  })

  it("cerrada sin PT (entregada sola): ofrece cargarlo", async () => {
    const u = userEvent.setup()
    datos.pt = datos.pt.filter((p) => p.corridaId !== "c4")
    datos.corridas = datos.corridas.map((c) => (c.id === "c4" ? { ...c, entregaAutomatica: true } : c))
    renderPagina()
    await u.click(screen.getByRole("button", { name: /Ver corridas cerradas/ }))
    await u.click(screen.getByRole("button", { name: /Mango/ }))
    const t = tarjeta("Línea 1", "0002")
    expect(t.getByText("Entregada sola (cambio de turno) a las 14:50")).toBeInTheDocument()
    expect(t.getByRole("button", { name: "Cargar Producto Terminado" })).toBeInTheDocument()
  })
})

describe("Producto Terminado — turno ya cerrado", () => {
  it("en la gracia de 30 min: contador y PT, sin cerrar la línea", async () => {
    const u = userEvent.setup()
    sesion.turnoId = null
    sesion.turnoGraciaPT = { turnoId: "t-0", codigo: "T1-0510" }
    const { container } = renderPagina()
    expect(pedidoCon.produccion.at(-1)).toBe("t-0")
    expect(screen.getByTestId("descripcion")).toHaveTextContent("Turno T1-0510 — ya cerrado")
    expect(screen.getByText(/Este turno ya se cerró/)).toBeInTheDocument()
    const t = tarjeta("Línea 1")
    expect(t.getByPlaceholderText("Sumar al contador")).toBeInTheDocument()
    expect(t.queryByText("¿Qué pasa con esta línea?")).not.toBeInTheDocument()
    await escribir(u, t, "Paletas", "11")
    await u.click(t.getByRole("button", { name: "Registrar" }))
    await waitFor(() => expect(orden[0]).toContain('"paletas":11'))
    expect(actaPedida).toHaveBeenCalledWith("t-0")
    expect(html(container)).toMatchSnapshot()
  })

  it("con un turno nuevo abierto, el anterior en gracia se elige a mano", async () => {
    const u = userEvent.setup()
    sesion.turnoGraciaPT = { turnoId: "t-0", codigo: "T1-0510" }
    renderPagina()
    expect(pedidoCon.produccion.at(-1)).toBe("t-1")
    await u.click(screen.getByRole("button", { name: "Cargar en el turno anterior" }))
    expect(pedidoCon.produccion.at(-1)).toBe("t-0")
    expect(screen.getByText("Estás cargando el turno anterior (T1-0510).")).toBeInTheDocument()
    await u.click(screen.getByRole("button", { name: "Volver al turno en curso" }))
    expect(pedidoCon.produccion.at(-1)).toBe("t-1")
  })

  it("modo corrección: banner, contador y PT", () => {
    Object.assign(correccion, { turnoIdEfectivo: "t-9", enModoCorreccion: true, turnoCorregido: { codigo: "T3-0410" } })
    renderPagina()
    expect(pedidoCon.produccion.at(-1)).toBe("t-9")
    expect(screen.getByTestId("banner-correccion")).toHaveTextContent("T3-0410")
    expect(screen.getByTestId("descripcion")).toHaveTextContent("Turno T3-0410 (corrección)")
    expect(screen.getByText(/En modo corrección se cargan contadores y Producto Terminado/)).toBeInTheDocument()
    expect(tarjeta("Línea 1").getByPlaceholderText("Sumar al contador")).toBeInTheDocument()
  })
})
