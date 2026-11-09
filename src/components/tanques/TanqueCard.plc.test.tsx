import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { TanqueCard } from "@/components/tanques/TanqueCard"
import type { CargaPlc, DesgloseLote, PlcDelTanque, VistaVivaTanque } from "@/lib/preparacion/plc"
import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
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
const SABORES: Sabor[] = [{ id: "s1", nombre: "Fresa", volumen: 3000, activo: true, familiaId: "f1", familiaNombre: "Clásicos" }]

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

function renderCard(t: TanqueRecepcion, p: PlcDelTanque | null | undefined, preparaciones: PreparacionRegistro[] = []) {
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
    tanquesDelTurno: [t],
    corridasDelTurno: [],
    areaCodigo: "ASEPTICO",
    usuarioSesion: "supervisor",
    analisisPorLote: new Map(),
    calidadLibera: false,
    puedeIrACalidad: false,
    turnoId: TURNO,
    acciones,
  }
  render(<MemoryRouter>{p === undefined ? <TanqueCard {...props} /> : <TanqueCard {...props} plc={p} />}</MemoryRouter>)
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
