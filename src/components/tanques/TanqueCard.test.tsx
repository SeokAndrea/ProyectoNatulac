import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TanqueCard } from "@/components/tanques/TanqueCard"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import type { AnalisisCalidad } from "@/lib/calidad"
import type { Desvase } from "@/lib/desvases"
import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import type { Sabor } from "@/lib/sabores"

/*
 * Tarjeta de un tanque (Preparación y revisión de Status): qué se ve en
 * cada condición y con qué datos llama a cada acción. Se escribió ANTES
 * de partir TanqueCard en componentes chicos, para que el comportamiento
 * quede igual.
 */

const desvases = vi.fn()
vi.mock("@/lib/desvases", () => ({
  listarDesvases: (...args: unknown[]) => desvases(...args),
}))

beforeAll(() => {
  // Radix Select usa estas APIs del navegador que jsdom no trae.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => {
  desvases.mockReset()
  desvases.mockResolvedValue([])
})

const OK = { ok: true as const }
const falla = (error: string) => ({ ok: false as const, error })
const TURNO = "t-1"

const SABORES: Sabor[] = [
  { id: "s1", nombre: "Fresa", volumen: 200, activo: true, familiaId: "f1", familiaNombre: "Clásicos" },
  { id: "s2", nombre: "Mango", volumen: 180, activo: true, familiaId: "f1", familiaNombre: "Clásicos" },
]

function tanque(numero: 1 | 2 | 3, condicion: CondicionTanque, over: Partial<TanqueRecepcion> = {}): TanqueRecepcion {
  const conLiquido = condicion === "LISTO" || condicion === "STANDBY"
  return {
    numeroTanque: numero,
    saborId: conLiquido ? "s1" : null,
    saborNombre: conLiquido ? "Fresa" : null,
    condicion,
    volumenL: conLiquido ? 7000 : null,
    volumenInicialL: conLiquido ? 7000 : null,
    lote: conLiquido ? "0001" : null,
    activadaEn: "2026-10-05T07:00:00",
    ultimoSaborId: null,
    ultimoSaborNombre: null,
    ultimoLote: null,
    confirmadoInicioEn: "2026-10-05T07:00:00",
    confirmadoFinEn: null,
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    ...over,
  }
}

function prep(over: Partial<PreparacionRegistro> = {}): PreparacionRegistro {
  return {
    id: "p1",
    turnoId: TURNO,
    numeroTanque: 1,
    saborId: "s1",
    saborNombre: "Fresa",
    lote: "0001",
    volumenActualL: 7000,
    volumenPreparadoL: 7000,
    volumenAlIniciarTurnoL: 7000,
    tambores: 35,
    agua: null,
    azucar: null,
    acidoCitrico: null,
    creadoEn: "2026-10-05T07:00:00",
    liberadoEn: "2026-10-05T07:30:00",
    cerradoEn: null,
    ...over,
  }
}

const EN_PREP = prep({ id: "p2", lote: "0002", tambores: 10, volumenActualL: 2000, volumenPreparadoL: 2000, liberadoEn: null })

function corridaDe(loteId: string): Corrida {
  return {
    id: "c1",
    linea: "LINEA_1",
    presentacion: "1000",
    envasesHora: 6000,
    saborId: "s1",
    saborNombre: "Fresa",
    lote: "0001",
    loteId,
    activa: true,
    activadaEn: "2026-10-05T08:00:00",
    pausadaEn: null,
    loteTerminado: null,
    finalizadaEn: null,
    esperandoCierre: false,
    entregadaEn: null,
    confirmadoInicioEn: "2026-10-05T08:00:00",
  }
}

function analisis(over: Partial<AnalisisCalidad> = {}): AnalisisCalidad {
  return {
    id: "a1",
    preparacionId: "p2",
    brix: 10,
    acidez: 0.5,
    conforme: false,
    sensorialConforme: true,
    rango: null,
    observacion: "Muy dulce",
    analistaNombre: "Ana",
    creadoEn: "2026-10-05T08:00:00",
    ...over,
  }
}

interface Escenario {
  tanque: TanqueRecepcion
  modo?: ModoEstadoPlanta
  preparaciones?: PreparacionRegistro[]
  /** Los otros tanques (el de la tarjeta se agrega solo). */
  otros?: TanqueRecepcion[]
  corridas?: Corrida[]
  analisisPorLote?: Map<string, AnalisisCalidad[]>
  calidadLibera?: boolean | null
  puedeIrACalidad?: boolean
}

function crearAcciones() {
  return {
    cambiarCondicion: vi.fn().mockResolvedValue(OK),
    confirmarEstado: vi.fn().mockResolvedValue(OK),
    iniciarPreparacion: vi.fn().mockResolvedValue(OK),
    liberarLote: vi.fn().mockResolvedValue(OK),
    ajustar: vi.fn().mockResolvedValue(OK),
    fijarVolumenLote: vi.fn().mockResolvedValue(OK),
    transferir: vi.fn().mockResolvedValue(OK),
    desvasar: vi.fn().mockResolvedValue(OK),
    medirTanque: vi.fn().mockResolvedValue(OK),
    capturarRestoOrigen: vi.fn().mockResolvedValue(OK),
  }
}
type Acciones = ReturnType<typeof crearAcciones>

/** Única parte que depende de cómo TanqueCard recibe sus props. */
function renderCard(e: Escenario, acciones: Acciones = crearAcciones()) {
  render(
    <MemoryRouter>
      <TanqueCard
        tanque={e.tanque}
        sabores={SABORES}
        modo={e.modo ?? "preparacion"}
        preparaciones={e.preparaciones ?? []}
        tanquesDelTurno={[e.tanque, ...(e.otros ?? [])]}
        corridasDelTurno={e.corridas ?? []}
        areaCodigo="ASEPTICO"
        usuarioSesion="supervisor"
        analisisPorLote={e.analisisPorLote ?? new Map()}
        calidadLibera={e.calidadLibera === undefined ? false : e.calidadLibera}
        puedeIrACalidad={e.puedeIrACalidad ?? false}
        turnoId={TURNO}
        acciones={acciones}
      />
    </MemoryRouter>,
  )
  return acciones
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre })
const noHayBoton = (nombre: string | RegExp) => expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument()
async function elegir(u: ReturnType<typeof userEvent.setup>, combo: HTMLElement, opcion: RegExp) {
  await u.click(combo)
  await u.click(await screen.findByRole("option", { name: opcion }))
}

describe("TanqueCard — cómo se ve cada condición", () => {
  it("Liberado: volumen, sabor y lote", () => {
    renderCard({ tanque: tanque(1, "LISTO") })
    expect(screen.getByText("Liberado")).toBeInTheDocument()
    expect(screen.getByText("7.000 L")).toBeInTheDocument()
    expect(screen.getByText("Fresa · Lote 0001")).toBeInTheDocument()
  })

  it("Con Restos: el resto y qué se puede hacer", () => {
    renderCard({ tanque: tanque(1, "STANDBY", { volumenL: 300 }) })
    expect(screen.getByText("Con Restos 300 L")).toBeInTheDocument()
    expect(screen.getByText(/Resto de Fresa · Lote 0001 — ninguna línea lo toma/)).toBeInTheDocument()
  })

  it("Sucio: el último sabor y lote", () => {
    renderCard({ tanque: tanque(1, "SUCIO", { ultimoSaborNombre: "Fresa", ultimoLote: "0001" }) })
    expect(screen.getByText("Con Restos 0 L")).toBeInTheDocument()
    expect(screen.getByText("Último: Fresa · Lote 0001")).toBeInTheDocument()
  })

  it("Sucio con «Restos del lote» no repite «Lote»", () => {
    renderCard({ tanque: tanque(1, "SUCIO", { ultimoSaborNombre: "Fresa", ultimoLote: "Restos del lote 0003" }) })
    expect(screen.getByText("Último: Fresa · Restos del lote 0003")).toBeInTheDocument()
  })

  it("Sucio sin datos", () => {
    renderCard({ tanque: tanque(1, "SUCIO") })
    expect(screen.getByText("Sin datos del sabor anterior.")).toBeInTheDocument()
  })

  it("Limpio", () => {
    renderCard({ tanque: tanque(1, "LIMPIO") })
    expect(screen.getAllByText("Limpio")[0]).toBeInTheDocument()
    expect(screen.getByText("Disponible para preparación.")).toBeInTheDocument()
  })

  it("En Preparación: el lote abierto", () => {
    renderCard({ tanque: tanque(1, "EN_PREPARACION"), preparaciones: [EN_PREP] })
    expect(screen.getByText("En Preparación No Liberado")).toBeInTheDocument()
    expect(screen.getByText("Fresa · Lote 0002 · 10 tambores · 2000 L")).toBeInTheDocument()
  })

  it("En Preparación sin lote", () => {
    renderCard({ tanque: tanque(1, "EN_PREPARACION") })
    expect(screen.getByText("Sin datos de la preparación.")).toBeInTheDocument()
    noHayBoton(/Liberar/)
  })
})

describe("TanqueCard — CIP", () => {
  it("en CIP: Terminó CIP lo deja Limpio", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "CIP") })
    expect(screen.getByText("En CIP")).toBeInTheDocument()
    expect(screen.getByText(/Proceso de limpieza/)).toBeInTheDocument()
    noHayBoton("Iniciar Preparación")
    await u.click(boton("Terminó CIP"))
    expect(a.cambiarCondicion).toHaveBeenCalledWith({ numeroTanque: 1, condicion: "LIMPIO", saborId: null, volumenL: null, lote: null })
  })

  it("Iniciar CIP pide confirmar; Cancelar lo deshace", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "LIMPIO") })
    await u.click(boton("Iniciar CIP"))
    expect(a.cambiarCondicion).not.toHaveBeenCalled()
    await u.click(boton("Cancelar"))
    boton("Iniciar CIP")
    await u.click(boton("Iniciar CIP"))
    await u.click(boton("¿Seguro? Sí, iniciar CIP"))
    expect(a.cambiarCondicion).toHaveBeenCalledWith({ numeroTanque: 1, condicion: "CIP", saborId: null, volumenL: null, lote: null })
    await waitFor(() => boton("Iniciar CIP"))
  })
})

describe("TanqueCard — En Preparación: liberar y ajustar", () => {
  const base = (over: Partial<Escenario> = {}): Escenario => ({ tanque: tanque(1, "EN_PREPARACION"), preparaciones: [EN_PREP], ...over })

  it("sin Calidad, el supervisor libera", async () => {
    const u = userEvent.setup()
    const a = renderCard(base())
    await u.click(boton("Liberar (marcar Listo)"))
    expect(a.liberarLote).toHaveBeenCalledWith("p2")
  })

  it("si liberar falla, muestra el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.liberarLote.mockResolvedValue(falla("Falta medir"))
    renderCard(base(), a)
    await u.click(boton("Liberar (marcar Listo)"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta medir")
  })

  it("mientras se sabe si libera Calidad, Liberar queda bloqueado", () => {
    renderCard(base({ calidadLibera: null }))
    expect(boton("Liberar (marcar Listo)")).toBeDisabled()
  })

  it("con Calidad, espera el análisis (y lleva a Calidad si puede)", () => {
    renderCard(base({ calidadLibera: true, puedeIrACalidad: true }))
    noHayBoton(/Liberar/)
    expect(screen.getByText("Esperando análisis de Calidad")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a Calidad" })).toHaveAttribute("href", "/calidad")
  })

  it("con Calidad y análisis no conforme, muestra el resultado", () => {
    renderCard(base({ calidadLibera: true, analisisPorLote: new Map([["p2", [analisis()]]]) }))
    expect(screen.getByText("No conforme: ajustar y volver a pedir análisis")).toBeInTheDocument()
    expect(screen.getByText("Brix 10 · Acidez 0.5 · Muy dulce — Ana")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Ir a Calidad" })).not.toBeInTheDocument()
  })

  it("Ajustar suma litros al lote", async () => {
    const u = userEvent.setup()
    const a = renderCard(base())
    await u.click(boton("Ajustar"))
    expect(boton("Sumar")).toBeDisabled()
    await u.type(screen.getByPlaceholderText("Litros"), "50")
    await u.type(screen.getByPlaceholderText("Detalle (opcional)"), " agua ")
    await u.click(boton("Sumar"))
    expect(a.ajustar).toHaveBeenCalledWith("p2", 50, "agua")
    await waitFor(() => boton("Ajustar"))
  })

  it("Ajustar: si falla muestra el error; Cancelar cierra", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.ajustar.mockResolvedValue(falla("Lote cerrado"))
    renderCard(base(), a)
    await u.click(boton("Ajustar"))
    await u.type(screen.getByPlaceholderText("Litros"), "10")
    await u.click(boton("Sumar"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Lote cerrado")
    await u.click(boton("Cancelar"))
    boton("Ajustar")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("también se libera desde Status", async () => {
    const u = userEvent.setup()
    const a = renderCard(base({ modo: "status" }))
    await u.click(boton("Liberar (marcar Listo)"))
    expect(a.liberarLote).toHaveBeenCalledWith("p2")
  })
})

describe("TanqueCard — iniciar preparación", () => {
  it("Limpio: sabor, lote y tambores; estima los litros", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "LIMPIO") })
    noHayBoton("Medir tanque")
    noHayBoton("Transferir")
    noHayBoton("Desvase")
    await u.click(boton("Iniciar Preparación"))
    await elegir(u, screen.getByRole("combobox"), /Fresa/)
    await u.type(screen.getByPlaceholderText("Lote"), " 0002 ")
    await u.type(screen.getByPlaceholderText("Tambores"), "10")
    expect(screen.getByText(/≈/)).toHaveTextContent("≈ 2.000 L con este sabor (200 L por tambor)")
    await u.click(boton("Iniciar Preparación"))
    expect(desvases).toHaveBeenCalledWith("supervisor", "ASEPTICO", "s1")
    expect(a.iniciarPreparacion).toHaveBeenCalledWith({
      numeroTanque: 1,
      saborId: "s1",
      lote: "0002",
      tambores: 10,
      agua: null,
      azucar: null,
      acidoCitrico: null,
      desvaseId: null,
    })
    await waitFor(() => expect(screen.queryByPlaceholderText("Lote")).not.toBeInTheDocument())
  })

  it("si iniciar falla, muestra el error y deja el formulario", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.iniciarPreparacion.mockResolvedValue(falla("Lote repetido"))
    renderCard({ tanque: tanque(1, "LIMPIO") }, a)
    await u.click(boton("Iniciar Preparación"))
    await elegir(u, screen.getByRole("combobox"), /Fresa/)
    await u.type(screen.getByPlaceholderText("Lote"), "0002")
    await u.type(screen.getByPlaceholderText("Tambores"), "10")
    await u.click(boton("Iniciar Preparación"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Lote repetido")
    expect(screen.getByPlaceholderText("Lote")).toBeInTheDocument()
  })

  it("no deja pasar de la capacidad del tanque", async () => {
    const u = userEvent.setup()
    renderCard({ tanque: tanque(1, "LIMPIO") })
    await u.click(boton("Iniciar Preparación"))
    await elegir(u, screen.getByRole("combobox"), /Fresa/)
    await u.type(screen.getByPlaceholderText("Lote"), "0002")
    await u.type(screen.getByPlaceholderText("Tambores"), "101")
    expect(screen.getByText(/supera la capacidad del tanque \(20\.000 L\)/)).toBeInTheDocument()
    expect(boton("Iniciar Preparación")).toBeDisabled()
  })

  it("puede sumar un desvase guardado", async () => {
    const u = userEvent.setup()
    const guardado: Desvase = { id: "d1", saborId: "s1", saborNombre: "Fresa", litros: 500, loteOrigen: "0000", creadoEn: "2026-10-04T10:00:00" }
    desvases.mockResolvedValue([guardado])
    const a = renderCard({ tanque: tanque(1, "LIMPIO") })
    await u.click(boton("Iniciar Preparación"))
    await elegir(u, screen.getByRole("combobox"), /Fresa/)
    await u.type(screen.getByPlaceholderText("Lote"), "0002")
    await u.type(screen.getByPlaceholderText("Tambores"), "10")
    const combos = await screen.findAllByRole("combobox")
    expect(combos).toHaveLength(2)
    await elegir(u, combos[1], /500 L · desvasado/)
    expect(screen.getByText(/≈/)).toHaveTextContent("≈ 2.500 L con este sabor (200 L por tambor) + 500 L guardados")
    await u.click(boton("Iniciar Preparación"))
    expect(a.iniciarPreparacion).toHaveBeenCalledWith(expect.objectContaining({ desvaseId: "d1" }))
  })

  it("Cancelar cierra el formulario", async () => {
    const u = userEvent.setup()
    renderCard({ tanque: tanque(1, "LIMPIO") })
    await u.click(boton("Iniciar Preparación"))
    await u.click(boton("Cancelar"))
    expect(screen.queryByPlaceholderText("Lote")).not.toBeInTheDocument()
    boton("Iniciar CIP")
  })

  it("encima de un resto de otro sabor, avisa y pide confirmar la mezcla", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "STANDBY", { volumenL: 300 }), preparaciones: [prep()] })
    await u.click(boton("Iniciar Preparación"))
    expect(screen.getByText(/se suman los 300 L que quedaban en el tanque/)).toBeInTheDocument()
    await elegir(u, screen.getByRole("combobox"), /Mango/)
    await u.type(screen.getByPlaceholderText("Lote"), "0002")
    await u.type(screen.getByPlaceholderText("Kits"), "10")
    expect(screen.getByRole("alert")).toHaveTextContent("Quedan 300 L de Fresa en el tanque — se van a mezclar en silencio con el Mango nuevo.")
    await u.click(boton("Iniciar Preparación"))
    expect(a.iniciarPreparacion).not.toHaveBeenCalled()
    // Cancelar en la confirmación solo la deshace, no cierra el formulario.
    await u.click(boton("Cancelar"))
    boton("Iniciar Preparación")
    expect(screen.getByPlaceholderText("Lote")).toBeInTheDocument()
    await u.click(boton("Iniciar Preparación"))
    await u.click(boton("¿Seguro? Sí, mezclar y preparar"))
    expect(a.iniciarPreparacion).toHaveBeenCalledWith(expect.objectContaining({ saborId: "s2", tambores: 10 }))
  })

  it("Liberado: ofrece una nueva preparación y avisa del resto", () => {
    renderCard({ tanque: tanque(1, "LISTO"), preparaciones: [prep()], corridas: [corridaDe("p1")] })
    boton("Iniciar nueva preparación")
    expect(screen.getByText(/Quedan 7.000 L de Fresa sin usar — al preparar/)).toBeInTheDocument()
  })
})

describe("TanqueCard — medir, fijar volumen y desvase", () => {
  it("lote liberado sin corridas todavía: Fijar volumen real mueve el 100%", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "LISTO"), preparaciones: [prep()] })
    noHayBoton("Medir tanque")
    await u.click(boton("Fijar volumen real"))
    expect(screen.getByText(/es el 100% del lote/)).toBeInTheDocument()
    const input = screen.getByRole("spinbutton")
    await u.clear(input)
    await u.type(input, "6800")
    await u.click(boton("Fijar volumen"))
    expect(a.fijarVolumenLote).toHaveBeenCalledWith("p1", 6800)
    await waitFor(() => boton("Fijar volumen real"))
  })

  it("con una corrida que ya tomó del lote: Medir tanque", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "LISTO"), preparaciones: [prep()], corridas: [corridaDe("p1")] })
    noHayBoton("Fijar volumen real")
    await u.click(boton("Medir tanque"))
    const input = screen.getByRole("spinbutton")
    await u.clear(input)
    await u.type(input, "5000")
    await u.click(boton("Guardar medición"))
    expect(a.medirTanque).toHaveBeenCalledWith(1, 5000)
    await waitFor(() => boton("Medir tanque"))
  })

  it("lote de otro turno: Medir tanque", () => {
    renderCard({ tanque: tanque(1, "LISTO"), preparaciones: [prep({ turnoId: "t-0" })] })
    boton("Medir tanque")
  })

  it("Desvase pide confirmar; Cancelar lo deshace", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "STANDBY", { volumenL: 300 }) })
    await u.click(boton("Desvase"))
    expect(a.desvasar).not.toHaveBeenCalled()
    await u.click(boton("Cancelar"))
    await u.click(boton("Desvase"))
    await u.click(boton("¿Seguro? Sí, desvasar"))
    expect(a.desvasar).toHaveBeenCalledWith(1)
    await waitFor(() => boton("Desvase"))
  })

  it("si el desvase falla, muestra el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.desvasar.mockResolvedValue(falla("Ya hay un desvase"))
    renderCard({ tanque: tanque(1, "STANDBY", { volumenL: 300 }) }, a)
    await u.click(boton("Desvase"))
    await u.click(boton("¿Seguro? Sí, desvasar"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay un desvase")
  })

  it("sin destinos posibles no ofrece Transferir", () => {
    renderCard({ tanque: tanque(1, "LISTO"), otros: [tanque(2, "SUCIO"), tanque(3, "LISTO", { saborId: "s2", saborNombre: "Mango" })] })
    noHayBoton("Transferir")
  })
})

describe("TanqueCard — transferir", () => {
  const conDestinoLimpio = (over: Partial<Escenario> = {}): Escenario => ({
    tanque: tanque(1, "LISTO"),
    preparaciones: [prep()],
    corridas: [corridaDe("otro")],
    otros: [tanque(2, "LIMPIO"), tanque(3, "LISTO", { saborId: "s2", saborNombre: "Mango" })],
    ...over,
  })

  it("primero confirma el volumen real del origen; si no cambió, no mide", async () => {
    const u = userEvent.setup()
    const a = renderCard(conDestinoLimpio())
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByText("Transferir Tanque 1")).toBeInTheDocument()
    expect(within(dialogo).getByRole("spinbutton")).toHaveValue(7000)
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    expect(a.medirTanque).not.toHaveBeenCalled()
    expect(within(dialogo).getByText(/Manda los/)).toHaveTextContent("Manda los 7.000 L de Fresa a otro tanque con el mismo sabor")
  })

  it("si el origen tiene otro volumen, lo mide antes de seguir", async () => {
    const u = userEvent.setup()
    const a = renderCard(conDestinoLimpio())
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    const input = within(dialogo).getByRole("spinbutton")
    await u.clear(input)
    await u.type(input, "6900")
    await u.click(within(dialogo).getByRole("button", { name: "Guardar y seguir" }))
    expect(a.medirTanque).toHaveBeenCalledWith(1, 6900)
    expect(await within(dialogo).findByText(/Manda los/)).toBeInTheDocument()
  })

  it("si medir el origen falla, se queda en el paso 1 con el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.medirTanque.mockResolvedValue(falla("No se pudo medir"))
    renderCard(conDestinoLimpio(), a)
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    const input = within(dialogo).getByRole("spinbutton")
    await u.clear(input)
    await u.type(input, "6900")
    await u.click(within(dialogo).getByRole("button", { name: "Guardar y seguir" }))
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("No se pudo medir")
    expect(within(dialogo).queryByText(/Manda los/)).not.toBeInTheDocument()
  })

  it("a un tanque Limpio: destino, motivo y transferir; después pide el cierre", async () => {
    const u = userEvent.setup()
    const a = renderCard(conDestinoLimpio())
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    expect(within(dialogo).getByRole("button", { name: "Transferir" })).toBeDisabled()
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2 · Limpio/)
    expect(within(dialogo).queryByText(/qué identidad se queda/)).not.toBeInTheDocument()
    expect(within(dialogo).getByText(/Se transfieren/)).toHaveTextContent("Se transfieren 7.000 L. El Tanque 2 queda con ~7.000 L (calculado — falta medir el tanque).")
    await u.click(within(dialogo).getByRole("button", { name: "No parar la línea" }))
    await u.click(within(dialogo).getByRole("button", { name: "Transferir" }))
    expect(a.transferir).toHaveBeenCalledWith(1, 2, "LIQUIDO", "ENRUTAR_MANIFOLD")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByText("Transferencia hecha. Cierra los dos tanques con lo que midas de verdad.")).toBeInTheDocument()
  })

  it("las opciones de destino: Limpio o mismo sabor", async () => {
    const u = userEvent.setup()
    renderCard({
      tanque: tanque(1, "LISTO"),
      otros: [tanque(2, "LIMPIO"), tanque(3, "STANDBY", { volumenL: 1200 })],
    })
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await u.click(within(dialogo).getByRole("combobox"))
    const opciones = await screen.findAllByRole("option")
    expect(opciones.map((o) => o.textContent)).toEqual(["Tanque 2 · Limpio (mueve el lote entero)", "Tanque 3 · Fresa · 1.200 L"])
  })

  it("a un tanque con su propio lote: elige qué identidad queda", async () => {
    const u = userEvent.setup()
    const a = renderCard({ tanque: tanque(1, "LISTO"), otros: [tanque(2, "LISTO", { volumenL: 1000, lote: "0005" })] })
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2 · Fresa/)
    expect(within(dialogo).getByText("El líquido se suma al lote que ya tiene el destino.")).toBeInTheDocument()
    await u.click(within(dialogo).getByRole("button", { name: "Lote" }))
    expect(within(dialogo).getByText(/Este lote se muda al tanque destino/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/Se transfieren/)).toHaveTextContent("El Tanque 2 queda con ~8.000 L")
    await u.click(within(dialogo).getByRole("button", { name: "Transferir" }))
    expect(a.transferir).toHaveBeenCalledWith(1, 2, "LOTE", "CONSOLIDAR_RESTOS")
  })

  it("avisa si queda sobre lo nominal y frena si pasa del máximo", async () => {
    const u = userEvent.setup()
    renderCard({
      tanque: tanque(1, "LISTO", { volumenL: 15000 }),
      otros: [tanque(2, "LISTO", { volumenL: 8000 }), tanque(3, "LISTO", { volumenL: 16000 })],
    })
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2/)
    expect(within(dialogo).getByText(/Queda sobre los 20\.000 L nominales del tanque/)).toBeInTheDocument()
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 3/)
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("No se puede: el Tanque 3 quedaría con ~31.000 L y el máximo permitido es 30.000 L.")
    expect(within(dialogo).getByRole("button", { name: "Transferir" })).toBeDisabled()
  })

  it("con una corrida tomando de este tanque, pide confirmar la redirección", async () => {
    const u = userEvent.setup()
    const a = renderCard(conDestinoLimpio({ corridas: [corridaDe("p1")] }))
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2/)
    await u.click(within(dialogo).getByRole("button", { name: "Transferir" }))
    expect(a.transferir).not.toHaveBeenCalled()
    expect(within(dialogo).getByText(/La corrida activa de esta línea va a pasar a tomar del tanque destino/)).toBeInTheDocument()
    await u.click(within(dialogo).getByRole("button", { name: "Sí, transferir" }))
    expect(a.transferir).toHaveBeenCalledWith(1, 2, "LIQUIDO", "CONSOLIDAR_RESTOS")
  })

  it("si transferir falla, muestra el error en el diálogo", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.transferir.mockResolvedValue(falla("El destino cambió"))
    renderCard(conDestinoLimpio(), a)
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2/)
    await u.click(within(dialogo).getByRole("button", { name: "Transferir" }))
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("El destino cambió")
  })

  it("Cancelar cierra el diálogo y al reabrir empieza de cero", async () => {
    const u = userEvent.setup()
    renderCard(conDestinoLimpio())
    await u.click(boton("Transferir"))
    let dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await u.click(within(dialogo).getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await u.click(boton("Transferir"))
    dialogo = await screen.findByRole("dialog")
    within(dialogo).getByRole("button", { name: "Es correcto, seguir" })
  })
})

describe("TanqueCard — cierre de la transferencia", () => {
  const escenario = (): Escenario => ({
    tanque: tanque(1, "LISTO"),
    otros: [tanque(2, "LISTO", { volumenL: 1000, lote: "0005" })],
  })

  async function transferirA2(u: ReturnType<typeof userEvent.setup>, modo: "Líquido" | "Lote" = "Líquido") {
    await u.click(boton("Transferir"))
    const dialogo = await screen.findByRole("dialog")
    await u.click(within(dialogo).getByRole("button", { name: "Es correcto, seguir" }))
    await elegir(u, within(dialogo).getByRole("combobox"), /Tanque 2/)
    await u.click(within(dialogo).getByRole("button", { name: modo }))
    await u.click(within(dialogo).getByRole("button", { name: "Transferir" }))
    await screen.findByText(/Transferencia hecha/)
  }

  it("guarda el resto del origen y el volumen real del destino", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await transferirA2(u)
    expect(screen.getByText("¿El Tanque 1 quedó vacío? Si no, ¿cuántos L quedaron?")).toBeInTheDocument()
    expect(boton("Guardar cierre")).toBeDisabled()
    const [resto, destino] = screen.getAllByRole("spinbutton")
    expect(resto).toHaveValue(0)
    await u.clear(resto)
    await u.type(resto, "100")
    expect(screen.getByText(/Esos 100 L vuelven como resto en el Tanque 1 y se le descuentan al Tanque 2/)).toBeInTheDocument()
    await u.type(destino, "7900")
    await u.click(boton("Guardar cierre"))
    expect(a.capturarRestoOrigen).toHaveBeenCalledWith(1, 100)
    expect(a.medirTanque).toHaveBeenCalledWith(2, 7900)
    await waitFor(() => expect(screen.queryByText(/Transferencia hecha/)).not.toBeInTheDocument())
  })

  it("solo con el resto también se puede guardar", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await transferirA2(u)
    const [resto] = screen.getAllByRole("spinbutton")
    await u.clear(resto)
    await u.type(resto, "50")
    await u.click(boton("Guardar cierre"))
    expect(a.capturarRestoOrigen).toHaveBeenCalledWith(1, 50)
    expect(a.medirTanque).not.toHaveBeenCalled()
  })

  it("si el lote se mudó entero, no pregunta por el resto", async () => {
    const u = userEvent.setup()
    renderCard(escenario())
    await transferirA2(u, "Lote")
    expect(screen.queryByText(/quedó vacío/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1)
  })

  it("si capturar el resto falla, muestra el error y no mide", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.capturarRestoOrigen.mockResolvedValue(falla("Resto inválido"))
    renderCard(escenario(), a)
    await transferirA2(u)
    const [resto, destino] = screen.getAllByRole("spinbutton")
    await u.clear(resto)
    await u.type(resto, "100")
    await u.type(destino, "7900")
    await u.click(boton("Guardar cierre"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Resto inválido")
    expect(a.medirTanque).not.toHaveBeenCalled()
    boton("Guardar cierre")
  })

  it("Todo quedó bien cierra sin guardar", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await transferirA2(u)
    await u.click(boton("Todo quedó bien"))
    expect(screen.queryByText(/Transferencia hecha/)).not.toBeInTheDocument()
    expect(a.capturarRestoOrigen).not.toHaveBeenCalled()
  })
})

describe("TanqueCard — Status y Editar", () => {
  it("Status: revisión de inicio sin acciones de preparación", async () => {
    const u = userEvent.setup()
    const a = renderCard({ modo: "status", tanque: tanque(1, "LIMPIO", { confirmadoInicioEn: null }) })
    expect(screen.getByText("Tanque 1: así quedó del turno anterior — confirma o edita.")).toBeInTheDocument()
    noHayBoton("Iniciar Preparación")
    noHayBoton("Iniciar CIP")
    await u.click(boton("Confirmar"))
    expect(a.confirmarEstado).toHaveBeenCalledWith(1, "INICIO")
  })

  it("Status: un tanque en CIP no ofrece Terminó CIP", () => {
    renderCard({ modo: "status", tanque: tanque(1, "CIP") })
    noHayBoton("Terminó CIP")
  })

  it("Editar abre el formulario y Cancelar lo cierra", async () => {
    const u = userEvent.setup()
    renderCard({ tanque: tanque(1, "LIMPIO") })
    await u.click(boton("Editar"))
    noHayBoton("Editar")
    await u.click(screen.getAllByRole("button", { name: "Cancelar" }).at(-1)!)
    boton("Editar")
  })

  it("Editar también está en Status", () => {
    renderCard({ modo: "status", tanque: tanque(1, "LISTO") })
    boton("Editar")
  })
})
