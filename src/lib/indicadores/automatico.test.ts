import { describe, expect, it } from "vitest"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import type { TurnoHistorial } from "@/lib/historialTurnos"
import type { Parada } from "@/lib/paradas"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { calcularMesAutomatico, type CatalogosIndicadores } from "./automatico"

const PRES = [
  { codigo: "250", volumenMl: 250, cajasXPaleta: 100, envasesXCaja: 24 },
  { codigo: "200", volumenMl: 200, cajasXPaleta: 100, envasesXCaja: 24 },
] as unknown as PresentacionLive[]
const vel = (linea: string, presentacion: string) => ({ linea, presentacion, maquina: "TP", envasesHora: 9000, activo: true }) as unknown as VelocidadLive

const CAT: CatalogosIndicadores = {
  lineas: ["LINEA_2", "LINEA_3"],
  presentaciones: PRES,
  velocidades: [vel("LINEA_2", "250"), vel("LINEA_2", "200"), vel("LINEA_3", "250")],
  familiaDeSabor: new Map([["s1", "Selecto"]]),
}

const corrida = (id: string, linea: string, presentacion: string, desde: string, hasta: string | null): Corrida =>
  ({ id, linea, presentacion, envasesHora: 9000, activa: false, activadaEn: desde, finalizadaEn: hasta, entregadaEn: null }) as unknown as Corrida
const contador = (corridaId: string, envases: number): ContadorRegistro =>
  ({ id: `k-${corridaId}`, linea: "LINEA_2", corridaId, envasesLlenadora: envases, envasesBuenos: null, justificacion: "" }) as ContadorRegistro
const pt = (corridaId: string, paletas: number, cajas: number): ProductoTerminadoRegistro =>
  ({ id: `pt-${corridaId}`, corridaId, paletas, cajasSueltas: cajas, litrosProducidos: 0 }) as unknown as ProductoTerminadoRegistro
const parada = (linea: string, inicio: string, minutos: number, tipoNombre: string, clase: Parada["clase"] = "NO_PROGRAMADA"): Parada => {
  const fin = new Date(new Date(inicio).getTime() + minutos * 60000)
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${d.toTimeString().slice(0, 8)}`
  return { id: `${tipoNombre}-${inicio}`, clase, origen: "MANUAL", lineaCodigo: linea, turnoTipo: "TURNO_1", tipoCodigo: null, tipoNombre, tiempoGuiaMin: null, nota: null, justificacionDesvio: null, inicio, fin: local(fin), supervisorNombre: null }
}
const turno = (over: Partial<TurnoHistorial>): TurnoHistorial =>
  ({ id: "t1", turnoTipo: "TURNO_1", horaInicio: "07:00:00", estado: "CERRADO", corridas: [], contadores: [], productoTerminado: [], preparaciones: [], transferencias: [], desvases: [], salidasVacio: [], ...over }) as TurnoHistorial

describe("calcularMesAutomatico", () => {
  // Línea 2: TPA-250 de 7:00 a 11:00 y TPA-200 desde las 11:30.
  const t1 = turno({
    corridas: [corrida("c1", "LINEA_2", "250", "2026-09-10T07:00:00", "2026-09-10T11:00:00"), corrida("c2", "LINEA_2", "200", "2026-09-10T11:30:00", null)],
    contadores: [contador("c1", 50000), contador("c2", 24000)],
    productoTerminado: [pt("c1", 20, 40), pt("c2", 9, 90)],
  })
  const paradas = [
    parada("LINEA_2", "2026-09-10T08:00:00", 45, "Atasco en la araña"),
    parada("LINEA_2", "2026-09-10T09:00:00", 15, "Atasco en la araña"),
    parada("LINEA_2", "2026-09-10T11:10:00", 20, "Cambio de bobina"), // entre corridas: no va a ninguna
    parada("LINEA_2", "2026-09-10T12:00:00", 30, "Falla en tapadora"),
    parada("LINEA_2", "2026-09-10T13:00:00", 30, "Descanso", "PROGRAMADA"),
  ]
  const mes = calcularMesAutomatico([{ turno: t1, paradas }], [{ volumenMl: 250, cajas: 2500 }], CAT)

  it("cajas producidas = PT de las corridas, y la merma de envases contra el contador", () => {
    const p250 = mes.presentaciones["2|250"]
    expect(p250.corrio).toBe(true)
    expect(p250.prod).toBe(2040) // 20 paletas × 100 + 40
    expect(p250.merma).toBe(2.08) // 1 − 48960 ÷ 50000
    expect(mes.presentaciones["2|200"].prod).toBe(990)
    expect(mes.presentaciones["2|200"].merma).toBe(1)
  })

  it("cada parada no programada va a la presentación que corría; las de entre corridas, a ninguna", () => {
    expect(mes.presentaciones["2|250"].paradas).toEqual([{ causa: "Atasco en la araña", minutos: 60, veces: 2 }])
    expect(mes.presentaciones["2|200"].paradas).toEqual([{ causa: "Falla en tapadora", minutos: 30, veces: 1 }])
  })

  it("el plan va a la línea que corrió esa presentación", () => {
    expect(mes.presentaciones["2|250"].plan).toBe(2500)
    expect(mes.presentaciones["3|250"]).toBeUndefined()
  })

  it("eficiencia de la línea: (disponible − no programadas) ÷ disponible", () => {
    // T1 480 min − 30 programada = 450; no programadas 45 + 15 + 20 + 30 = 110 → 340 ÷ 450.
    expect(mes.eficiencia["2"]).toBe(76)
  })
})
