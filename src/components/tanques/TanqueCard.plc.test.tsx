import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TanqueCard } from "@/components/tanques/TanqueCard"
import type { CargaPlc, DesgloseLote, PlcDelTanque, VistaVivaTanque } from "@/lib/preparacion/plc"
import type { Desvase } from "@/lib/desvases"
import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import type { Sabor } from "@/lib/sabores"
import { horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Tarjeta de un tanque con la Preparación con PLC encendida: lo en vivo
 * (agua, kits, ajuste) y el desglose del lote. Mismos armadores que
 * TanqueCard.test.tsx; sin plc, la tarjeta no cambia (eso lo cubre aquel).
 */

const desvases = vi.fn()
vi.mock("@/lib/desvases", () => ({ listarDesvases: (...args: unknown[]) => desvases(...args) }))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
})
beforeEach(() => {
  desvases.mockReset()
  desvases.mockResolvedValue([])
})

const OK = { ok: true as const }
const TURNO = "t-1"
const SABORES: Sabor[] = [
  { id: "s1", nombre: "Fresa", volumen: 3000, activo: true, familiaId: "f1", familiaNombre: "Clásicos" },
  { id: "s2", nombre: "Mango", volumen: 2500, activo: true, familiaId: "f1", familiaNombre: "Clásicos" },
]

function tanque(condicion: CondicionTanque, over: Partial<TanqueRecepcion> = {}): TanqueRecepcion {
  const conLiquido = condicion === "LISTO" || condicion === "STANDBY"
  return {
    numeroTanque: 1,
    saborId: conLiquido || condicion === "EN_PREPARACION" ? "s1" : null,
    saborNombre: conLiquido || condicion === "EN_PREPARACION" ? "Fresa" : null,
    condicion,
    volumenL: conLiquido ? 7350 : null,
    volumenInicialL: conLiquido ? 7350 : null,
    lote: conLiquido ? "0002" : null,
    activadaEn: "2026-11-09T07:00:00",
    ultimoSaborId: null,
    ultimoSaborNombre: null,
    ultimoLote: null,
    confirmadoInicioEn: "2026-11-09T07:00:00",
    confirmadoFinEn: null,
    cipIniciadoEn: null,
    cipFinalizadoEn: null,
    paraVacio: false,
    ...over,
  }
}

const LOTE: PreparacionRegistro = {
  id: "p2",
  turnoId: TURNO,
  numeroTanque: 1,
  saborId: "s1",
  saborNombre: "Fresa",
  lote: "0002",
  volumenActualL: 7350,
  volumenPreparadoL: 7350,
  volumenAlIniciarTurnoL: 7350,
  tambores: 2,
  agua: null,
  azucar: null,
  acidoCitrico: null,
  creadoEn: "2026-11-09T08:00:00",
  liberadoEn: null,
  cerradoEn: null,
  paraVacio: false,
}

function vivo(over: Partial<VistaVivaTanque> = {}): VistaVivaTanque {
  return {
    fase: 1,
    llenando: true,
    aguaFormulaL: 4800,
    litrosAgua: 3120,
    caudalLMin: 95,
    kits: null,
    ajusteL: null,
    litrosAjuste: null,
    ...over,
  }
}

function carga(over: Partial<CargaPlc> = {}): CargaPlc {
  return {
    id: "c1",
    numeroTanque: 1,
    estado: "CONFIRMADA",
    aguaFormulaL: 4800,
    kits: 2,
    kitsListos: true,
    kitsUsados: 2,
    iniciadaEn: "2026-11-09T07:30:00Z",
    terminadaEn: "2026-11-09T08:30:00Z",
    ajustes: [],
    ...over,
  }
}

const H1 = "2026-11-09T13:41:00Z"
const H2 = "2026-11-09T14:05:00Z"

const DESGLOSE: DesgloseLote = {
  loteId: "p2",
  lote: "0002",
  unidades: 2,
  litrosPorUnidad: 3000,
  aguaL: 0,
  restoL: 1200,
  desvaseL: 0,
  totalL: 7350,
  ajustes: [
    { origen: "PLC", litros: 100, creadoEn: H1, detalle: "Ajuste de agua del PLC" },
    { origen: "MANUAL", litros: 50, creadoEn: H2, detalle: null },
  ],
}

function plc(over: Partial<PlcDelTanque> = {}): PlcDelTanque {
  return { vivo: null, cola: [], cargaDelLote: null, desglose: null, ...over }
}

interface Opciones {
  modoVacio?: boolean
  calidadLibera?: boolean | null
  corridasSinPt?: Corrida[]
  otros?: TanqueRecepcion[]
}

function renderCard(t: TanqueRecepcion, p: PlcDelTanque | null | undefined, preparaciones: PreparacionRegistro[] = [], o: Opciones = {}) {
  const acciones = {
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
    recibirDeVacio: vi.fn().mockResolvedValue(OK),
    entregarAVacio: vi.fn().mockResolvedValue(OK),
    pasarAAseptico: vi.fn().mockResolvedValue(OK),
    confirmarCargaPlc: vi.fn().mockResolvedValue(OK),
    descartarCargaPlc: vi.fn().mockResolvedValue(OK),
  }
  const props = {
    tanque: t,
    sabores: SABORES,
    modo: "preparacion" as const,
    preparaciones,
    tanquesDelTurno: [t, ...(o.otros ?? [])],
    corridasDelTurno: [],
    areaCodigo: "ASEPTICO",
    usuarioSesion: "supervisor",
    analisisPorLote: new Map(),
    calidadLibera: o.calidadLibera === undefined ? false : o.calidadLibera,
    puedeIrACalidad: false,
    turnoId: TURNO,
    acciones,
    modoVacio: o.modoVacio,
    corridasSinPt: o.corridasSinPt,
  }
  render(<MemoryRouter>{p === undefined ? <TanqueCard {...props} /> : <TanqueCard {...props} plc={p} />}</MemoryRouter>)
  return acciones
}

/** El renglón del desglose que tiene esta etiqueta. */
function renglon(etiqueta: string) {
  return screen.getByText(etiqueta).closest("[data-renglon]") as HTMLElement
}

describe("TanqueCard con el PLC", () => {
  it("en vivo, agua entrando", () => {
    renderCard(tanque("LIMPIO"), plc({ vivo: vivo() }))
    expect(screen.getByText("Preparación en curso · PLC")).toBeInTheDocument()
    expect(screen.getByText("Agua de la fórmula: 4.800 L")).toBeInTheDocument()
    expect(screen.getByText("Entraron 3.120 L · 95 L/min")).toBeInTheDocument()
    expect(screen.getByText("80 %")).toBeInTheDocument()
    expect(screen.queryByText(/fase/i)).not.toBeInTheDocument()
    expect(screen.getByText("+3.120 / 4.800 L")).toBeInTheDocument()
  })

  it("en vivo, con kits", () => {
    renderCard(tanque("LIMPIO"), plc({ vivo: vivo({ fase: 2, kits: 2 }) }))
    expect(screen.getByText("Kits: 2")).toBeInTheDocument()
  })

  it("en vivo, ajuste en curso", () => {
    renderCard(tanque("EN_PREPARACION"), plc({ vivo: vivo({ fase: 3, ajusteL: 100, litrosAjuste: 40, kits: 2 }) }), [LOTE])
    expect(screen.getByText("Ajuste de agua en curso: +100 L (entraron 40 L)")).toBeInTheDocument()
    // El dibujo muestra lo que entra del ajuste.
    expect(screen.getByText("+40 / 100 L")).toBeInTheDocument()
  })

  it("sin válvula abierta no hay animación de llenado", () => {
    renderCard(tanque("LIMPIO"), plc({ vivo: vivo({ llenando: false }) }))
    expect(screen.queryByText("+3.120 / 4.800 L")).not.toBeInTheDocument()
    expect(screen.getByText("Entraron 3.120 L")).toBeInTheDocument()
  })

  it("una carga en curso sin datos en vivo también marca el badge", () => {
    renderCard(tanque("LIMPIO"), plc({ cola: [carga({ estado: "EN_CURSO", terminadaEn: null })] }))
    expect(screen.getByText("Preparación en curso · PLC")).toBeInTheDocument()
  })

  it("desglose del lote En Preparación", () => {
    renderCard(tanque("EN_PREPARACION"), plc({ desglose: DESGLOSE, cargaDelLote: carga() }), [LOTE])
    expect(renglon("2 kits × 3.000 L")).toHaveTextContent("6.000 L")
    expect(renglon("Resto del lote anterior")).toHaveTextContent("1.200 L")
    expect(renglon(`Ajuste 1 · PLC · ${horaPlanta(new Date(H1))}`)).toHaveTextContent("+100 L")
    expect(renglon(`Ajuste 2 · a mano · ${horaPlanta(new Date(H2))}`)).toHaveTextContent("+50 L")
    expect(renglon("Total")).toHaveTextContent("7.350 L")
    expect(screen.queryByText(/El PLC marcó/)).not.toBeInTheDocument()
  })

  it("kits corregidos dicen lo que marcó el PLC", () => {
    renderCard(tanque("EN_PREPARACION"), plc({ desglose: { ...DESGLOSE, unidades: 2.5 }, cargaDelLote: carga({ kits: 2, kitsUsados: 2.5 }) }), [LOTE])
    expect(renglon("2,5 kits × 3.000 L")).toHaveTextContent("7.500 L")
    expect(screen.getByText("El PLC marcó 2 kits.")).toBeInTheDocument()
  })

  it("ajuste del PLC después de liberar: se ve y no suma", () => {
    const hecho = "2026-11-09T15:10:00Z"
    renderCard(
      tanque("LISTO"),
      plc({
        cargaDelLote: carga({
          ajustes: [{ id: "a9", litros: 40, iniciadoEn: hecho, hechoEn: hecho, sumado: false, noSumadoMotivo: "El lote ya estaba liberado cuando terminó el ajuste." }],
        }),
      }),
      [{ ...LOTE, liberadoEn: "2026-11-09T15:00:00Z" }],
    )
    expect(screen.getByText(`Ajuste del PLC después de liberar, no se sumó: +40 L · ${horaPlanta(new Date(hecho))}`)).toBeInTheDocument()
  })

  it("sin plc la tarjeta queda igual", () => {
    for (const p of [null, undefined]) {
      renderCard(tanque("EN_PREPARACION"), p, [LOTE])
      expect(screen.queryByText("Preparación en curso · PLC")).not.toBeInTheDocument()
      expect(screen.queryByText(/Agua de la fórmula|Kits:|Ajuste de agua|Resto del lote anterior|El PLC marcó|no se sumó/)).not.toBeInTheDocument()
      expect(screen.queryByText("Total")).not.toBeInTheDocument()
      cleanup()
    }
  })
})

// ---- Registrar o descartar la carga del PLC (Task 12)

const TERMINO = "2026-11-09T14:30:00Z"
const pendiente = (over: Partial<CargaPlc> = {}) => carga({ estado: "PENDIENTE", kitsUsados: null, terminadaEn: TERMINO, ...over })
const enCursoLista = (over: Partial<CargaPlc> = {}) => carga({ estado: "EN_CURSO", kitsUsados: null, terminadaEn: null, ...over })

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre })
const noHayBoton = (nombre: string | RegExp) => expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument()

async function elegir(u: ReturnType<typeof userEvent.setup>, combo: HTMLElement, opcion: RegExp) {
  await u.click(combo)
  await u.click(await screen.findByRole("option", { name: opcion }))
}

/** Elige sabor y escribe el lote en el formulario de la carga. */
async function saborYLote(u: ReturnType<typeof userEvent.setup>, sabor = /Fresa/, lote = "0003") {
  await elegir(u, screen.getAllByRole("combobox")[0], sabor)
  await u.type(screen.getByPlaceholderText("Lote"), lote)
}

const parada = (): Corrida => ({
  id: "cr1",
  linea: "LINEA_2",
  presentacion: "1000",
  envasesHora: 6000,
  saborId: "s1",
  saborNombre: "Fresa",
  lote: "0001",
  loteId: "p1",
  activa: false,
  activadaEn: "2026-11-09T08:00:00",
  pausadaEn: null,
  loteTerminado: null,
  finalizadaEn: null,
  esperandoCierre: true,
  entregadaEn: null,
  confirmadoInicioEn: "2026-11-09T08:00:00",
})

const LOTE_ANTERIOR: PreparacionRegistro = { ...LOTE, id: "p1", lote: "0001", liberadoEn: "2026-11-09T07:30:00" }
const conResto = (over: Partial<TanqueRecepcion> = {}) => tanque("LISTO", { volumenL: 1200, volumenInicialL: 7000, lote: "0001", ...over })

describe("TanqueCard: registrar la carga del PLC", () => {
  it("cargando kits: aviso y sin formulario", () => {
    renderCard(tanque("LIMPIO"), plc({ cola: [enCursoLista({ kits: null, kitsListos: false })] }))
    expect(screen.getByText("El PLC está cargando esta preparación. Cuando termine la pulpa, aquí eliges sabor y lote.")).toBeInTheDocument()
    expect(screen.queryByText("Falta sabor y lote")).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Lote")).not.toBeInTheDocument()
    boton("Descartar carga")
  })

  it("carga lista", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [enCursoLista()] }))
    expect(screen.getByText("Falta sabor y lote")).toBeInTheDocument()
    expect(screen.getByText("Cargado en el PLC: 4.800 L de agua · 2 kits")).toBeInTheDocument()
    expect(screen.getByText("Kits: 2 (del PLC)")).toBeInTheDocument()
    boton("Corregir")
    expect(screen.queryByPlaceholderText("Kits")).not.toBeInTheDocument()
    // El PLC sigue (Calidad / ajustes): todavía no se puede liberar.
    noHayBoton("Registrar y liberar")
    await saborYLote(u)
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith({
      cargaId: "c1",
      saborId: "s1",
      lote: "0003",
      kits: null,
      desvaseId: null,
      paraVacio: false,
      liberar: false,
    })
  })

  it("corregir kits avisa que difiere del PLC", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [enCursoLista()] }))
    await saborYLote(u)
    await u.click(boton("Corregir"))
    const kits = screen.getByPlaceholderText("Kits")
    await u.clear(kits)
    await u.type(kits, "2.5")
    expect(screen.getByText("Difiere del PLC (2).")).toBeInTheDocument()
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ kits: 2.5 }))
  })

  it("kits del PLC que no van de medio en medio obligan a corregir", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [enCursoLista({ kits: 2.3 })] }))
    expect(screen.getByText("El PLC marcó 2,3 kits y van de medio en medio: corrígelos.")).toBeInTheDocument()
    await saborYLote(u)
    expect(boton("Registrar")).toBeDisabled()
    await u.type(screen.getByPlaceholderText("Kits"), "2.5")
    expect(boton("Registrar")).toBeEnabled()
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ kits: 2.5 }))
  })

  it("sin kits del PLC hay que escribirlos", async () => {
    const u = userEvent.setup()
    renderCard(tanque("LIMPIO"), plc({ cola: [pendiente({ kits: null })] }))
    expect(screen.getByText("El PLC no registró los kits: escríbelos.")).toBeInTheDocument()
    await saborYLote(u)
    expect(boton("Registrar")).toBeDisabled()
    await u.type(screen.getByPlaceholderText("Kits"), "3")
    expect(boton("Registrar")).toBeEnabled()
  })

  it("terminada en el PLC: Registrar y liberar", async () => {
    const u = userEvent.setup()
    const ajuste = { id: "a1", litros: 100, iniciadoEn: H1, hechoEn: H1, sumado: false, noSumadoMotivo: null }
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente({ ajustes: [ajuste] })] }))
    expect(screen.getByText(`El operador terminó en el PLC a las ${horaPlanta(new Date(TERMINO))}.`)).toBeInTheDocument()
    expect(screen.getByText(`Ajuste de agua: +100 L · ${horaPlanta(new Date(H1))}`)).toBeInTheDocument()
    await saborYLote(u)
    // 2 kits × 3.000 L + el ajuste ya hecho.
    expect(screen.getByText(/≈/)).toHaveTextContent("≈ 6.100 L")
    await u.click(boton("Registrar y liberar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ liberar: true, paraVacio: false }))
  })

  it("con Calidad libera solo Registrar", () => {
    renderCard(tanque("LIMPIO"), plc({ cola: [pendiente()] }), [], { calidadLibera: true })
    boton("Registrar")
    noHayBoton("Registrar y liberar")
  })

  it("Modo Vacío: Registrar para Vacío", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente()] }), [], { modoVacio: true })
    noHayBoton("Registrar y liberar")
    noHayBoton("Preparar para Vacío")
    await saborYLote(u)
    await u.click(boton("Registrar para Vacío"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ paraVacio: true, liberar: false }))
  })

  it("resto en el tanque", async () => {
    const u = userEvent.setup()
    renderCard(conResto(), plc({ cola: [pendiente()] }), [LOTE_ANTERIOR])
    expect(screen.getByText("En el tanque había 1.200 L de Fresa (lote 0001).")).toBeInTheDocument()
    expect(screen.getByLabelText("Se sumaron a esta preparación")).toBeChecked()
    await saborYLote(u)
    expect(screen.getByText(/≈/)).toHaveTextContent("≈ 7.200 L")
    expect(boton("Registrar")).toBeEnabled()
    await u.click(screen.getByLabelText("Se sacaron antes"))
    expect(boton("Registrar")).toBeDisabled()
    expect(screen.getByText("Haz primero la transferencia o el desvase (botones de abajo) y después registra la carga.")).toBeInTheDocument()
  })

  it("resto de otro sabor pide confirmar la mezcla", async () => {
    const u = userEvent.setup()
    const a = renderCard(conResto(), plc({ cola: [pendiente()] }), [LOTE_ANTERIOR])
    await saborYLote(u, /Mango/)
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).not.toHaveBeenCalled()
    await u.click(boton("¿Seguro? Sí, mezclar y registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ saborId: "s2" }))
  })

  it("más de 20.000 L avisa sin bloquear", async () => {
    const u = userEvent.setup()
    renderCard(tanque("LIMPIO"), plc({ cola: [pendiente({ kits: 7 })] }))
    await saborYLote(u)
    expect(screen.getByText("Pasa de 20.000 L: revísalo. El líquido ya está en el tanque, así que se puede registrar igual.")).toBeInTheDocument()
    expect(boton("Registrar")).toBeEnabled()
  })

  it("Libera primero", () => {
    renderCard(tanque("EN_PREPARACION"), plc({ cola: [pendiente()] }), [LOTE])
    expect(
      screen.getByText("Libera primero el lote 0002: el PLC ya terminó esa preparación. Si esta carga es la misma que registraste a mano, descártala."),
    ).toBeInTheDocument()
    expect(screen.queryByText("Falta sabor y lote")).not.toBeInTheDocument()
    boton("Descartar carga")
  })

  it("lote de Vacío y línea parada sin PT bloquean", () => {
    renderCard(conResto({ paraVacio: true }), plc({ cola: [pendiente()] }), [{ ...LOTE_ANTERIOR, paraVacio: true }])
    expect(screen.getByText("El tanque tiene un lote de Vacío: entrégalo o pásalo a Aséptico primero (en MODO VACÍO).")).toBeInTheDocument()
    expect(screen.queryByText("Falta sabor y lote")).not.toBeInTheDocument()
    cleanup()

    renderCard(conResto(), plc({ cola: [pendiente()] }), [LOTE_ANTERIOR], { corridasSinPt: [parada()] })
    expect(screen.getByText(/está parada sin Producto Terminado/)).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /Cargar PT/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText("Falta sabor y lote")).not.toBeInTheDocument()
  })

  it("cola de dos: avisa y registra la más antigua", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente(), pendiente({ id: "c2" })] }))
    expect(screen.getByText("Hay 2 cargas del PLC para este tanque: registra primero esta (la más antigua).")).toBeInTheDocument()
    await saborYLote(u)
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ cargaId: "c1" }))
  })

  it("descartar pide confirmar", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente()] }))
    await u.click(boton("Descartar carga"))
    expect(screen.getByText("¿Descartar esta carga del PLC? No se va a usar para ningún lote.")).toBeInTheDocument()
    expect(a.descartarCargaPlc).not.toHaveBeenCalled()
    await u.click(boton("Sí, descartar"))
    expect(a.descartarCargaPlc).toHaveBeenCalledWith("c1")
  })

  it("con carga pendiente no se ofrece la preparación manual", () => {
    renderCard(conResto(), plc({ cola: [pendiente()] }), [LOTE_ANTERIOR], { otros: [tanque("LIMPIO", { numeroTanque: 2 })] })
    noHayBoton(/Iniciar (nueva )?[Pp]reparación/)
    boton("Transferir")
    boton("Desvase")
  })

  it("encendido y sin cargas, el formulario manual sigue", () => {
    renderCard(tanque("LIMPIO"), plc())
    boton("Iniciar Preparación")
    expect(screen.queryByText("Falta sabor y lote")).not.toBeInTheDocument()
  })

  it("desvase guardado se elige y se manda", async () => {
    const u = userEvent.setup()
    const guardado: Desvase = { id: "d1", saborId: "s1", saborNombre: "Fresa", litros: 500, loteOrigen: "0000", creadoEn: "2026-11-08T10:00:00" }
    desvases.mockResolvedValue([guardado])
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente()] }))
    await saborYLote(u)
    const combos = await screen.findAllByRole("combobox")
    expect(combos).toHaveLength(2)
    await elegir(u, combos[1], /500 L · desvasado/)
    expect(screen.getByText(/≈/)).toHaveTextContent("≈ 6.500 L")
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalledWith(expect.objectContaining({ desvaseId: "d1" }))
  })

  it("en CIP se puede registrar la carga", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("CIP"), plc({ cola: [pendiente()] }))
    await saborYLote(u)
    await u.click(boton("Registrar"))
    expect(a.confirmarCargaPlc).toHaveBeenCalled()
  })

  it("error de la base se muestra", async () => {
    const u = userEvent.setup()
    const a = renderCard(tanque("LIMPIO"), plc({ cola: [pendiente()] }))
    a.confirmarCargaPlc.mockResolvedValue({ ok: false, error: "Esa carga del PLC ya se registró o se descartó. Recarga la página." })
    await saborYLote(u)
    await u.click(boton("Registrar"))
    await waitFor(() => expect(screen.getByText("Esa carga del PLC ya se registró o se descartó. Recarga la página.")).toBeInTheDocument())
  })
})
