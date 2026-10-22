import { describe, expect, it } from "vitest"
import { duracionBaseTurnoMin } from "@/lib/eficiencia"
import { minutosSinReportar, textoSinReportar, type EntradaSinReportar } from "@/lib/minutosSinReportar"
import type { Parada } from "@/lib/paradas"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"

const corrida = (id: string, linea: string, presentacion: string, envasesHora: number) =>
  ({ id, linea, presentacion, envasesHora }) as unknown as Corrida
const pt = (corridaId: string, presentacion: string, litros: number) =>
  ({ corridaId, presentacion, litrosProducidos: litros }) as unknown as ProductoTerminadoRegistro
const parada = (linea: string, clase: Parada["clase"], inicio: string, fin: string) =>
  ({ lineaCodigo: linea, clase, inicio: `2026-10-15T${inicio}:00`, fin: `2026-10-15T${fin}:00` }) as unknown as Parada

const base: EntradaSinReportar = {
  turnoTipo: "TURNO_1",
  horaInicio: "07:00:00",
  estado: "CERRADO",
  horasTranscurridas: 0,
  corridas: [],
  productoTerminado: [],
  paradas: [],
}
const turnoMin = duracionBaseTurnoMin("TURNO_1", base)!

describe("minutosSinReportar", () => {
  it("turno cerrado: turno − paradas − lo que equivale el PT a la velocidad elegida", () => {
    const filas = minutosSinReportar({
      ...base,
      // L1: 6.000 L de 1 L = 6.000 envases a 6.000/h = 60 min. L3: 1.980 L de 330 ml = 6.000 envases a 7.500/h = 48 min.
      corridas: [corrida("c1", "LINEA_1", "1000", 6000), corrida("c3", "LINEA_3", "330", 7500)],
      productoTerminado: [pt("c1", "1000", 6000), pt("c3", "330", 1980)],
      paradas: [parada("LINEA_1", "PROGRAMADA", "08:00", "08:30"), parada("LINEA_1", "NO_PROGRAMADA", "09:00", "09:45")],
    })
    expect(filas).toEqual([
      { linea: "1", ventanaMin: turnoMin, paradasMin: 75, producidoMin: 60, sinReportarMin: turnoMin - 135 },
      { linea: "3", ventanaMin: turnoMin, paradasMin: 0, producidoMin: 48, sinReportarMin: turnoMin - 48 },
    ])
  })

  it("las paradas que se pisan (supervisor y Mantenimiento) cuentan una vez", () => {
    const [f] = minutosSinReportar({
      ...base,
      corridas: [corrida("c1", "LINEA_1", "1000", 6000)],
      productoTerminado: [pt("c1", "1000", 6000)],
      paradas: [parada("LINEA_1", "NO_PROGRAMADA", "09:00", "10:00"), parada("LINEA_1", "NO_PROGRAMADA", "09:30", "10:30")],
    })
    expect(f.paradasMin).toBe(90)
  })

  it("una corrida sin PT aporta 0 de producido: su tiempo sale como sin reportar", () => {
    const [f] = minutosSinReportar({
      ...base,
      corridas: [corrida("c1", "LINEA_1", "1000", 6000), corrida("c2", "LINEA_1", "1000", 6000)],
      productoTerminado: [pt("c1", "1000", 6000)],
    })
    expect(f.sinReportarMin).toBe(turnoMin - 60)
    expect(textoSinReportar(f).texto).toBe("faltan 7 h por reportar")
  })

  it("turno abierto: solo lo que va del turno; nunca negativo", () => {
    const [f] = minutosSinReportar({
      ...base,
      estado: "ABIERTO",
      horasTranscurridas: 2,
      corridas: [corrida("c1", "LINEA_1", "1000", 6000)],
      productoTerminado: [pt("c1", "1000", 15000)],
    })
    expect(f.ventanaMin).toBe(120)
    expect(f.sinReportarMin).toBe(0)
  })

  it("hasta 10 min es «al día»; más, avisa", () => {
    const fila = (sinReportarMin: number) => ({ linea: "1", ventanaMin: 480, paradasMin: 0, producidoMin: 0, sinReportarMin })
    expect(textoSinReportar(fila(10))).toEqual({ texto: "al día", alerta: false })
    expect(textoSinReportar(fila(95))).toEqual({ texto: "faltan 1 h 35 min por reportar", alerta: true })
  })
})
