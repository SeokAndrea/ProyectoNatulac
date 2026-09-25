import { describe, expect, it } from "vitest"
import { calcularEficiencia, duracionBaseTurnoMin, eficienciaDelTurno, velocidadDeLinea, velocidadMaximaDeLinea } from "@/lib/eficiencia"
import type { Parada } from "@/lib/paradas"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"

// Ejemplo del plan: línea 2, 250 ml, 24 envases/caja, 9.000 envases/h (elegida = máxima acá), turno de 8 h.
// Programadas 1,5 h, ocioso 0,5 h, no programadas 1 h → disponible 6 h, operativo 5 h.
const BASE = {
  turnoMin: 480,
  transcurridoMin: 480,
  minutosProgramada: 90,
  minutosOcioso: 30,
  minutosNoProgramada: 60,
  velocidadElegidaEnvasesHora: 9000,
  velocidadMaximaEnvasesHora: 9000,
  realEnvases: 43200, // 1.800 cajas
  envasesPorCaja: 24,
}

describe("duracionBaseTurnoMin", () => {
  it("T1 8 h, T2 7,5 h, T3 8,5 h; el 12x12 no tiene base", () => {
    expect(duracionBaseTurnoMin("TURNO_1")).toBe(480)
    expect(duracionBaseTurnoMin("TURNO_2")).toBe(450)
    expect(duracionBaseTurnoMin("TURNO_3")).toBe(510)
    expect(duracionBaseTurnoMin("12X12")).toBeNull()
  })
})

describe("calcularEficiencia — ejemplo del plan", () => {
  const r = calcularEficiencia(BASE)
  it("tiempos", () => {
    expect(r.disponibleMin).toBe(360)
    expect(r.operativoMin).toBe(300)
  })
  it("meta y real en envases y cajas", () => {
    expect(r.metaEnvases).toBe(54000)
    expect(r.metaCajas).toBe(2250)
    expect(r.realCajas).toBe(1800)
  })
  it("eficiencia 80 %, disponibilidad 83 %, rendimiento 96 %", () => {
    expect(r.eficienciaPct).toBe(80)
    expect(r.disponibilidadPct).toBe(83)
    expect(r.rendimientoPct).toBe(96)
    expect(r.avancePct).toBe(80)
  })
  it("al cierre el ritmo es igual a Real ÷ Meta", () => {
    expect(r.eficienciaPct).toBe(r.avancePct)
  })
  it("una parada programada u ociosa no baja la eficiencia, solo la meta", () => {
    const sinNoProg = calcularEficiencia({ ...BASE, minutosNoProgramada: 0, realEnvases: 54000 })
    expect(sinNoProg.eficienciaPct).toBe(100)
    expect(sinNoProg.metaEnvases).toBe(54000)
  })
  it("una no programada baja la disponibilidad", () => {
    const con = calcularEficiencia({ ...BASE, minutosNoProgramada: 120 })
    expect(con.disponibilidadPct).toBe(67)
  })
})

describe("calcularEficiencia — OEE: la Meta usa la elegida, la Eficiencia usa la MÁXIMA", () => {
  // Elegida 6.000 env/h (75 % de la máxima de 8.000) — el supervisor la cumple al 100 % (avance),
  // pero la Eficiencia (OEE real) tiene que reflejar que la máquina da más de lo que se pidió.
  const entrada = {
    turnoMin: 480,
    transcurridoMin: 480,
    minutosProgramada: 0,
    minutosOcioso: 0,
    minutosNoProgramada: 0,
    velocidadElegidaEnvasesHora: 6000,
    velocidadMaximaEnvasesHora: 8000,
    realEnvases: 48000, // exactamente la meta a 6.000 env/h × 8 h
    envasesPorCaja: 24,
  }
  const r = calcularEficiencia(entrada)
  it("el avance (contra la elegida) da 100 %", () => {
    expect(r.metaEnvases).toBe(48000)
    expect(r.avancePct).toBe(100)
  })
  it("la eficiencia (OEE, contra la máxima) da 75 %, no 100 %", () => {
    expect(r.eficienciaPct).toBe(75)
    expect(r.rendimientoPct).toBe(75)
  })
  it("sin velocidad máxima no inventa la eficiencia, aunque haya elegida (para la meta)", () => {
    const sinMaxima = calcularEficiencia({ ...entrada, velocidadMaximaEnvasesHora: null })
    expect(sinMaxima.eficienciaPct).toBeNull()
    expect(sinMaxima.avancePct).toBe(100)
  })
})

describe("calcularEficiencia — en vivo (ritmo)", () => {
  it("a las 3 h sin paradas y a ritmo perfecto: ritmo 100 %, avance 38 %", () => {
    const r = calcularEficiencia({
      turnoMin: 480,
      transcurridoMin: 180,
      minutosProgramada: 0,
      minutosOcioso: 0,
      minutosNoProgramada: 0,
      velocidadElegidaEnvasesHora: 9000,
      velocidadMaximaEnvasesHora: 9000,
      realEnvases: 27000,
      envasesPorCaja: 24,
    })
    expect(r.eficienciaPct).toBe(100)
    expect(r.avancePct).toBe(38)
    expect(r.metaEnvases).toBe(72000)
  })
  it("una programada ya registrada baja la meta y el esperado hasta ahora", () => {
    const r = calcularEficiencia({
      turnoMin: 480,
      transcurridoMin: 240,
      minutosProgramada: 60,
      minutosOcioso: 0,
      minutosNoProgramada: 0,
      velocidadElegidaEnvasesHora: 9000,
      velocidadMaximaEnvasesHora: 9000,
      realEnvases: 27000,
      envasesPorCaja: 24,
    })
    expect(r.disponibleAhoraMin).toBe(180)
    expect(r.eficienciaPct).toBe(100)
    expect(r.metaEnvases).toBe(63000)
  })
  it("sin velocidad o sin tiempo disponible no inventa porcentajes", () => {
    expect(calcularEficiencia({ ...BASE, velocidadMaximaEnvasesHora: null }).eficienciaPct).toBeNull()
    expect(calcularEficiencia({ ...BASE, minutosProgramada: 480, minutosOcioso: 0 }).eficienciaPct).toBeNull()
  })
  it("avisa si las paradas suman más que el tiempo transcurrido", () => {
    expect(calcularEficiencia({ ...BASE, transcurridoMin: 100 }).paradasExcedenTiempo).toBe(true)
    expect(calcularEficiencia(BASE).paradasExcedenTiempo).toBe(false)
  })
})

// activadaEn por defecto = inicio del turno de estos tests (TURNO_1 07:00→15:00, ver `base.ahora`),
// para que las corridas "de siempre" sigan representando una línea activa desde el arranque del turno.
const corrida = (id: string, linea: string, envasesHora: number, activa = true, presentacion = "250", activadaEn = "2026-09-21T07:00:00"): Corrida =>
  ({ id, linea, presentacion, envasesHora, activa, activadaEn }) as unknown as Corrida
const contador = (corridaId: string, envasesLlenadora: number): ContadorRegistro =>
  ({ corridaId, envasesLlenadora }) as unknown as ContadorRegistro
const parada = (lineaCodigo: string, clase: Parada["clase"], minutos: number): Parada => ({
  id: `${lineaCodigo}-${clase}-${minutos}`,
  clase,
  origen: "MANUAL",
  lineaCodigo,
  turnoTipo: "TURNO_1",
  tipoCodigo: null,
  tipoNombre: "x",
  tiempoGuiaMin: null,
  nota: null,
  justificacionDesvio: null,
  inicio: "2026-09-21T08:00:00",
  fin: `2026-09-21T${String(8 + Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}:00`,
  supervisorNombre: null,
})
const PRES = [{ codigo: "250", envasesXCaja: 24 }] as unknown as PresentacionLive[]
const velocidad = (linea: string, presentacion: string, envasesHora: number, activo = true): VelocidadLive =>
  ({ id: `${linea}-${presentacion}-${envasesHora}`, linea, presentacion, maquina: "x", envasesHora, litrosHora: 0, activo }) as unknown as VelocidadLive
// Catálogo usado por los tests de eficienciaDelTurno: máxima = elegida (9.000) para que los números
// de antes de que existiera la máxima sigan valiendo — salvo donde se prueba explícitamente lo contrario.
const VELOCIDADES = ["LINEA_1", "LINEA_2", "LINEA_3", "LINEA_T1"].map((l) => velocidad(l, "250", 9000))

describe("velocidadDeLinea", () => {
  it("promedio ponderado por los envases contados", () => {
    const cs = [corrida("a", "LINEA_1", 9000), corrida("b", "LINEA_1", 6000)]
    expect(velocidadDeLinea(cs, [contador("a", 30000), contador("b", 10000)])).toBe(8250)
  })
  it("sin contador usa la de la corrida activa", () => {
    const cs = [corrida("a", "LINEA_1", 9000, false), corrida("b", "LINEA_1", 6000, true)]
    expect(velocidadDeLinea(cs, [])).toBe(6000)
  })
})

describe("velocidadMaximaDeLinea", () => {
  it("usa el techo del catálogo, no la elegida de la corrida", () => {
    const cs = [corrida("a", "LINEA_1", 6000)]
    const velocidades = [velocidad("LINEA_1", "250", 6000), velocidad("LINEA_1", "250", 8000)]
    expect(velocidadMaximaDeLinea(cs, [contador("a", 10000)], velocidades)).toBe(8000)
  })
  it("sin opciones en el catálogo, el piso es la propia elegida", () => {
    const cs = [corrida("a", "LINEA_1", 6000)]
    expect(velocidadMaximaDeLinea(cs, [contador("a", 10000)], [])).toBe(6000)
  })
})

describe("eficienciaDelTurno", () => {
  const base = {
    turnoTipo: "TURNO_1",
    estado: "CERRADO" as const,
    horasTranscurridas: 8,
    presentaciones: PRES,
    velocidades: VELOCIDADES,
    lineas: ["LINEA_1", "LINEA_2", "LINEA_3"],
    ahora: new Date("2026-09-21T15:00:00"),
  }

  it("solo cuentan las líneas con al menos una corrida", () => {
    const r = eficienciaDelTurno({
      ...base,
      corridas: [corrida("a", "LINEA_2", 9000)],
      contadores: [contador("a", 43200)],
      paradas: [parada("LINEA_2", "PROGRAMADA", 90), parada("LINEA_2", "OCIOSO", 30), parada("LINEA_2", "NO_PROGRAMADA", 60)],
    })
    expect([...r.porLinea.keys()]).toEqual(["LINEA_2"])
    expect(r.porLinea.get("LINEA_2")?.eficienciaPct).toBe(80)
    expect(r.total?.metaCajas).toBe(2250)
    expect(r.total?.realCajas).toBe(1800)
  })

  it("una parada de otra línea no afecta", () => {
    const r = eficienciaDelTurno({
      ...base,
      corridas: [corrida("a", "LINEA_2", 9000)],
      contadores: [contador("a", 43200)],
      paradas: [parada("LINEA_1", "NO_PROGRAMADA", 300)],
    })
    expect(r.porLinea.get("LINEA_2")?.disponibilidadPct).toBe(100)
  })

  it("las líneas de Pruebas (LINEA_T#) se emparejan con las paradas por número", () => {
    const r = eficienciaDelTurno({
      ...base,
      lineas: ["LINEA_T1"],
      corridas: [corrida("a", "LINEA_T1", 9000)],
      contadores: [contador("a", 43200)],
      paradas: [parada("LINEA_1", "OCIOSO", 30)],
    })
    expect(r.porLinea.get("LINEA_T1")?.disponibleMin).toBe(450)
  })

  it("línea que arranca su primera corrida tarde, sin parada cargada para el hueco previo: el Ritmo se mide desde su propia activación, no desde el inicio del turno", () => {
    // Turno de 8 h (07:00→15:00), línea recién activada a las 13:00 (2 h antes del cierre) y
    // corriendo perfecto desde entonces — sin ninguna Parada que explique las primeras 6 h sin
    // corrida. Antes de este fix, Disponible tomaba las 8 h completas del turno y el Ritmo se
    // hundía aunque la línea nunca dejó de cumplir desde que arrancó.
    const r = eficienciaDelTurno({
      ...base,
      corridas: [corrida("a", "LINEA_1", 9000, true, "250", "2026-09-21T13:00:00")],
      contadores: [contador("a", 18000)], // exactamente 2 h a 9.000 env/h
      paradas: [],
    })
    expect(r.porLinea.get("LINEA_1")?.disponibleAhoraMin).toBe(120)
    expect(r.porLinea.get("LINEA_1")?.eficienciaPct).toBe(100)
    // La Meta (turno completo) no cambia: sigue siendo contra las 8 h del turno.
    expect(r.porLinea.get("LINEA_1")?.metaEnvases).toBe(72000)
  })

  it("línea que arranca tarde pero SÍ tiene una parada cargada para el hueco previo: no se descuenta dos veces", () => {
    // Misma línea de arriba (activa a las 13:00), pero acá el supervisor sí cargó una Parada
    // Programada de 07:00 a 13:00 explicando el hueco — el recorte por activación no debe
    // restar ESE tramo dos veces (ni contarlo tampoco: ya quedó fuera de Disponible por la propia
    // activación tardía).
    const r = eficienciaDelTurno({
      ...base,
      corridas: [corrida("a", "LINEA_1", 9000, true, "250", "2026-09-21T13:00:00")],
      contadores: [contador("a", 18000)],
      paradas: [{ ...parada("LINEA_1", "PROGRAMADA", 0), inicio: "2026-09-21T07:00:00", fin: "2026-09-21T13:00:00" }],
    })
    expect(r.porLinea.get("LINEA_1")?.disponibleAhoraMin).toBe(120)
    expect(r.porLinea.get("LINEA_1")?.eficienciaPct).toBe(100)
  })

  it("el turno 12x12 no se calcula", () => {
    const r = eficienciaDelTurno({ ...base, turnoTipo: "12X12", corridas: [corrida("a", "LINEA_1", 9000)], contadores: [], paradas: [] })
    expect(r.porLinea.size).toBe(0)
    expect(r.total).toBeNull()
  })

  it("turno abierto: usa las horas transcurridas", () => {
    const r = eficienciaDelTurno({
      ...base,
      estado: "ABIERTO",
      horasTranscurridas: 3,
      corridas: [corrida("a", "LINEA_1", 9000)],
      contadores: [contador("a", 27000)],
      paradas: [],
    })
    expect(r.porLinea.get("LINEA_1")?.eficienciaPct).toBe(100)
    expect(r.porLinea.get("LINEA_1")?.avancePct).toBe(38)
  })

  it("elegida 6.000 con máxima 8.000 en el catálogo: avance al 100 % pero eficiencia (OEE) al 75 %", () => {
    const r = eficienciaDelTurno({
      ...base,
      corridas: [corrida("a", "LINEA_1", 6000)],
      contadores: [contador("a", 48000)], // exactamente la meta a 6.000 env/h × 8 h
      velocidades: [velocidad("LINEA_1", "250", 6000), velocidad("LINEA_1", "250", 8000)],
      paradas: [],
    })
    expect(r.porLinea.get("LINEA_1")?.avancePct).toBe(100)
    expect(r.porLinea.get("LINEA_1")?.eficienciaPct).toBe(75)
  })
})
