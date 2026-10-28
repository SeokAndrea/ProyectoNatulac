import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ModoParadas } from "@/components/lineas/ModoParadas"
import type { Parada } from "@/lib/paradas"
import type { Corrida, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import type { TurnoActivo } from "@/lib/turno"

vi.mock("@/components/CintaEstadoLinea", () => ({ CintaEstadoLinea: () => <div /> }))
vi.mock("@/components/LineaVisual", () => ({ LineaVisual: () => <div /> }))
vi.mock("@/components/BuscadorTipoParada", () => ({
  BuscadorTipoParada: ({ onElegir }: { onElegir: (t: unknown) => void }) => (
    <button type="button" onClick={() => onElegir({ codigo: "FALLA_NIVEL_BTD", nombre: "Falla de Nivel del BTD", clase: "NO_PROGRAMADA", tiempoGuiaMin: null })}>
      Elegir tipo
    </button>
  ),
}))
vi.mock("@/lib/paradasEquipos", () => ({ useEquiposParadas: () => [] }))

let turno: TurnoActivo | null = null
let delTurno: Parada[] = []
vi.mock("@/lib/panelProduccion", () => ({
  obtenerEstadoPlantaActual: () => Promise.resolve(turno),
  obtenerTurnoDeFechaTipo: () => Promise.resolve(null),
}))
vi.mock("@/lib/paradasCatalogo", async (orig) => ({
  ...(await orig<object>()),
  useTiposActivos: () => [],
  cargarParadasDelTurno: () => Promise.resolve(delTurno),
}))
vi.mock("@/lib/produccion/useProduccion", () => ({ useProduccion: () => ({ corridas: [] }) }))
vi.mock("@/lib/productoTerminado", () => ({ useProductoTerminado: () => ({ registros: [], recargar: async () => {} }) }))
const abrirParadaMantenimiento = vi.fn()
const anotarParada = vi.fn()
vi.mock("@/lib/paradas", async (orig) => ({
  ...(await orig<object>()),
  abrirParadaMantenimiento: (...a: unknown[]) => abrirParadaMantenimiento(...a),
  anotarParada: (...a: unknown[]) => anotarParada(...a),
  paradaCruzoTurnoCerrado: () => Promise.resolve(false),
}))

const dd = (n: number) => String(n).padStart(2, "0")
const ahoraLocal = (menos = 0) => {
  const d = new Date(Date.now() - menos * 60000)
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}:00`
}

function corrida(over: Partial<Corrida> = {}): Corrida {
  return {
    id: "c1", linea: "LINEA_1", presentacion: "1000", envasesHora: 6000, saborId: "s1", saborNombre: "Fresa", lote: "0001", loteId: "L1",
    activa: true, activadaEn: ahoraLocal(90), pausadaEn: null, loteTerminado: null, finalizadaEn: null, esperandoCierre: false,
    entregadaEn: null, confirmadoInicioEn: ahoraLocal(90), ...over,
  }
}

function paradaMtto(over: Partial<Parada> = {}): Parada {
  return {
    id: "p1", clase: "NO_PROGRAMADA", origen: "MANUAL", responsable: "MANTENIMIENTO", lineaCodigo: "LINEA_1", turnoTipo: "TURNO_1",
    tipoCodigo: "FALLA_NIVEL_BTD", tipoNombre: "Falla de Nivel del BTD", tiempoGuiaMin: null, nota: "Se rompió", justificacionDesvio: null,
    inicio: ahoraLocal(20), fin: null, supervisorNombre: null, subsistemaCodigo: null, lote: null, sabor: null, terminadaPor: null, ...over,
  }
}

const estado: LineaEstado = { linea: "LINEA_1", condicion: "LISTA", activadaEn: ahoraLocal(90), cipIniciadoEn: null, cipFinalizadoEn: null, observacion: null }
const detiene = (): ParadaQueDetiene => ({
  linea: "LINEA_1", paradaId: "p1", pendiente: false, tipoNombre: "Falla de Nivel del BTD", clase: "NO_PROGRAMADA", tiempoGuiaMin: null,
  nota: "Se rompió", inicio: ahoraLocal(20), fin: null, deMantenimiento: true,
})

function montar(over: { esMantenimiento?: boolean; corridas?: Corrida[]; paradasDetienen?: ParadaQueDetiene[] } = {}) {
  const acciones = { pausar: vi.fn().mockResolvedValue({ ok: true }), continuar: vi.fn().mockResolvedValue({ ok: true }), detener: vi.fn().mockResolvedValue({ ok: true }) }
  render(
    <MemoryRouter>
      <ModoParadas
        lineas={[{ codigo: "LINEA_1", nombre: "Línea 1" }]}
        corridas={over.corridas ?? [corrida({ pausadaEn: ahoraLocal(20) })]}
        lineasEstado={[estado]}
        usuario="u1"
        areaCodigo={over.esMantenimiento ? "MANTENIMIENTO" : "ASEPTICO"}
        pendientes={[]}
        onCambio={async () => {}}
        acciones={acciones}
        paradasDetienen={over.paradasDetienen ?? [detiene()]}
        esMantenimiento={over.esMantenimiento}
      />
    </MemoryRouter>,
  )
  return acciones
}
const etiquetaMtto = () => screen.findByText((_, el) => el?.tagName === "SPAN" && /^Mantenimiento · (19|20|21) min$/.test(el.textContent ?? ""))
const boton = (n: string | RegExp) => screen.queryByRole("button", { name: n })

beforeEach(() => {
  abrirParadaMantenimiento.mockReset()
  abrirParadaMantenimiento.mockResolvedValue({ ok: true })
  anotarParada.mockReset()
  anotarParada.mockResolvedValue({ ok: true })
  const d = new Date()
  turno = {
    id: "t1", codigo: "T1", fecha: `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`, horaInicio: "00:00:00", estado: "ABIERTO",
    fechaFin: null, horaFin: null, cierreAutomatico: false, esquema: "3x8", turnoTipo: "TURNO_1", grupo: "GRUPO_1", supervisorUsuario: "u1", supervisorNombre: "U",
    lineas: [], lineasEstado: [], tanques: [], tanquesEncontrados: null, contadores: [], preparaciones: [], productoTerminado: [], paradas: [],
  } as unknown as TurnoActivo
  delTurno = [paradaMtto()]
})

describe("ModoParadas — paradas de Mantenimiento", () => {
  it("el supervisor ve «Mantenimiento · tiempo» y Terminar parada, y no Continuar", async () => {
    montar()
    expect(await etiquetaMtto()).toBeInTheDocument()
    expect(boton("Terminar parada")).toBeInTheDocument()
    expect(boton("Continuar")).toBeNull()
    expect(boton("Entregar PT")).toBeInTheDocument()
  })

  it("con el interruptor encendido el supervisor no tiene Terminar parada ni Continuar", async () => {
    delTurno = [paradaMtto({ laTerminaMantenimiento: true })]
    montar()
    await etiquetaMtto()
    expect(boton("Terminar parada")).toBeNull()
    expect(boton("Continuar")).toBeNull()
  })

  it("la tarjeta ofrece Parar (no «Parada») con la línea corriendo", async () => {
    delTurno = []
    montar({ corridas: [corrida()], paradasDetienen: [] })
    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument()
    expect(boton("Parada")).toBeNull()
  })

  it("Mantenimiento entra sin los botones que manejan la línea, pero con Terminar parada, Parar y Anotar", async () => {
    montar({ esMantenimiento: true })
    expect(await screen.findByRole("button", { name: "Terminar parada" })).toBeInTheDocument()
    expect(boton("Parar")).toBeInTheDocument()
    expect(boton(/anotar/i)).toBeInTheDocument()
    for (const n of [/continuar/i, /entregar pt/i, /cip/i, /cambiar lote/i, /cubrir/i]) expect(boton(n)).toBeNull()
  })

  it("Mantenimiento con la línea libre también puede abrir su parada: no pide responsable y no pausa", async () => {
    delTurno = []
    const a = montar({ esMantenimiento: true, corridas: [], paradasDetienen: [] })
    await userEvent.click(await screen.findByRole("button", { name: "Parar" }))
    expect(screen.queryByRole("radio")).toBeNull()
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.type(screen.getByRole("textbox"), "Se rompió la faja")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    await waitFor(() => expect(abrirParadaMantenimiento).toHaveBeenCalled())
    expect(abrirParadaMantenimiento).toHaveBeenCalledWith(
      "u1",
      { lineaCodigo: "LINEA_1", tipoCodigo: "FALLA_NIVEL_BTD", nota: "Se rompió la faja", inicio: null },
      expect.any(String),
    )
    expect(a.pausar).not.toHaveBeenCalled()
  })

  it("el supervisor con la línea sin corrida abre una parada Operacional desde ahora, sin pausar nada", async () => {
    delTurno = []
    const a = montar({ corridas: [], paradasDetienen: [] })
    await userEvent.click(await screen.findByRole("button", { name: "Parar" }))
    await userEvent.click(screen.getByRole("radio", { name: "Operacional" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.type(screen.getByRole("textbox"), "Sin poder arrancar")
    await userEvent.click(screen.getByRole("button", { name: /confirmar parada/i }))
    await waitFor(() => expect(abrirParadaMantenimiento).toHaveBeenCalled())
    expect(abrirParadaMantenimiento).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ lineaCodigo: "LINEA_1", nota: "Sin poder arrancar", responsable: "OPERACIONAL", inicio: null }),
      expect.any(String),
    )
    expect(a.pausar).not.toHaveBeenCalled()
  })

  it("la parada Operacional abierta de una línea sin corrida se termina con Terminar parada, con su comienzo verdadero", async () => {
    delTurno = [paradaMtto({ responsable: "OPERACIONAL", inicio: ahoraLocal(30), inicioReal: ahoraLocal(60 * 24 * 6) })]
    montar({ corridas: [], paradasDetienen: [] })
    expect(await screen.findByRole("button", { name: "Terminar parada" })).toBeInTheDocument()
    expect(screen.getByText(/Desde el \d{2}\/\d{2} a las/)).toBeInTheDocument()
    expect(boton("Parar")).toBeInTheDocument()
  })

  it("Anotar minutos con otra parada ya cargada hasta ahora los pone antes de ella, sin chocar", async () => {
    const existente = paradaMtto({ id: "p9", responsable: "OPERACIONAL", inicio: ahoraLocal(10), fin: ahoraLocal(0) })
    delTurno = [existente]
    montar({ corridas: [], paradasDetienen: [] })
    await userEvent.click(await screen.findByRole("button", { name: /anotar/i }))
    await userEvent.click(screen.getByRole("button", { name: "Otra…" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    await userEvent.type(screen.getByPlaceholderText("Ej. 10"), "5")
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(anotarParada).toHaveBeenCalled())
    const datos = anotarParada.mock.calls[0][1] as { inicio: string; fin: string }
    expect(datos.fin <= existente.inicio.slice(0, 16) + ":59").toBe(true)
    expect(datos.fin > datos.inicio).toBe(true)
  })

  it("Anotar pregunta el Responsable: el supervisor empieza en Operacional y puede marcar Mantenimiento", async () => {
    montar({ corridas: [], paradasDetienen: [] })
    await userEvent.click(await screen.findByRole("button", { name: /anotar/i }))
    await userEvent.click(screen.getByRole("button", { name: "Otra…" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    expect(screen.getByRole("radio", { name: "Operacional" })).toHaveAttribute("aria-checked", "true")
    await userEvent.click(screen.getByRole("radio", { name: "Mantenimiento" }))
    await userEvent.type(screen.getByPlaceholderText("Ej. 10"), "5")
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(anotarParada).toHaveBeenCalled())
    expect(anotarParada.mock.calls[0][1]).toMatchObject({ responsable: "MANTENIMIENTO" })
  })

  it("Mantenimiento anota con el Responsable en Mantenimiento de entrada", async () => {
    montar({ esMantenimiento: true, corridas: [], paradasDetienen: [] })
    await userEvent.click(await screen.findByRole("button", { name: /anotar/i }))
    await userEvent.click(screen.getByRole("button", { name: "Otra…" }))
    await userEvent.click(screen.getByText("Elegir tipo"))
    expect(screen.getByRole("radio", { name: "Mantenimiento" })).toHaveAttribute("aria-checked", "true")
  })

  it("Terminar parada abre el formulario de cierre", async () => {
    montar()
    await userEvent.click(await screen.findByRole("button", { name: "Terminar parada" }))
    expect(await screen.findByLabelText(/qué se realizó/i)).toBeInTheDocument()
  })
})
