import { describe, expect, it } from "vitest"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
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
