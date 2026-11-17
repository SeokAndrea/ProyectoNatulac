import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RobotTavil from "@/pages/apps/RobotTavil"
import type { CorridaRobot, LineaRobot } from "@/lib/robotTavil"
import type { Paleta } from "@/lib/trazabilidadPaletizado"

/*
 * Pantalla del operador del Robot Tavil: qué muestra en cada estado de la
 * línea y qué manda. Las reglas (qué corrida, cuándo se bloquea, el Nº de
 * paleta, el ticket repetido) están en la base; aquí solo se prueba que la
 * pantalla las respeta.
 */

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { username: "op", permisos: ["ROBOT_TAVIL_CARGAR"] } }) }))
vi.mock("@/lib/catalogosLive", () => ({
  useCatalogosLive: () => ({ presentaciones: [{ codigo: "1000", nombre: "1 L", volumenMl: 1000 }] }),
}))

const estado = { lineas: [] as LineaRobot[], error: null as string | null, errorAccion: null as string | null }
const llamadas: string[] = []
const OK = { ok: true as const, data: [] as LineaRobot[] }
vi.mock("@/lib/robotTavil", () => ({
  useRobotTavil: () => ({
    lineas: estado.lineas,
    cargando: false,
    error: estado.error,
    ejecutar: async (fn: () => Promise<{ ok: boolean }>) => (await fn()).ok,
    intentar: async (fn: () => Promise<{ ok: boolean }>) => (await fn(), estado.errorAccion),
  }),
  avisoTicketRepetido: (e: string | null) => (e?.startsWith("TICKET_REPETIDO|") ? e.slice("TICKET_REPETIDO|".length) : null),
  sumarPaleta: vi.fn(
    async (u: string, l: string, d: { ticket: string; conforme: boolean; observacionCodigos: number[]; confirmarRepetido?: boolean }) => (
      llamadas.push(`sumar ${u} ${l} ${d.ticket} ${d.conforme ? "C" : `NC ${d.observacionCodigos.join(",")}`}${d.confirmarRepetido ? " REPETIDO" : ""}`), OK
    ),
  ),
  editarPaleta: vi.fn(async (u: string, id: string, d: { ticket: string; tipoPaletizado: string; cajas: number }) => (
    llamadas.push(`editar ${u} ${id} ${d.ticket} ${d.tipoPaletizado} ${d.cajas}`), OK
  )),
  cambiarManual: vi.fn(async (u: string, l: string, m: boolean) => (llamadas.push(`manual ${u} ${l} ${m}`), OK)),
  restarPaleta: vi.fn(async (u: string, l: string) => (llamadas.push(`restar ${u} ${l}`), OK)),
  guardarResto: vi.fn(async (u: string, l: string, c: number) => (llamadas.push(`resto ${u} ${l} ${c}`), OK)),
  iniciarLote: vi.fn(async (u: string, l: string) => (llamadas.push(`iniciar ${u} ${l}`), OK)),
}))

const corrida = (over: Partial<CorridaRobot> = {}): CorridaRobot => ({
  id: "c1",
  lote: "2411",
  saborNombre: "Fresa",
  presentacionMl: 1000,
  paletas: 8,
  ultimaPaletaEn: "2026-11-04T16:01:00+00:00",
  resto: 12,
  entregada: false,
  abierta: false,
  ...over,
})
const paleta = (over: Partial<Paleta> = {}): Paleta => ({
  id: "p1",
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  fechaProduccion: "2026-11-04",
  turnoTipo: "TURNO_1",
  creadaEn: "2026-11-04T16:01:00+00:00",
  numero: 8,
  ticket: "T-108",
  tipoPaletizado: "AUTOMATICO",
  cajas: 85,
  conforme: true,
  observacionCodigos: [],
  observacionOtros: null,
  accionCorreccion: null,
  lote: "2411",
  saborCodigo: "MZ",
  saborNombre: "Manzana",
  presentacionMl: 1000,
  presentacionCodigo: "TBA-1000 cm3",
  editadaEn: null,
  editadaPor: null,
  ...over,
})
const linea = (over: Partial<LineaRobot> = {}): LineaRobot => ({
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  estado: "EN_CURSO",
  puedeSumar: true,
  corrida: corrida(),
  sinCorrida: 0,
  nueva: null,
  anterior: null,
  manual: false,
  proximoNumero: 9,
  proximoTurno: "TURNO_1",
  proximoSaborCodigo: "MZ",
  proximoPresentacionCodigo: "TBA-1000 cm3",
  paletasDia: [],
  anuladasDia: 0,
  ...over,
})

const tarjeta = () => within(document.querySelector<HTMLElement>('[data-slot="card"]')!)

beforeEach(() => {
  estado.lineas = []
  estado.error = null
  estado.errorAccion = null
  llamadas.length = 0
})

describe("Robot Tavil", () => {
  it("sin líneas activas lo dice", () => {
    render(<RobotTavil />)
    expect(screen.getByText("No hay líneas activas")).toBeInTheDocument()
  })

  it("en curso: cuenta, muestra el próximo Nº y el «−» manda la línea", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText("8")).toBeInTheDocument()
    expect(t.getByText("Lote 2411")).toBeInTheDocument()
    expect(t.getByText("1 L")).toBeInTheDocument()
    expect(t.getByText("Nº 9")).toBeInTheDocument()
    expect(t.getByText(/última a las 12:01/)).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: "Quitar una paleta de Línea 1" }))
    expect(llamadas).toEqual(["restar op LINEA_1"])
  })

  it("el «+» abre el cuadro, exige el ticket y crea la paleta", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    render(<RobotTavil />)
    await u.click(tarjeta().getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    const cuadro = within(screen.getByRole("dialog"))
    expect(cuadro.getByText("Nueva paleta · Línea 1")).toBeInTheDocument()
    expect(cuadro.queryByText("Paleta manual")).not.toBeInTheDocument()
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    expect(cuadro.getByRole("alert")).toHaveTextContent("Escribe el número de ticket")
    expect(llamadas).toEqual([])
    await u.type(cuadro.getByLabelText("Nº de ticket"), " T-200 ")
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    await waitFor(() => expect(llamadas).toEqual(["sumar op LINEA_1 T-200 C"]))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("no conforme exige la observación y la manda", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    render(<RobotTavil />)
    await u.click(tarjeta().getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    const cuadro = within(screen.getByRole("dialog"))
    await u.type(cuadro.getByLabelText("Nº de ticket"), "T-201")
    await u.click(cuadro.getByRole("switch", { name: /No conforme/ }))
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    expect(cuadro.getByRole("alert")).toHaveTextContent("Marca al menos una observación")
    await u.click(cuadro.getByRole("checkbox", { name: /Poliestrech rasgado/ }))
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    await waitFor(() => expect(llamadas).toEqual(["sumar op LINEA_1 T-201 NC 5"]))
  })

  it("otro error del servidor se queda en el cuadro", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    estado.errorAccion = "Esta línea no tiene una corrida en curso."
    render(<RobotTavil />)
    await u.click(tarjeta().getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    const cuadro = within(screen.getByRole("dialog"))
    await u.type(cuadro.getByLabelText("Nº de ticket"), "T-108")
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    expect(await cuadro.findByText(/no tiene una corrida en curso/)).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("ticket repetido: avisa dónde está y guarda con el segundo clic", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    estado.errorAccion = "TICKET_REPETIDO|Este ticket ya está registrado en la paleta Nº 3 de la Línea 1 (04/11/2026)."
    render(<RobotTavil />)
    await u.click(tarjeta().getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    const cuadro = within(screen.getByRole("dialog"))
    await u.type(cuadro.getByLabelText("Nº de ticket"), "T-108")
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    expect(await cuadro.findByText(/ya está registrado en la paleta Nº 3/)).toBeInTheDocument()
    expect(cuadro.queryByText(/TICKET_REPETIDO/)).not.toBeInTheDocument()
    // Cambiar el ticket quita el aviso; volver al repetido lo pide de nuevo.
    await u.type(cuadro.getByLabelText("Nº de ticket"), "9")
    expect(cuadro.getByRole("button", { name: "Crear paleta" })).toBeInTheDocument()
    await u.type(cuadro.getByLabelText("Nº de ticket"), "{backspace}")
    await u.click(cuadro.getByRole("button", { name: "Crear paleta" }))
    estado.errorAccion = null
    await u.click(await cuadro.findByRole("button", { name: "Sí, guardar con el ticket repetido" }))
    await waitFor(() => expect(llamadas).toEqual(["sumar op LINEA_1 T-108 C", "sumar op LINEA_1 T-108 C", "sumar op LINEA_1 T-108 C REPETIDO"]))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("la franja «Paleta manual» pide confirmación antes de cambiar", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    render(<RobotTavil />)
    const franja = tarjeta().getByRole("switch", { name: "Paleta manual en Línea 1" })
    expect(franja).toHaveAttribute("aria-checked", "false")
    await u.click(franja)
    const cuadro = within(screen.getByRole("dialog"))
    expect(cuadro.getByText("¿Encender «Paleta manual» en la Línea 1?")).toBeInTheDocument()
    expect(llamadas).toEqual([])
    await u.click(cuadro.getByRole("button", { name: "Sí, encender" }))
    await waitFor(() => expect(llamadas).toEqual(["manual op LINEA_1 true"]))
  })

  it("con «Paleta manual» encendida, el cuadro del «+» avisa que se guarda como Manual", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea({ manual: true })]
    render(<RobotTavil />)
    expect(tarjeta().getByText(/las nuevas se guardan como Manual/)).toBeInTheDocument()
    await u.click(tarjeta().getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    expect(within(screen.getByRole("dialog")).getByText(/esta paleta se guardará como Manual/)).toBeInTheDocument()
  })

  it("la lista de paletas muestra solo la última y se extiende", async () => {
    const u = userEvent.setup()
    estado.lineas = [
      linea({
        paletasDia: [
          paleta({ id: "p3", numero: 3, ticket: "T-103", tipoPaletizado: "MANUAL" }),
          paleta({ id: "p2", numero: 2, ticket: "T-102", conforme: false, observacionCodigos: [1] }),
          paleta({ id: "p1", numero: 1, ticket: "T-101" }),
        ],
        anuladasDia: 1,
      }),
    ]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText(/3 en el día · 1 anulada · se muestra la última/)).toBeInTheDocument()
    expect(t.getByText("T-103")).toBeInTheDocument()
    expect(t.queryByText("T-102")).not.toBeInTheDocument()
    await u.click(t.getByRole("button", { name: /Ver todas/ }))
    expect(t.getByText("T-102")).toBeInTheDocument()
    expect(t.getByText("T-101")).toBeInTheDocument()
    expect(t.getByText("NC")).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: /Contraer/ }))
    expect(t.queryByText("T-101")).not.toBeInTheDocument()
  })

  it("tocar una paleta de la lista permite corregirla", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea({ paletasDia: [paleta()] })]
    render(<RobotTavil />)
    await u.click(tarjeta().getByRole("button", { name: /T-108/ }))
    const cuadro = within(screen.getByRole("dialog"))
    expect(cuadro.getByText("Paleta Nº 8 · Línea 1")).toBeInTheDocument()
    const ticket = cuadro.getByLabelText("Nº de ticket")
    await u.clear(ticket)
    await u.type(ticket, "T-109")
    await u.click(cuadro.getByRole("switch", { name: /Paleta manual/ }))
    await u.click(cuadro.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() => expect(llamadas).toEqual(["editar op p1 T-109 MANUAL 85"]))
  })

  it("con 0 paletas no deja quitar", () => {
    estado.lineas = [linea({ corrida: corrida({ paletas: 0, ultimaPaletaEn: null }) })]
    render(<RobotTavil />)
    expect(tarjeta().getByRole("button", { name: "Quitar una paleta de Línea 1" })).toBeDisabled()
  })

  it("el Resto se escribe y se guarda al salir del campo", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea({ corrida: corrida({ resto: 0 }) })]
    render(<RobotTavil />)
    const campo = tarjeta().getByLabelText("Resto (cajas sueltas)")
    await u.type(campo, "15")
    fireEvent.blur(campo)
    await waitFor(() => expect(llamadas).toEqual(["resto op LINEA_1 15"]))
    expect(await tarjeta().findByText(/^Guardado \d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it("terminada: bloquea todo y lo explica", () => {
    estado.lineas = [linea({ estado: "TERMINADA", puedeSumar: false, proximoNumero: null })]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText("El supervisor terminó esta corrida")).toBeInTheDocument()
    expect(t.getByText(/Quedó con 8 paletas y 12 cajas sueltas/)).toBeInTheDocument()
    expect(t.getByRole("button", { name: "Sumar una paleta a Línea 1" })).toBeDisabled()
    expect(t.getByLabelText("Resto (cajas sueltas)")).toBeDisabled()
  })

  it("lote nuevo: «Iniciar con el lote» pasa a contarlo", async () => {
    const u = userEvent.setup()
    estado.lineas = [
      linea({ estado: "LOTE_NUEVO", puedeSumar: false, nueva: corrida({ id: "c2", lote: "2415", saborNombre: "Naranja", paletas: 0, resto: 0 }) }),
    ]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText("El supervisor cargó un lote nuevo en esta línea")).toBeInTheDocument()
    expect(t.getByText(/Lote 2415 · Naranja · 1 L\. La corrida anterior cerró con 8 paletas y 12 cajas sueltas\./)).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: "Iniciar con el lote 2415" }))
    expect(llamadas).toEqual(["iniciar op LINEA_1"])
  })

  it("entregada: cuenta las del turno siguiente y el Resto no se toca", () => {
    estado.lineas = [linea({ estado: "ENTREGADA", sinCorrida: 2, corrida: corrida({ entregada: true }) })]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText("El supervisor entregó la línea al siguiente turno")).toBeInTheDocument()
    expect(t.getByText("2")).toBeInTheDocument()
    expect(t.getByText("paletas para el turno siguiente")).toBeInTheDocument()
    expect(t.getByRole("button", { name: "Sumar una paleta a Línea 1" })).toBeEnabled()
    expect(t.getByLabelText("Resto (cajas sueltas)")).toBeDisabled()
  })

  it("lote recién iniciado: avisa cómo cerró el anterior", () => {
    estado.lineas = [
      linea({ corrida: corrida({ id: "c2", lote: "2415", paletas: 0, resto: 0, ultimaPaletaEn: null }), anterior: corrida() }),
    ]
    render(<RobotTavil />)
    expect(tarjeta().getByText("Lote 2415 en curso. El lote 2411 cerró con 8 paletas y 12 cajas sueltas.")).toBeInTheDocument()
  })

  it("lote recién iniciado con el anterior abierto: no dice que cerró", () => {
    estado.lineas = [
      linea({
        corrida: corrida({ id: "c2", lote: "2415", paletas: 0, resto: 0, ultimaPaletaEn: null }),
        anterior: corrida({ abierta: true }),
      }),
    ]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(
      t.getByText("Lote 2415 en curso. El lote 2411 sigue abierto con 8 paletas y 12 cajas sueltas hasta que el supervisor lo cierre."),
    ).toBeInTheDocument()
    expect(t.queryByText(/cerró/)).not.toBeInTheDocument()
  })

  it("muestra el error de la base", () => {
    estado.lineas = [linea()]
    estado.error = "Esta línea no tiene una corrida en curso."
    render(<RobotTavil />)
    expect(screen.getByRole("alert")).toHaveTextContent("Esta línea no tiene una corrida en curso.")
  })
})
