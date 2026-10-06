import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { LineaCard } from "@/components/lineas/LineaCard"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { CondicionLinea, Corrida, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import type { AccionesLinea, ParadaActualLinea } from "@/components/lineas/tipos"

/*
 * Tarjeta de una línea (página Líneas y revisión de Status): qué se ve en
 * cada estado y con qué datos llama a cada acción. Se escribió ANTES de
 * partir LineaCard en componentes chicos, para que el comportamiento
 * quede igual.
 */

// Las animaciones (canvas/pixel) no interesan acá: solo qué estado reciben.
vi.mock("@/components/CintaEstadoLinea", () => ({
  CintaEstadoLinea: ({ estado }: { estado: string }) => <div data-testid="cinta">{estado}</div>,
}))
vi.mock("@/components/LineaVisual", () => ({
  LineaVisual: ({ estado }: { estado: string }) => <div data-testid="visual">{estado}</div>,
}))
const ultimaConfiguracion = vi.fn()
vi.mock("@/lib/lineas", () => ({
  obtenerUltimaConfiguracionLinea: (...args: unknown[]) => ultimaConfiguracion(...args),
}))
// Catálogo chico para la Parada con tipo: uno del supervisor y uno de Mantenimiento (no se ofrece).
vi.mock("@/lib/paradasCatalogo", () => ({
  useTiposActivos: () => [
    { codigo: "CAMBIO_SABOR", nombre: "Cambio de Sabor", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 25, prefijoPlanilla: "PP", secuenciaPlanilla: null },
    { codigo: "FALLA_GENERADOR_440V", nombre: "Falla en Generador 440V", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 5 },
  ],
}))
vi.mock("@/lib/paradasEquipos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paradasEquipos")>()),
  useEquiposParadas: () => [],
}))

beforeAll(() => {
  // Radix Select usa estas APIs del navegador que jsdom no trae.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
beforeEach(() => {
  ultimaConfiguracion.mockReset()
  ultimaConfiguracion.mockResolvedValue(null)
})

const OK = { ok: true as const }
const falla = (error: string) => ({ ok: false as const, error })

function corrida(over: Partial<Corrida> = {}): Corrida {
  return {
    id: "c1",
    linea: "LINEA_1",
    presentacion: "1000",
    envasesHora: 6000,
    saborId: "s1",
    saborNombre: "Fresa",
    lote: "0001",
    loteId: "L1",
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

function estado(condicion: CondicionLinea, over: Partial<LineaEstado> = {}): LineaEstado {
  return {
    linea: "LINEA_1",
    condicion,
    activadaEn: "2026-10-05T08:00:00",
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    observacion: null,
    ...over,
  }
}

const TANQUE_LISTO: TanqueRecepcion = {
  numeroTanque: 1,
  saborId: "s1",
  saborNombre: "Fresa",
  condicion: "LISTO",
  volumenL: 7000,
  volumenInicialL: 7000,
  lote: "0001",
  activadaEn: "2026-10-05T07:00:00",
  ultimoSaborId: null,
  ultimoSaborNombre: null,
  ultimoLote: null,
  confirmadoInicioEn: null,
  confirmadoFinEn: null,
  cipIniciadoEn: null,
  cipFinalizadoEn: null,
}

const PRESENTACIONES = [
  { id: "p1", codigo: "1000", nombre: "1 L", volumenMl: 1000, cajasXCamada: 1, cantCamada: 1, cajasXPaleta: 1, litrosXCaja: 12, envasesXCaja: 12 },
] as unknown as PresentacionLive[]
const VELOCIDADES: VelocidadLive[] = [
  { id: "v1", linea: "LINEA_1", presentacion: "1000", maquina: "A3", envasesHora: 6000, litrosHora: 6000, activo: true },
]

const PARADA_PENDIENTE: ParadaQueDetiene = { linea: "LINEA_1", paradaId: "p-9", pendiente: true, tipoNombre: "Parada por clasificar" }

interface Escenario {
  modo?: ModoEstadoPlanta
  lineaTurno?: Corrida | null
  corridaEsperandoPt?: Corrida | null
  lineaEstado?: LineaEstado | null
  paradaQueDetiene?: ParadaQueDetiene | null
  paradaActual?: ParadaActualLinea | null
  tanquesListos?: TanqueRecepcion[]
}

function crearAcciones() {
  return {
    activar: vi.fn().mockResolvedValue(OK),
    pausar: vi.fn().mockResolvedValue(OK),
    continuar: vi.fn().mockResolvedValue(OK),
    detener: vi.fn().mockResolvedValue(OK),
    continuarSiguienteLote: vi.fn().mockResolvedValue(OK),
    seguirMismoLote: vi.fn().mockResolvedValue(OK),
    confirmarEstado: vi.fn().mockResolvedValue(OK),
    cambiarCondicion: vi.fn().mockResolvedValue(OK),
    ponerEnCip: vi.fn().mockResolvedValue(OK),
    terminarCip: vi.fn().mockResolvedValue(OK),
    continuarCorridaDetenida: vi.fn().mockResolvedValue(OK),
    terminarLinea: vi.fn().mockResolvedValue(OK),
  }
}
type Acciones = ReturnType<typeof crearAcciones>

/** Única parte que depende de cómo LineaCard recibe sus props. */
function renderCard<A extends Acciones>(e: Escenario = {}, acciones: A = crearAcciones() as A): A {
  render(
    <MemoryRouter>
      <LineaCard
        lineaCodigo="LINEA_1"
        nombreLinea="Línea 1"
        modo={e.modo ?? "preparacion"}
        areaCodigo="ASEPTICO"
        lineaTurno={e.lineaTurno ?? null}
        corridaEsperandoPt={e.corridaEsperandoPt ?? null}
        lineaEstado={e.lineaEstado ?? null}
        tanquesListos={e.tanquesListos ?? [TANQUE_LISTO]}
        presentaciones={PRESENTACIONES}
        velocidades={VELOCIDADES}
        paradaQueDetiene={e.paradaQueDetiene ?? null}
        paradaActual={e.paradaActual ?? null}
        acciones={acciones}
      />
    </MemoryRouter>,
  )
  return acciones
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre })
const noHayBoton = (nombre: string | RegExp) => expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument()

describe("LineaCard — corriendo", () => {
  it("muestra la corrida y sus acciones", () => {
    renderCard({ lineaTurno: corrida() })
    expect(screen.getByText("Corriendo")).toBeInTheDocument()
    expect(screen.getByTestId("cinta")).toHaveTextContent("corriendo")
    expect(screen.getByText("1000 ml")).toBeInTheDocument()
    expect(screen.getByText("6000 env/h")).toBeInTheDocument()
    expect(screen.getByText("Fresa · 0001")).toBeInTheDocument()
    boton("Parada")
    boton("CIP")
    boton("Cambiar de lote")
    noHayBoton("Corregir")
  })

  it("en Status, ya confirmada, también ofrece Corregir", () => {
    renderCard({ modo: "status", lineaTurno: corrida() })
    boton("Corregir")
  })

  it("avisa si la corrida anterior sigue esperando su PT", () => {
    renderCard({ lineaTurno: corrida(), corridaEsperandoPt: corrida({ id: "c0", lote: "0000", activa: false, esperandoCierre: true }) })
    expect(screen.getByText(/La corrida anterior del Lote 0000 espera su Producto/)).toBeInTheDocument()
  })

  it("Parada: exige el motivo, pausa con él y cierra el formulario", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: corrida() })
    await u.click(boton("Parada"))
    expect(boton("Confirmar parada")).toBeDisabled()
    await u.type(screen.getByPlaceholderText(/Motivo de la parada/), "Se trancó la tapadora")
    await u.click(boton("Confirmar parada"))
    expect(a.pausar).toHaveBeenCalledWith("c1", "Se trancó la tapadora")
    await waitFor(() => noHayBoton("Confirmar parada"))
    boton("Cambiar de lote")
  })

  it("Parada: si falla, muestra el error y deja el formulario", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.pausar.mockResolvedValue(falla("No se pudo pausar"))
    renderCard({ lineaTurno: corrida() }, a)
    await u.click(boton("Parada"))
    await u.type(screen.getByPlaceholderText(/Motivo de la parada/), "x")
    await u.click(boton("Confirmar parada"))
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo pausar")
    boton("Confirmar parada")
  })

  it("Parada: Cancelar vuelve a los botones", async () => {
    const u = userEvent.setup()
    renderCard({ lineaTurno: corrida() })
    await u.click(boton("Parada"))
    await u.click(boton("Cancelar"))
    boton("Cambiar de lote")
  })

  it("CIP con el lote que sigue: pregunta motivo, si el lote sigue y confirma dos veces", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: corrida() })
    await u.click(boton("CIP"))
    noHayBoton("Poner en CIP")
    await u.click(boton("36 h de trabajo"))
    expect(screen.getByText("¿El Lote 0001 sigue después del CIP?")).toBeInTheDocument()
    await u.click(boton("Sí, sigue"))
    await u.type(screen.getByPlaceholderText(/Descripción breve/), "Toca lavado")
    await u.click(boton("Poner en CIP"))
    expect(screen.getByText(/El Lote 0001 continúa al terminar el CIP/)).toBeInTheDocument()
    expect(a.ponerEnCip).not.toHaveBeenCalled()
    await u.click(boton("Sí, poner en CIP"))
    expect(a.ponerEnCip).toHaveBeenCalledWith({
      linea: "LINEA_1",
      motivo: "HORAS_36",
      descripcion: "Toca lavado",
      corridaId: "c1",
      loteSigue: true,
    })
    await waitFor(() => noHayBoton("Sí, poner en CIP"))
  })

  it("CIP donde el lote termina: avisa que queda esperando su PT", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: corrida() })
    await u.click(boton("CIP"))
    await u.click(boton("Falla mecánica prolongada"))
    await u.click(boton("No, termina aquí"))
    await u.click(boton("Poner en CIP"))
    expect(screen.getByText(/se detiene y queda esperando su Producto Terminado/)).toBeInTheDocument()
    await u.click(boton("Sí, poner en CIP"))
    expect(a.ponerEnCip).toHaveBeenCalledWith(expect.objectContaining({ motivo: "FALLA_MECANICA", corridaId: "c1", loteSigue: false }))
  })

  it("Cambiar de lote: confirma y pasa al siguiente (auto-detecta el tanque)", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: corrida() })
    await u.click(boton("Cambiar de lote"))
    expect(screen.getByText(/pasa al tanque del lote siguiente/)).toBeInTheDocument()
    await u.click(boton("Sí, cambiar de lote"))
    expect(a.continuarSiguienteLote).toHaveBeenCalledWith("c1", undefined)
    await waitFor(() => boton("Cambiar de lote"))
  })

  it("Cambiar de lote: si no detecta el tanque, deja elegirlo; Cancelar vuelve a los botones", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.continuarSiguienteLote.mockResolvedValueOnce(falla("No hay un único tanque Listo"))
    renderCard({ lineaTurno: corrida() }, a)
    await u.click(boton("Cambiar de lote"))
    await u.click(boton("Sí, cambiar de lote"))
    expect(await screen.findByText(/No se detectó solo el tanque/)).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("No hay un único tanque Listo")
    noHayBoton("Sí, cambiar de lote")
    expect(boton("Continuar con ese tanque")).toBeDisabled()
    await u.click(boton("Cancelar"))
    boton("Cambiar de lote")
  })
})

describe("LineaCard — revisión de Status", () => {
  it("una corrida heredada sin revisar solo ofrece Confirmar / Corregir", async () => {
    const u = userEvent.setup()
    const a = renderCard({ modo: "status", lineaTurno: corrida({ confirmadoInicioEn: null }) })
    expect(screen.getByText(/así quedó del turno anterior/)).toBeInTheDocument()
    noHayBoton("Parada")
    await u.click(boton("Confirmar"))
    expect(a.confirmarEstado).toHaveBeenCalledWith("c1")
  })

  it("si Confirmar falla, muestra el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.confirmarEstado.mockResolvedValue(falla("Turno cerrado"))
    renderCard({ modo: "status", lineaTurno: corrida({ confirmadoInicioEn: null }) }, a)
    await u.click(boton("Confirmar"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Turno cerrado")
  })

  it("Corregir abre el formulario con lo que tenía la corrida y arranca ya confirmada", async () => {
    const u = userEvent.setup()
    const a = renderCard({ modo: "status", lineaTurno: corrida({ confirmadoInicioEn: null }) })
    await u.click(boton("Corregir"))
    noHayBoton("Confirmar")
    expect(screen.getByText("6000 env/h · 6000 L/h")).toBeInTheDocument()
    expect(ultimaConfiguracion).not.toHaveBeenCalled()
    await u.click(screen.getAllByRole("combobox")[0])
    await u.click(await screen.findByRole("option", { name: /Tanque 1 · Fresa · Lote 0001/ }))
    await u.click(boton("Arrancar línea"))
    expect(screen.getByText(/Vas a arrancar/)).toHaveTextContent("Vas a arrancar Línea 1 con Fresa · Lote 0001 del Tanque 1, a 1000 ml · 6000 env/h. ¿Confirmar?")
    await u.click(boton("Sí, arrancar línea"))
    expect(a.activar).toHaveBeenCalledWith({ linea: "LINEA_1", presentacion: "1000", envasesHora: 6000, numeroTanque: 1, confirmarInicio: true })
  })
})

describe("LineaCard — en pausa", () => {
  const pausada = () => corrida({ pausadaEn: "2026-10-05T09:00:00" })

  it("ofrece Continuar, Pasar a CIP y Detener", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: pausada(), lineaEstado: estado("LISTA") })
    expect(screen.getAllByText("Parada")[0]).toBeInTheDocument()
    expect(screen.getByTestId("cinta")).toHaveTextContent("parada")
    await u.click(boton("Continuar"))
    expect(a.continuar).toHaveBeenCalledWith("c1")
    boton("Pasar a CIP")
  })

  it("con la parada sin completar, Continuar queda bloqueado y lleva a Registrar Paradas", () => {
    renderCard({ lineaTurno: pausada(), paradaQueDetiene: PARADA_PENDIENTE })
    expect(boton("Continuar")).toBeDisabled()
    expect(screen.getByText(/Para continuar, completa la parada/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a Registrar Paradas" })).toHaveAttribute("href", "/paradas?parada=p-9")
  })

  it("Detener línea pide confirmar y manda el motivo", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: pausada() })
    await u.click(boton("Detener línea"))
    expect(screen.getByText(/Esto detiene la corrida del Lote 0001/)).toBeInTheDocument()
    await u.type(screen.getByPlaceholderText(/Motivo \(opcional\)/), "  Sin envases  ")
    await u.click(boton("Sí, detener línea"))
    expect(a.detener).toHaveBeenCalledWith("c1", "Sin envases")
    await waitFor(() => noHayBoton("Sí, detener línea"))
  })

  it("Detener línea: Cancelar vuelve atrás sin llamar a nada", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: pausada() })
    await u.click(boton("Detener línea"))
    await u.click(boton("Cancelar"))
    expect(a.detener).not.toHaveBeenCalled()
    boton("Continuar")
  })

  it("Pasar a CIP abre el formulario con la pregunta del lote", async () => {
    const u = userEvent.setup()
    renderCard({ lineaTurno: pausada() })
    await u.click(boton("Pasar a CIP"))
    await u.click(boton("Falla en Suministro Eléctrico"))
    expect(screen.getByText("¿El Lote 0001 sigue después del CIP?")).toBeInTheDocument()
    await u.click(boton("Cancelar"))
    boton("Continuar")
  })
})

describe("LineaCard — CIP con el lote en pausa", () => {
  const escenario = (over: Escenario = {}): Escenario => ({
    lineaTurno: corrida({ pausadaEn: "2026-10-05T09:00:00" }),
    lineaEstado: estado("CIP", { observacion: "36 h de trabajo", cipIniciadoEn: "2026-10-05T09:00:00" }),
    ...over,
  })

  it("muestra el CIP y que el lote sigue", () => {
    renderCard(escenario())
    expect(screen.getByText("En CIP")).toBeInTheDocument()
    expect(screen.getByTestId("cinta")).toHaveTextContent("cip")
    expect(screen.getByText(/Lote 0001 sigue después del CIP/)).toBeInTheDocument()
    expect(screen.getByText("36 h de trabajo.")).toBeInTheDocument()
  })

  it("Terminó CIP sigue con el lote", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await u.click(boton("Terminó CIP: continuar el Lote 0001"))
    expect(a.terminarCip).toHaveBeenCalledWith("LINEA_1")
  })

  it("Terminó CIP queda bloqueado mientras falte la parada", () => {
    renderCard(escenario({ paradaQueDetiene: PARADA_PENDIENTE }))
    expect(boton("Terminó CIP: continuar el Lote 0001")).toBeDisabled()
    expect(screen.getByText(/Para terminar el CIP, completa la parada/)).toBeInTheDocument()
  })

  it("El lote ya no sigue: confirma y termina la corrida", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await u.click(boton("El lote ya no sigue"))
    expect(screen.getByText(/La línea sigue en CIP/)).toBeInTheDocument()
    await u.click(boton("Sí, el lote no sigue"))
    expect(a.terminarLinea).toHaveBeenCalledWith("c1")
  })

  it("El lote ya no sigue: Cancelar vuelve atrás", async () => {
    const u = userEvent.setup()
    const a = renderCard(escenario())
    await u.click(boton("El lote ya no sigue"))
    await u.click(boton("Cancelar"))
    expect(a.terminarLinea).not.toHaveBeenCalled()
    boton("El lote ya no sigue")
  })
})

describe("LineaCard — terminó el lote", () => {
  const terminada = () => corrida({ loteTerminado: "2026-10-05T10:00:00" })

  it("pregunta si sigue, pasa al siguiente o se detiene", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaTurno: terminada() })
    expect(screen.getByText("Terminó el Lote")).toBeInTheDocument()
    expect(screen.queryByTestId("cinta")).not.toBeInTheDocument()
    expect(screen.getByTestId("visual")).toHaveTextContent("terminada")
    await u.click(boton("Seguir con el mismo lote"))
    expect(a.seguirMismoLote).toHaveBeenCalledWith("c1")
    await u.click(boton("Continuar al siguiente lote"))
    expect(a.continuarSiguienteLote).toHaveBeenCalledWith("c1", undefined)
  })

  it("si no detecta el siguiente tanque, deja elegirlo; Cancelar solo cierra el selector", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.continuarSiguienteLote.mockResolvedValueOnce(falla("Hay dos tanques Listos"))
    renderCard({ lineaTurno: terminada() }, a)
    await u.click(boton("Continuar al siguiente lote"))
    expect(await screen.findByText(/No se detectó solo el tanque/)).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Hay dos tanques Listos")
    await u.click(boton("Cancelar"))
    expect(screen.queryByText(/No se detectó solo el tanque/)).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    boton("Seguir con el mismo lote")
  })

  it("eligiendo el tanque a mano, reintenta con ese", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.continuarSiguienteLote.mockResolvedValueOnce(falla("Hay dos tanques Listos"))
    renderCard({ lineaTurno: terminada() }, a)
    await u.click(boton("Continuar al siguiente lote"))
    await screen.findByText(/No se detectó solo el tanque/)
    await u.click(screen.getByRole("combobox"))
    await u.click(await screen.findByRole("option", { name: /Tanque 1 · Fresa · Lote 0001/ }))
    await u.click(boton("Continuar con ese tanque"))
    expect(a.continuarSiguienteLote).toHaveBeenLastCalledWith("c1", 1)
    await waitFor(() => expect(screen.queryByText(/No se detectó solo el tanque/)).not.toBeInTheDocument())
  })

  it("Detener línea abre la confirmación", async () => {
    const u = userEvent.setup()
    renderCard({ lineaTurno: terminada() })
    await u.click(boton("Detener línea"))
    boton("Sí, detener línea")
  })
})

describe("LineaCard — esperando su Producto Terminado", () => {
  const detenida = () => corrida({ id: "c0", activa: false, esperandoCierre: true })

  it("deja continuar el lote, cargar su PT o arrancar con otro tanque", async () => {
    const u = userEvent.setup()
    const a = renderCard({ corridaEsperandoPt: detenida(), lineaEstado: estado("DETENIDA") })
    expect(screen.getByText("Esperando PT")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cargar su PT" })).toHaveAttribute("href", "/producto-terminado")
    await u.click(boton("Continuar el Lote 0001"))
    expect(a.continuarCorridaDetenida).toHaveBeenCalledWith("c0")
    await u.click(boton("Arrancar con otro tanque"))
    expect(screen.getAllByRole("combobox")).toHaveLength(3)
    boton("Arrancar línea")
  })

  it("si además la línea está en CIP, muestra el CIP", async () => {
    const u = userEvent.setup()
    const a = renderCard({ corridaEsperandoPt: detenida(), lineaEstado: estado("CIP") })
    expect(screen.getByText("En CIP")).toBeInTheDocument()
    expect(screen.getByText(/La corrida del Lote 0001 espera su Producto Terminado/)).toBeInTheDocument()
    await u.click(boton("Terminó CIP"))
    expect(a.terminarCip).toHaveBeenCalledWith("LINEA_1")
  })
})

describe("LineaCard — sin corrida", () => {
  it("detenida: arrancar o cambiar la condición", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaEstado: estado("DETENIDA") })
    expect(screen.getByText("Parada")).toBeInTheDocument()
    expect(screen.getByTestId("cinta")).toHaveTextContent("detenida")
    boton("Arrancar línea")
    await u.click(boton("Sin programación"))
    expect(a.cambiarCondicion).toHaveBeenCalledWith({ linea: "LINEA_1", condicion: "SIN_PROGRAMACION", observacion: undefined })
    await u.click(boton("Cambio de Presentación"))
    expect(a.cambiarCondicion).toHaveBeenLastCalledWith({ linea: "LINEA_1", condicion: "CAMBIO_PRESENTACION", observacion: undefined })
  })

  it("si cambiar la condición falla, muestra el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.cambiarCondicion.mockResolvedValue(falla("La línea tiene una corrida"))
    renderCard({ lineaEstado: estado("DETENIDA") }, a)
    await u.click(boton("Sin programación"))
    expect(await screen.findByRole("alert")).toHaveTextContent("La línea tiene una corrida")
  })

  it("sin estado cargado se toma como detenida", () => {
    renderCard()
    expect(screen.getByText("Parada")).toBeInTheDocument()
  })

  it("cambio de presentación y sin programación", () => {
    renderCard({ lineaEstado: estado("CAMBIO_PRESENTACION") })
    expect(screen.getByText("Cambio de Presentación", { selector: "span, div" })).toBeInTheDocument()
    expect(screen.getByTestId("visual")).toHaveTextContent("cambio_presentacion")
  })

  it("sin programación se ve con su badge", () => {
    renderCard({ lineaEstado: estado("SIN_PROGRAMACION") })
    expect(screen.getAllByText("Sin programación").length).toBeGreaterThan(1)
    expect(screen.getByTestId("visual")).toHaveTextContent("libre")
  })

  it("Iniciar CIP sin corrida: no pregunta por el lote", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaEstado: estado("DETENIDA") })
    await u.click(boton("Iniciar CIP"))
    await u.click(boton("Falla en Suministro Eléctrico"))
    expect(screen.queryByText(/sigue después del CIP\?/)).not.toBeInTheDocument()
    await u.click(boton("Poner en CIP"))
    expect(screen.getByText(/La línea queda en CIP\./)).toBeInTheDocument()
    await u.click(boton("Sí, poner en CIP"))
    expect(a.ponerEnCip).toHaveBeenCalledWith({ linea: "LINEA_1", motivo: "SUMINISTRO_ELECTRICO", descripcion: "", corridaId: null, loteSigue: null })
  })

  it("Iniciar CIP: si falla, muestra el error en el formulario", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.ponerEnCip.mockResolvedValue(falla("Falta CIP de tanque"))
    renderCard({ lineaEstado: estado("DETENIDA") }, a)
    await u.click(boton("Iniciar CIP"))
    await u.click(boton("36 h de trabajo"))
    await u.click(boton("Poner en CIP"))
    await u.click(boton("Sí, poner en CIP"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta CIP de tanque")
    boton("Sí, poner en CIP")
  })

  it("en CIP: Terminó CIP, bloqueado mientras falte la parada", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaEstado: estado("CIP", { observacion: "Falla mecánica prolongada" }), paradaQueDetiene: PARADA_PENDIENTE })
    expect(screen.getByText("En CIP")).toBeInTheDocument()
    expect(screen.getByTestId("cinta")).toHaveTextContent("cip")
    expect(boton("Terminó CIP")).toBeDisabled()
    noHayBoton("Iniciar CIP")
    expect(a.terminarCip).not.toHaveBeenCalled()
    void u
  })

  it("en CIP con la parada completa, Terminó CIP lo termina", async () => {
    const u = userEvent.setup()
    const a = renderCard({ lineaEstado: estado("CIP") })
    await u.click(boton("Terminó CIP"))
    expect(a.terminarCip).toHaveBeenCalledWith("LINEA_1")
  })

  it("Terminó CIP: si falla, muestra el error", async () => {
    const u = userEvent.setup()
    const a = crearAcciones()
    a.terminarCip.mockResolvedValue(falla("Completa la parada"))
    renderCard({ lineaEstado: estado("CIP") }, a)
    await u.click(boton("Terminó CIP"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Completa la parada")
  })
})

describe("LineaCard — arrancar línea", () => {
  it("prellena con lo último que usó la línea y arranca tras confirmar", async () => {
    const u = userEvent.setup()
    ultimaConfiguracion.mockResolvedValue({ presentacionVolumenMl: 1000, envasesHora: 6000 })
    const a = renderCard({ lineaEstado: estado("DETENIDA") })
    await u.click(boton("Arrancar línea"))
    expect(ultimaConfiguracion).toHaveBeenCalledWith("ASEPTICO", "LINEA_1")
    expect(await screen.findByText("6000 env/h · 6000 L/h")).toBeInTheDocument()
    expect(boton("Arrancar línea")).toBeDisabled()
    await u.click(screen.getAllByRole("combobox")[0])
    await u.click(await screen.findByRole("option", { name: /Tanque 1 · Fresa · Lote 0001/ }))
    expect(screen.getByText("Toma Fresa · Lote 0001 del Tanque 1.")).toBeInTheDocument()
    await u.click(boton("Arrancar línea"))
    expect(a.activar).not.toHaveBeenCalled()
    await u.click(boton("Sí, arrancar línea"))
    expect(a.activar).toHaveBeenCalledWith({ linea: "LINEA_1", presentacion: "1000", envasesHora: 6000, numeroTanque: 1, confirmarInicio: false })
    await waitFor(() => noHayBoton("Sí, arrancar línea"))
  })

  it("no prellena una presentación que ya no tiene velocidad en esta línea", async () => {
    const u = userEvent.setup()
    ultimaConfiguracion.mockResolvedValue({ presentacionVolumenMl: 250, envasesHora: 9000 })
    renderCard({ lineaEstado: estado("DETENIDA") })
    await u.click(boton("Arrancar línea"))
    await waitFor(() => expect(ultimaConfiguracion).toHaveBeenCalled())
    const combos = screen.getAllByRole("combobox")
    expect(within(combos[1]).getByText("Presentación")).toBeInTheDocument()
  })

  it("si arrancar falla, muestra el error y deja el formulario", async () => {
    const u = userEvent.setup()
    ultimaConfiguracion.mockResolvedValue({ presentacionVolumenMl: 1000, envasesHora: 6000 })
    const a = crearAcciones()
    a.activar.mockResolvedValue(falla("El tanque ya no está Listo"))
    renderCard({ lineaEstado: estado("DETENIDA") }, a)
    await u.click(boton("Arrancar línea"))
    await screen.findByText("6000 env/h · 6000 L/h")
    await u.click(screen.getAllByRole("combobox")[0])
    await u.click(await screen.findByRole("option", { name: /Tanque 1/ }))
    await u.click(boton("Arrancar línea"))
    await u.click(boton("Sí, arrancar línea"))
    expect(await screen.findByRole("alert")).toHaveTextContent("El tanque ya no está Listo")
  })

  it("sin tanques Listos lo avisa", async () => {
    const u = userEvent.setup()
    renderCard({ lineaEstado: estado("DETENIDA"), tanquesListos: [] })
    await u.click(boton("Arrancar línea"))
    expect(await screen.findByText("Ningún tanque Listo")).toBeInTheDocument()
  })

  it("Cancelar cierra el formulario", async () => {
    const u = userEvent.setup()
    renderCard({ lineaEstado: estado("DETENIDA") })
    await u.click(boton("Arrancar línea"))
    await u.click(boton("Cancelar"))
    boton("Sin programación")
  })
})

describe("LineaCard — Parada con tipo del catálogo (demo /paradas-demo)", () => {
  const conParar = () => ({ ...crearAcciones(), parar: vi.fn<NonNullable<AccionesLinea["parar"]>>().mockResolvedValue(OK) })

  it("pide tipo y comentario; manda los minutos de antes si los ponen", async () => {
    const u = userEvent.setup()
    const a = conParar()
    renderCard({ lineaTurno: corrida() }, a)
    await u.click(boton("Parada"))
    expect(boton("Confirmar parada")).toBeDisabled()
    await u.type(screen.getByPlaceholderText(/Busca por nombre/), "cambio")
    await u.click(screen.getByRole("button", { name: /Cambio de Sabor/ }))
    await u.type(screen.getByPlaceholderText(/Qué pasó/), "Cambio a Pera")
    await u.type(screen.getByLabelText("Paró hace"), "5")
    await u.click(boton("Confirmar parada"))
    expect(a.parar).toHaveBeenCalledWith("c1", { tipoCodigo: "CAMBIO_SABOR", tipoNombre: "Cambio de Sabor", nota: "Cambio a Pera", minutosAntes: 5 })
    expect(a.pausar).not.toHaveBeenCalled()
  })

  it("no ofrece los tipos que registra Mantenimiento", async () => {
    const u = userEvent.setup()
    renderCard({ lineaTurno: corrida() }, conParar())
    await u.click(boton("Parada"))
    await u.type(screen.getByPlaceholderText(/Busca por nombre/), "generador")
    expect(screen.getByText("Ningún tipo del catálogo coincide.")).toBeInTheDocument()
  })

  it("en pausa muestra la parada en curso y Continuar manda los minutos corregidos", async () => {
    const u = userEvent.setup()
    const a = renderCard({
      lineaTurno: corrida({ pausadaEn: new Date(Date.now() - 20 * 60000).toISOString() }),
      lineaEstado: estado("LISTA"),
      paradaActual: { tipoNombre: "Cambio de Sabor", inicio: new Date(Date.now() - 20 * 60000).toISOString(), nota: "Cambio a Pera" },
    })
    expect(screen.getByText("Cambio de Sabor")).toBeInTheDocument()
    expect(screen.getByText("Cambio a Pera")).toBeInTheDocument()
    expect(screen.getByText(/hace 20 min/)).toBeInTheDocument()
    await u.type(screen.getByRole("spinbutton"), "18")
    await u.click(boton("Continuar"))
    expect(a.continuar).toHaveBeenCalledWith("c1", 18)
  })
})
