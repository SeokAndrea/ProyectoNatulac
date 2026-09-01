import { describe, expect, it } from "vitest"
import { agruparCasos, evaluarCaso, filasCasoDe } from "@/lib/calculosPruebas"
// El CSV se importa como texto crudo (Vite `?raw`); así el test no
// depende de las APIs de Node ni de @types/node.
import CSV from "@/lib/__fixtures__/casos-calculo.csv?raw"

/*
 * Verifica las fórmulas de producción (mermas y meta) contra los casos
 * reales cargados en src/lib/__fixtures__/casos-calculo.csv.
 *
 * Para agregar un caso nuevo: sumá filas al CSV con los datos del turno
 * y los valores esperados en las columnas esp_*. No hace falta tocar
 * este archivo — genera un bloque de tests por cada caso.
 */

const CASOS = agruparCasos(filasCasoDe(CSV))

/** Los % se redondean a 2 decimales en el código y los esperados van a mano. */
const TOL_PCT = 0.5
/** Las cajas son enteras: 1 de margen por redondeo. */
const TOL_CAJAS = 1

function cerca(obtenido: number | null, esperado: number, tol: number, etiqueta: string) {
  expect(obtenido, `${etiqueta}: se esperaba un número, se obtuvo ${obtenido}`).not.toBeNull()
  expect(
    Math.abs((obtenido as number) - esperado),
    `${etiqueta}: esperado ${esperado}, obtenido ${obtenido} (tolerancia ${tol})`,
  ).toBeLessThanOrEqual(tol)
}

describe("cálculos de producción vs. casos reales (CSV)", () => {
  it("el CSV trae al menos un caso", () => {
    expect(CASOS.length).toBeGreaterThan(0)
  })

  for (const caso of CASOS) {
    describe(caso.nombre, () => {
      const { desglose, esperado } = evaluarCaso(caso)

      if (esperado.mermaEnvaseTurnoPct !== null) {
        it("merma de envase del turno", () => {
          cerca(desglose.mermaEnvaseTurnoPct, esperado.mermaEnvaseTurnoPct as number, TOL_PCT, "merma envase turno")
        })
      }

      if (esperado.rendimientoTurnoPct !== null) {
        it("rendimiento del turno (merma de semielaborado)", () => {
          cerca(desglose.rendimientoTurnoPct, esperado.rendimientoTurnoPct as number, TOL_PCT, "rendimiento turno")
        })
      }

      if (esperado.cumplimientoTurnoPct !== null) {
        it("cumplimiento de meta del turno", () => {
          cerca(desglose.cumplimientoTurnoPct, esperado.cumplimientoTurnoPct as number, TOL_PCT, "cumplimiento turno")
        })
      }

      for (const ce of esperado.porCorrida) {
        const d = desglose.porCorrida.find((c) => c.turnoLineaId === ce.turnoLineaId)

        if (ce.mermaEnvasePct !== null) {
          it(`${ce.turnoLineaId}: merma de envase de la corrida`, () => {
            cerca(d?.mermaEnvasePct ?? null, ce.mermaEnvasePct as number, TOL_PCT, "merma corrida")
          })
        }
        if (ce.cajasEsperadas !== null) {
          it(`${ce.turnoLineaId}: cajas esperadas`, () => {
            cerca(d?.cajasEsperadas ?? null, ce.cajasEsperadas as number, TOL_CAJAS, "cajas esperadas")
          })
        }
        if (ce.cajasReales !== null) {
          it(`${ce.turnoLineaId}: cajas reales`, () => {
            cerca(d?.cajasReales ?? null, ce.cajasReales as number, TOL_CAJAS, "cajas reales")
          })
        }
      }
    })
  }
})
