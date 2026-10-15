import { describe, expect, it } from "vitest"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import type { TurnoHistorial } from "@/lib/historialTurnos"
import type { Parada } from "@/lib/paradas"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Validacion } from "@/lib/validarJornada"
import { calcularMesAutomatico, type CatalogosIndicadores, type EntradaMes } from "./automatico"

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
  ({ id, linea, presentacion, saborId: "s1", envasesHora: 9000, activa: false, activadaEn: desde, finalizadaEn: hasta, entregadaEn: null }) as unknown as Corrida
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
  ({ id: "t1", fecha: "2026-09-10", turnoTipo: "TURNO_1", horaInicio: "07:00:00", estado: "CERRADO", corridas: [], contadores: [], productoTerminado: [], preparaciones: [], transferencias: [], desvases: [], salidasVacio: [], ...over }) as TurnoHistorial

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
  const entrada: EntradaMes = { turnos: [{ turno: t1, paradas }], validaciones: new Map(), cajas: [], plan: [{ volumenMl: 250, cajas: 2500 }] }
  const mes = calcularMesAutomatico(entrada, CAT)

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

  describe("plan programado (semanal): va a la línea que DE VERDAD corrió el producto", () => {
    // Pera 250 (s1): la app la programó en la Línea 2, pero la Línea 2 hizo 2040 cajas y la Línea 3, 1020.
    const t3 = turno({ id: "t3", corridas: [corrida("c3", "LINEA_3", "250", "2026-09-10T07:00:00", "2026-09-10T10:00:00")], productoTerminado: [pt("c3", 10, 20)] })
    const conPlan = (planConLinea: EntradaMes["planConLinea"], turnos = [{ turno: t1, paradas: [] }, { turno: t3, paradas: [] }]) =>
      calcularMesAutomatico({ turnos, validaciones: new Map(), cajas: [], plan: [], planConLinea }, CAT).presentaciones

    it("si la corrieron dos líneas, se reparte según las cajas de cada una", () => {
      const p = conPlan([{ linea: "2", saborId: "s1", volumenMl: 250, cajas: 3000 }])
      expect(p["2|250"].plan).toBe(2000) // 2040 de 3060
      expect(p["3|250"].plan).toBe(1000) // 1020 de 3060
    })

    it("si la corrió otra línea que la programada, el plan va a esa", () => {
      const p = conPlan([{ linea: "2", saborId: "s1", volumenMl: 250, cajas: 3000 }], [{ turno: t3, paradas: [] }])
      expect(p["3|250"].plan).toBe(3000)
      expect(p["2|250"]?.plan ?? null).toBeNull()
    })

    it("si no se produjo, queda en la línea programada (se ve el incumplido)", () => {
      const p = conPlan([{ linea: "2", saborId: "otro", volumenMl: 200, cajas: 800 }])
      expect(p["2|200"].plan).toBe(800)
    })
  })

  it("eficiencia de la línea: (disponible − no programadas) ÷ disponible", () => {
    // T1 480 min − 30 programada = 450; no programadas 45 + 15 + 20 + 30 = 110 → 340 ÷ 450.
    expect(mes.eficiencia["2"]).toBe(76)
  })

  describe("con lo corregido en Validar jornada", () => {
    const val = (estado: Validacion["estado"], valor: number | null): Validacion => ({ estado, valor, nota: null, validadoPorNombre: null })
    const corregido = calcularMesAutomatico(
      {
        ...entrada,
        validaciones: new Map([
          [
            "2026-09-10",
            {
              contadores: new Map([["c1", val("EDITADO", 49960)]]),
              lotes: new Map(),
              // La de las 9:00 era la misma que la de las 8:00 (no cuenta) y la tapadora fue de 10 min.
              paradas: new Map([[paradas[1].id, val("EXCLUIDA", null)], [paradas[3].id, val("EDITADO", 10)]]),
            },
          ],
        ]),
        cajas: [{ turnoId: "t1", saborId: "s1", volumenMl: 250, cajas: 2100 }],
      },
      CAT,
    )

    it("usa las cajas corregidas del turno y el contador corregido", () => {
      expect(corregido.presentaciones["2|250"].prod).toBe(2100)
      expect(corregido.presentaciones["2|250"].merma).toBe(2) // 1 − 48960 ÷ 49960
    })

    it("las paradas que no cuentan salen y las corregidas usan sus minutos", () => {
      expect(corregido.presentaciones["2|250"].paradas).toEqual([{ causa: "Atasco en la araña", minutos: 45, veces: 1 }])
      expect(corregido.presentaciones["2|200"].paradas).toEqual([{ causa: "Falla en tapadora", minutos: 10, veces: 1 }])
      // No programadas: 45 + 20 + 10 = 75 → 375 ÷ 450.
      expect(corregido.eficiencia["2"]).toBe(83)
    })
  })
})
