import { describe, expect, it } from "vitest"
import type { Corrida } from "@/lib/produccion/tipos"
import type { PreparacionRegistro, TotalesLote } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { calcularConsumoYProducido, tramosPorLote } from "./realidadPreparacion"
import { mermaSemielaboradoTurno } from "./index"

/*
 * Merma de semielaborado (dueña, 2026-11-03):
 *   Rendimiento = Total envasado / Total preparado × 100
 *   Merma       = 100 − Rendimiento
 * Los totales del lote (en todos sus turnos) vienen de rendimiento_lotes()
 * (migración 20261115090000). El volumen vivo del tanque ya no entra.
 */

const TURNO = "turno-actual"
const OTRO_TURNO = "turno-anterior"

function totales(over: Partial<TotalesLote> = {}): TotalesLote {
  return { preparadoL: 10000, entrantesL: 0, salientesL: 0, envasadoL: 9000, cerrado: true, ...over }
}

function lote(over: Partial<PreparacionRegistro>): PreparacionRegistro {
  return {
    id: "lote-x",
    turnoId: TURNO,
    numeroTanque: 1,
    saborId: null,
    saborNombre: "Pera",
    lote: "0003",
    volumenActualL: 0,
    volumenPreparadoL: 10000,
    volumenAlIniciarTurnoL: 10000,
    tambores: 6,
    agua: null,
    azucar: null,
    acidoCitrico: null,
    creadoEn: "",
    liberadoEn: "",
    cerradoEn: "2026-09-10T18:00:00Z",
    paraVacio: false,
    totales: totales(),
    ...over,
  }
}

function corrida(over: Partial<Corrida>): Corrida {
  return {
    id: "corrida-x",
    linea: "LINEA_1",
    presentacion: "1000",
    envasesHora: 6000,
    saborId: null,
    saborNombre: "Pera",
    lote: "0003",
    loteId: "lote-x",
    activa: false,
    activadaEn: "",
    pausadaEn: null,
    loteTerminado: null,
    finalizadaEn: "2026-09-10T18:00:00Z",
    esperandoCierre: false,
    entregadaEn: null,
    confirmadoInicioEn: null,
    ...over,
  }
}

function pt(litros: number, over: Partial<ProductoTerminadoRegistro> = {}): ProductoTerminadoRegistro {
  return {
    id: "pt-x",
    linea: "LINEA_1",
    corridaId: "corrida-x",
    saborId: null,
    saborNombre: "Pera",
    presentacion: "1000",
    paletas: 0,
    cajasSueltas: 0,
    litrosProducidos: litros,
    creadoEn: "",
    registradoPorNombre: null,
    ...over,
  }
}

describe("rendimiento = envasado / preparado", () => {
  it("lote cerrado en un solo turno: 9.000 / 10.000 → merma 10 %", () => {
    const r = calcularConsumoYProducido(TURNO, [lote({})], [corrida({})], [pt(9000)])
    expect(r.consumo).toBe(10000)
    expect(r.producido).toBe(9000)
    const semi = mermaSemielaboradoTurno(TURNO, [lote({})], [corrida({})], [pt(9000)], [], [])
    expect(semi.pct).toBe(10)
  })

  it("el volumen vivo del tanque NO entra: aunque nadie haya medido, la merma sale", () => {
    // Antes: volumen_l = preparado − PT → rendimiento 100 %. Ahora no importa volumen_l.
    const semi = mermaSemielaboradoTurno(TURNO, [lote({ volumenActualL: 1000 })], [corrida({})], [pt(9000)], [], [])
    expect(semi.pct).toBe(10)
  })

  it("sin filtros: PT por encima de lo preparado da merma negativa, tal cual", () => {
    const l = lote({ totales: totales({ preparadoL: 10000, envasadoL: 10500 }) })
    const semi = mermaSemielaboradoTurno(TURNO, [l], [corrida({})], [pt(10500)], [], [])
    expect(semi.pct).toBe(-5)
    expect(semi.hayLoteSinContraste).toBe(false)
  })

  it("lote abierto: queda en curso, fuera del % y sin marcarlo como parcial", () => {
    const l = lote({ cerradoEn: null, totales: totales({ cerrado: false, envasadoL: 4000 }) })
    const r = calcularConsumoYProducido(TURNO, [l], [corrida({})], [pt(4000)])
    expect(r.consumo).toBe(0)
    expect(r.producido).toBe(0)
    expect(r.hayLoteAbierto).toBe(true)
    expect(r.litrosSinContraste).toBe(0)
    expect(tramosPorLote(TURNO, [l], [corrida({})], [pt(4000)]).tramos[0].excluido).toBe("EN_CURSO")
  })

  it("sin totales leídos: no hay contra qué comparar (sin contraste)", () => {
    const r = calcularConsumoYProducido(TURNO, [lote({ totales: null })], [corrida({})], [pt(9000)])
    expect(r.consumo).toBe(0)
    expect(r.litrosSinContraste).toBe(9000)
  })
})

describe("lote que dura dos turnos: el preparado se reparte según lo envasado", () => {
  // Preparado 10.000; T1 envasó 4.000 y T2 5.000 (total 9.000) → 90 % en los dos.
  const l = lote({ turnoId: OTRO_TURNO, totales: totales({ envasadoL: 9000 }) })

  it("T2 (envasó 5.000) carga 5/9 del preparado", () => {
    const r = calcularConsumoYProducido(TURNO, [l], [corrida({})], [pt(5000)])
    expect(r.consumo).toBeCloseTo(5555.56, 1)
    expect(r.producido).toBe(5000)
    expect(mermaSemielaboradoTurno(TURNO, [l], [corrida({})], [pt(5000)], [], []).pct).toBe(10)
  })

  it("T1 (envasó 4.000) carga 4/9 y da el mismo rendimiento", () => {
    expect(mermaSemielaboradoTurno(OTRO_TURNO, [l], [corrida({})], [pt(4000)], [], []).pct).toBe(10)
  })

  it("lote que no envasó nada: todo lo preparado es merma del turno donde nació", () => {
    const sinPt = lote({ totales: totales({ envasadoL: 0 }) })
    expect(calcularConsumoYProducido(TURNO, [sinPt], [], []).consumo).toBe(10000)
    expect(calcularConsumoYProducido(OTRO_TURNO, [sinPt], [corrida({})], []).consumo).toBe(0)
  })
})

describe("transferencias, desvases y Vacío no son merma", () => {
  it("lo transferido/desvasado/entregado a Vacío se resta del preparado", () => {
    // 10.000 preparados, se fueron 3.000 a otro lado, se envasaron 6.900 → 7.000 disponibles.
    const l = lote({ totales: totales({ salientesL: 3000, envasadoL: 6900 }) })
    const r = calcularConsumoYProducido(TURNO, [l], [corrida({})], [pt(6900)])
    expect(r.consumo).toBe(7000)
    expect(r.producido).toBe(6900)
  })

  it("lo recibido de otro lote se suma al preparado", () => {
    const l = lote({ totales: totales({ preparadoL: 2000, entrantesL: 15300, envasadoL: 17000 }) })
    const r = calcularConsumoYProducido(TURNO, [l], [corrida({})], [pt(17000)])
    expect(r.consumo).toBe(17300)
  })

  it("un lote de Vacío no cuenta", () => {
    const r = calcularConsumoYProducido(TURNO, [lote({ paraVacio: true, cerradoEn: null })], [], [])
    expect(r.consumo).toBe(0)
    expect(r.hayLoteAbierto).toBe(false)
  })
})
