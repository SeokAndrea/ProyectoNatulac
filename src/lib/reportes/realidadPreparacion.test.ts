import { describe, expect, it } from "vitest"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { DesvaseLoteRegistro, PreparacionRegistro, TransferenciaRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { calcularConsumoYProducido } from "./realidadPreparacion"
import { mermaSemielaboradoTurno } from "./index"

/*
 * Merma de semielaborado — casos de "preparar encima" y transferir.
 *
 * Regresión del turno de Deivis (2026-09-10, lote 0003): una línea
 * terminó un lote dejando resto; se preparó el lote siguiente ENCIMA
 * (mismo tanque) y el Panel mostró "Rendimiento 101 %". La causa era que
 * iniciar_preparacion/transferir_tanque encogían volumen_inicial_l del
 * lote que cerraba mientras dejaban volumen_l en el resto — restando el
 * resto dos veces. Arreglo de fondo: migración 20261034. Acá se fija el
 * comportamiento esperado del cálculo para ese estado de datos.
 */

const TURNO = "turno-actual"
const OTRO_TURNO = "turno-anterior"

function lote(over: Partial<PreparacionRegistro>): PreparacionRegistro {
  return {
    id: "lote-x",
    turnoId: TURNO,
    numeroTanque: 1,
    saborId: null,
    saborNombre: "Pera",
    lote: "0003",
    volumenActualL: 0,
    volumenPreparadoL: 17000,
    volumenAlIniciarTurnoL: 17000,
    tambores: 6,
    agua: null,
    azucar: null,
    acidoCitrico: null,
    creadoEn: "",
    liberadoEn: "",
    cerradoEn: "2026-09-10T18:00:00Z",
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

const SIN_CONTADORES: ContadorRegistro[] = []

function transferencia(over: Partial<TransferenciaRegistro>): TransferenciaRegistro {
  return {
    id: "transf-x",
    litros: 0,
    modo: "LIQUIDO",
    loteIdOrigen: null,
    loteIdDestino: null,
    creadoEn: "2026-09-15T12:00:00Z",
    ...over,
  }
}

function desvase(over: Partial<DesvaseLoteRegistro>): DesvaseLoteRegistro {
  return {
    id: "desv-x",
    litros: 0,
    loteIdOrigen: null,
    creadoEn: "2026-09-15T12:00:00Z",
    ...over,
  }
}

describe("calcularConsumoYProducido — preparar encima / transferir", () => {
  it("lote nacido en el turno: el resto que se mudó queda en volumen_l, no infla ni desinfla la merma", () => {
    // Post-20261034: volumen_inicial_l intacto (17000), volumen_l = resto (380).
    const r = calcularConsumoYProducido(
      TURNO,
      [lote({ volumenAlIniciarTurnoL: 17000, volumenPreparadoL: 17000, volumenActualL: 380 })],
      [corrida({})],
      [pt(16620)],
      SIN_CONTADORES,
      [],
    )
    expect(r.consumo).toBe(16620) // 17000 − 380
    expect(r.producido).toBe(16620)
    expect(r.litrosSinContraste).toBe(0)
  })

  it("lote heredado: el inicio sale del volumen congelado, el resto mudado sigue en volumen_l", () => {
    // inicio = volumenAlIniciarTurnoL (congelado al cierre del turno anterior),
    // no volumen_inicial_l. El fix vale igual acá: fin = resto real.
    const r = calcularConsumoYProducido(
      TURNO,
      [
        lote({
          turnoId: OTRO_TURNO,
          volumenAlIniciarTurnoL: 12000,
          volumenPreparadoL: 17000,
          volumenActualL: 500,
        }),
      ],
      [corrida({})],
      [pt(11500)],
      SIN_CONTADORES,
      [],
    )
    expect(r.consumo).toBe(11500) // 12000 − 500
    expect(r.producido).toBe(11500)
    expect(r.litrosSinContraste).toBe(0)
  })

  it("merma real positiva sigue contando (no se toca el caso sano)", () => {
    const r = calcularConsumoYProducido(
      TURNO,
      [lote({ volumenAlIniciarTurnoL: 17000, volumenPreparadoL: 17000, volumenActualL: 500 })],
      [corrida({})],
      [pt(16000)],
      SIN_CONTADORES,
      [],
    )
    expect(r.consumo).toBe(16500)
    expect(r.producido).toBe(16000)
  })

  it("dato inconsistente (PT supera el tramo consumido): el lote queda fuera del %", () => {
    // tramo = 16240 − 380 = 15860; PT 17000 > 15860 * 1.05 → fuera.
    const r = calcularConsumoYProducido(
      TURNO,
      [lote({ volumenAlIniciarTurnoL: 16240, volumenPreparadoL: 16240, volumenActualL: 380 })],
      [corrida({})],
      [pt(17000)],
      SIN_CONTADORES,
      [],
    )
    expect(r.consumo).toBe(0)
    expect(r.producido).toBe(0)
    expect(r.litrosSinContraste).toBe(17000)
  })
})

describe("mermaSemielaboradoTurno — nunca por encima de 100 %", () => {
  it("un negativo residual sub-margen se muestra como 0 (rendimiento 100 %)", () => {
    // tramo 16240, PT 16620: dentro del margen de redondeo (no queda
    // fuera), pero 1 − 16620/16240 < 0. Debe salir 0, no negativo.
    const semi = mermaSemielaboradoTurno(
      TURNO,
      [lote({ volumenAlIniciarTurnoL: 16240, volumenPreparadoL: 16240, volumenActualL: 0 })],
      [corrida({})],
      [pt(16620)],
      SIN_CONTADORES,
      [],
    )
    expect(semi.pct).toBe(0)
  })

  it("merma positiva pasa sin cambios", () => {
    const semi = mermaSemielaboradoTurno(
      TURNO,
      [lote({ volumenAlIniciarTurnoL: 17000, volumenPreparadoL: 17000, volumenActualL: 500 })],
      [corrida({})],
      [pt(16000)],
      SIN_CONTADORES,
      [],
    )
    expect(semi.pct).toBeGreaterThan(2)
    expect(semi.pct).toBeLessThan(4)
  })
})

/*
 * Restar transferencias y desvases del consumo — caso real (Javier,
 * 2026-09-15, tanque 3): una transferencia se llevó litros de un lote
 * sin dejar rastro en el cálculo, y esos litros se contaban como
 * merma. Ver plan "Merma de semielaborado: restar transferencias y
 * desvases del consumo".
 */
describe("calcularConsumoYProducido — transferencias y desvases", () => {
  it("transferencia saliente: el lote que entrega no carga esos litros como merma", () => {
    // Todo el tramo (16260) se transfirió — nada se perdió, nada se produjo
    // localmente. Sin el ajuste: consumo 16260, producido 0 (100% merma).
    const r = calcularConsumoYProducido(
      TURNO,
      [lote({ id: "lote-a", volumenAlIniciarTurnoL: 16260, volumenPreparadoL: 16260, volumenActualL: 0 })],
      [corrida({ loteId: "lote-a" })],
      [pt(0)],
      SIN_CONTADORES,
      [],
      [transferencia({ loteIdOrigen: "lote-a", litros: 16260 })],
    )
    expect(r.consumo).toBe(0)
    expect(r.producido).toBe(0)
    expect(r.litrosSinContraste).toBe(0)
  })

  it("transferencia entrante a un lote YA EXISTENTE se suma a su tramo", () => {
    // El lote B no se movió por su cuenta (inicio == fin == 2000) pero
    // absorbió 15300 L a mitad de turno y los produjo. Sin el ajuste,
    // tramo = 0 y el lote queda excluido (tramo <= 0), perdiendo 15300 L
    // de producción real y bien contrastada.
    const r = calcularConsumoYProducido(
      TURNO,
      [
        lote({
          id: "lote-b",
          creadoEn: "2026-09-15T10:00:00Z",
          volumenAlIniciarTurnoL: 2000,
          volumenPreparadoL: 18260,
          volumenActualL: 2000,
        }),
      ],
      [corrida({ loteId: "lote-b" })],
      [pt(15300)],
      SIN_CONTADORES,
      [],
      [transferencia({ loteIdDestino: "lote-b", litros: 15300, creadoEn: "2026-09-15T15:00:00Z" })],
    )
    expect(r.consumo).toBe(15300)
    expect(r.producido).toBe(15300)
    expect(r.litrosSinContraste).toBe(0)
  })

  it("transferencia a un lote NUEVO (nace en la misma transferencia) no duplica el monto", () => {
    // El lote C nace en el MISMO instante que la transferencia (modo
    // LIMPIO) con el monto YA incluido en volumenPreparadoL — sumarlo de
    // nuevo como "entrante" contaría el mismo litro dos veces.
    const MISMO_INSTANTE = "2026-09-15T15:00:00Z"
    const r = calcularConsumoYProducido(
      TURNO,
      [
        lote({
          id: "lote-c",
          creadoEn: MISMO_INSTANTE,
          volumenAlIniciarTurnoL: 16260,
          volumenPreparadoL: 16260,
          volumenActualL: 0,
        }),
      ],
      [corrida({ loteId: "lote-c" })],
      [pt(16260)],
      SIN_CONTADORES,
      [],
      [transferencia({ loteIdDestino: "lote-c", litros: 16260, creadoEn: MISMO_INSTANTE })],
    )
    expect(r.consumo).toBe(16260) // NO 32520
    expect(r.producido).toBe(16260)
  })

  it("desvase saliente: mismo criterio que una transferencia, resta del tramo del lote que lo entrega", () => {
    const r = calcularConsumoYProducido(
      TURNO,
      [lote({ id: "lote-d", volumenAlIniciarTurnoL: 5000, volumenPreparadoL: 5000, volumenActualL: 0 })],
      [corrida({ loteId: "lote-d" })],
      [pt(0)],
      SIN_CONTADORES,
      [],
      [],
      [desvase({ loteIdOrigen: "lote-d", litros: 5000 })],
    )
    expect(r.consumo).toBe(0)
    expect(r.producido).toBe(0)
    expect(r.litrosSinContraste).toBe(0)
  })
})
