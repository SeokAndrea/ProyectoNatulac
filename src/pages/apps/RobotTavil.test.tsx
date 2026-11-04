import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RobotTavil from "@/pages/apps/RobotTavil"
import type { CorridaRobot, LineaRobot } from "@/lib/robotTavil"

/*
 * Pantalla del operador del Robot Tavil: qué muestra en cada estado de la
 * línea y qué manda. Las reglas (qué corrida, cuándo se bloquea) están en la
 * base; aquí solo se prueba que la pantalla las respeta.
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

const estado = { lineas: [] as LineaRobot[], error: null as string | null }
const llamadas: string[] = []
const OK = { ok: true as const, data: [] as LineaRobot[] }
vi.mock("@/lib/robotTavil", () => ({
  useRobotTavil: () => ({
    lineas: estado.lineas,
    cargando: false,
    error: estado.error,
    ejecutar: async (fn: () => Promise<{ ok: boolean }>) => (await fn()).ok,
  }),
  sumarPaleta: vi.fn(async (u: string, l: string) => (llamadas.push(`sumar ${u} ${l}`), OK)),
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
  ...over,
})

const tarjeta = () => within(document.querySelector<HTMLElement>('[data-slot="card"]')!)

beforeEach(() => {
  estado.lineas = []
  estado.error = null
  llamadas.length = 0
})

describe("Robot Tavil", () => {
  it("sin líneas activas lo dice", () => {
    render(<RobotTavil />)
    expect(screen.getByText("No hay líneas activas")).toBeInTheDocument()
  })

  it("en curso: cuenta, «+» y «−» mandan la línea y muestra la última paleta", async () => {
    const u = userEvent.setup()
    estado.lineas = [linea()]
    render(<RobotTavil />)
    const t = tarjeta()
    expect(t.getByText("8")).toBeInTheDocument()
    expect(t.getByText("Lote 2411")).toBeInTheDocument()
    expect(t.getByText("1 L")).toBeInTheDocument()
    expect(t.getByText("Última paleta: 12:01")).toBeInTheDocument()
    await u.click(t.getByRole("button", { name: "Sumar una paleta a Línea 1" }))
    await u.click(t.getByRole("button", { name: "Quitar una paleta de Línea 1" }))
    expect(llamadas).toEqual(["sumar op LINEA_1", "restar op LINEA_1"])
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
    estado.lineas = [linea({ estado: "TERMINADA", puedeSumar: false })]
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

  it("muestra el error de la base", () => {
    estado.lineas = [linea()]
    estado.error = "Esta línea no tiene una corrida en curso."
    render(<RobotTavil />)
    expect(screen.getByRole("alert")).toHaveTextContent("Esta línea no tiene una corrida en curso.")
  })
})
