import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import TrazabilidadPaletizado from "@/pages/apps/TrazabilidadPaletizado"
import type { Paleta } from "@/lib/trazabilidadPaletizado"

/*
 * Tarjeta «Trazabilidad del paletizado»: filtros de turno y línea (por
 * defecto, todos; siempre queda uno), hojas por línea/presentación/tipo y
 * «Corregir» solo con TRAZABILIDAD_EDITAR.
 */

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
const sesion = { username: "ana", permisos: ["TRAZABILIDAD_VER"] as string[], rol: "OPERADOR", esDueno: false }
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: sesion }) }))

let n = 0
const paleta = (over: Partial<Paleta> = {}): Paleta => ({
  id: `p${++n}`,
  lineaCodigo: "LINEA_1",
  lineaNombre: "Línea 1",
  fechaProduccion: "2026-11-11",
  turnoTipo: "TURNO_1",
  creadaEn: "2026-11-11T12:00:00Z",
  numero: n,
  ticket: `T-${n}`,
  tipoPaletizado: "AUTOMATICO",
  cajas: 85,
  conforme: true,
  observacionCodigos: [],
  observacionOtros: null,
  accionCorreccion: null,
  lote: "261104",
  saborCodigo: "MZ",
  saborNombre: "Manzana",
  presentacionMl: 1000,
  presentacionCodigo: "TBA-1000 cm3",
  editadaEn: null,
  editadaPor: null,
  ...over,
})

const datos = { paletas: [] as Paleta[] }
const corregidas: string[] = []
vi.mock("@/lib/trazabilidadPaletizado", async (original) => ({
  ...(await original<typeof import("@/lib/trazabilidadPaletizado")>()),
  listarTrazabilidad: vi.fn(async () => ({
    ok: true,
    data: {
      lineas: [
        { codigo: "LINEA_1", nombre: "Línea 1" },
        { codigo: "LINEA_2", nombre: "Línea 2" },
        { codigo: "LINEA_3", nombre: "Línea 3" },
      ],
      paletas: datos.paletas,
    },
  })),
  corregirConformidad: vi.fn(async (_u: string, id: string, d: { conforme: boolean; observacionCodigos: number[] }) => {
    corregidas.push(`${id} ${d.conforme ? "C" : `NC ${d.observacionCodigos.join(",")}`}`)
    const p = datos.paletas.find((x) => x.id === id)!
    return { ok: true, data: { ...p, conforme: d.conforme, observacionCodigos: d.observacionCodigos, editadaEn: "ahora" } }
  }),
}))

beforeEach(() => {
  sesion.permisos = ["TRAZABILIDAD_VER"]
  corregidas.length = 0
  datos.paletas = [
    paleta({ ticket: "T-L1-T1" }),
    paleta({ ticket: "T-L1-T3", turnoTipo: "TURNO_3", creadaEn: "2026-11-12T03:00:00Z" }),
    paleta({ ticket: "T-L1-M", tipoPaletizado: "MANUAL", creadaEn: "2026-11-11T13:00:00Z" }),
    paleta({ ticket: "T-L3", lineaCodigo: "LINEA_3", lineaNombre: "Línea 3", presentacionCodigo: "TPA-330 cm3", presentacionMl: 330 }),
  ]
})

describe("Trazabilidad del paletizado", () => {
  it("por defecto: los 3 turnos y las 3 líneas, una hoja por línea/presentación/tipo", async () => {
    render(<TrazabilidadPaletizado />)
    expect(await screen.findByText("T-L1-T1")).toBeInTheDocument()
    expect(screen.getByText("Los 3 turnos del día (por defecto)")).toBeInTheDocument()
    expect(screen.getByText("Las 3 líneas (por defecto)")).toBeInTheDocument()
    expect(screen.getByText(/4 paletas/)).toBeInTheDocument()
    expect(screen.getByText(/en 3 hojas/)).toBeInTheDocument()
    expect(screen.getAllByText("Manual")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Corregir" })).not.toBeInTheDocument()
  })

  it("el filtro de turno deja solo ese turno y nunca queda vacío", async () => {
    const u = userEvent.setup()
    render(<TrazabilidadPaletizado />)
    await screen.findByText("T-L1-T1")
    const turnos = within(screen.getByRole("group", { name: "Turnos a mostrar" }))
    await u.click(turnos.getByRole("button", { name: "Turno 1" }))
    await u.click(turnos.getByRole("button", { name: "Turno 2" }))
    expect(screen.getByText("Solo: T3")).toBeInTheDocument()
    expect(screen.getByText("T-L1-T3")).toBeInTheDocument()
    expect(screen.queryByText("T-L1-T1")).not.toBeInTheDocument()
    await u.click(turnos.getByRole("button", { name: "Turno 3" }))
    expect(turnos.getByRole("button", { name: "Turno 3" })).toHaveAttribute("aria-pressed", "true")
  })

  it("el filtro de línea funciona igual que el de turno", async () => {
    const u = userEvent.setup()
    render(<TrazabilidadPaletizado />)
    await screen.findByText("T-L1-T1")
    const lineas = within(screen.getByRole("group", { name: "Líneas a mostrar" }))
    await u.click(lineas.getByRole("button", { name: "Línea 1" }))
    expect(screen.getByText("Solo: Línea 2, Línea 3")).toBeInTheDocument()
    expect(screen.getByText("T-L3")).toBeInTheDocument()
    expect(screen.queryByText("T-L1-T1")).not.toBeInTheDocument()
  })

  it("con TRAZABILIDAD_EDITAR corrige la conformidad (observación opcional)", async () => {
    const u = userEvent.setup()
    sesion.permisos = ["TRAZABILIDAD_EDITAR"]
    render(<TrazabilidadPaletizado />)
    await screen.findByText("T-L1-T1")
    await u.click(screen.getAllByRole("button", { name: "Corregir" })[0])
    const cuadro = within(screen.getByRole("dialog"))
    await u.click(cuadro.getByRole("switch", { name: /No conforme/ }))
    await u.click(cuadro.getByRole("button", { name: "Guardar corrección" }))
    await waitFor(() => expect(corregidas).toEqual([`${datos.paletas[0].id} NC `]))
    expect(await screen.findByText("NC")).toBeInTheDocument()
  })
})
