import { duracionMin, type ClaseParada, type Parada } from "@/lib/paradas"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"

/*
 * Meta y eficiencia de línea con paradas — plan-eficiencia-meta.md.
 * Es el ÚNICO lugar donde se calculan: el Panel de Producción y el Acta usan
 * estas funciones, así los números coinciden entre pantallas.
 *
 * Idea (dueño): la base es siempre la duración completa del turno. Las paradas
 * PROGRAMADAS y el TIEMPO OCIOSO reducen el tiempo disponible (no castigan);
 * las NO PROGRAMADAS son lo que hace perder eficiencia. La velocidad es la
 * ELEGIDA (nunca la máxima del catálogo). Se calcula por línea y turno, en
 * general (no por corrida): las paradas no se ligan a una corrida.
 *
 *   Disponible = Turno − Programadas − Ocioso
 *   Meta       = velocidad × Disponible
 *   Ritmo      = Real ÷ (velocidad × Disponible hasta ahora)     (eficiencia en vivo)
 *   Avance     = Real ÷ Meta del turno
 *
 * Al cierre del turno, «hasta ahora» es el turno completo y Ritmo = Real ÷ Meta.
 */

/** Duración base de cada turno, en minutos (dueño, 2026-09-21). El 12x12 queda fuera hasta su rework. */
const DURACION_TURNO_MIN: Record<string, number> = { TURNO_1: 8 * 60, TURNO_2: 7.5 * 60, TURNO_3: 8.5 * 60 }

/** Minutos base del turno, o null si el tipo no tiene base (12x12 o desconocido). */
export function duracionBaseTurnoMin(turnoTipo: string | null | undefined): number | null {
  return turnoTipo ? (DURACION_TURNO_MIN[turnoTipo] ?? null) : null
}

const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

export interface EntradaEficiencia {
  /** Duración base del turno. */
  turnoMin: number
  /** Minutos del turno transcurridos hasta ahora (= turnoMin si el turno ya cerró). */
  transcurridoMin: number
  minutosProgramada: number
  minutosOcioso: number
  minutosNoProgramada: number
  /** Velocidad elegida (envases/h) de la línea. null = sin dato. */
  velocidadEnvasesHora: number | null
  /** Envases contados por la llenadora en el turno. */
  realEnvases: number
  /** Envases por caja de la presentación (para mostrar cajas). null = sin dato. */
  envasesPorCaja: number | null
}

export interface ResultadoEficiencia {
  /** Turno − Programadas − Ocioso (turno completo, ajustado por lo registrado hasta ahora). */
  disponibleMin: number
  /** Disponible − No programadas. */
  operativoMin: number
  /** Disponible hasta ahora (para el ritmo en vivo). */
  disponibleAhoraMin: number
  operativoAhoraMin: number
  metaEnvases: number
  metaCajas: number | null
  /** Lo que debía llevar hasta ahora: velocidad × disponible hasta ahora. */
  esperadoAhoraEnvases: number
  realEnvases: number
  realCajas: number | null
  /** Real ÷ Meta del turno (0–100+). null si no hay meta. */
  avancePct: number | null
  /** Ritmo: Real ÷ (velocidad × disponible hasta ahora). Es la eficiencia en vivo. null si no se puede calcular. */
  eficienciaPct: number | null
  /** Operativo ÷ Disponible, hasta ahora. */
  disponibilidadPct: number | null
  /** Real ÷ (velocidad × operativo hasta ahora). */
  rendimientoPct: number | null
  /** Las paradas registradas suman más que el tiempo transcurrido: hay algo mal cargado. */
  paradasExcedenTiempo: boolean
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

export function calcularEficiencia(e: EntradaEficiencia): ResultadoEficiencia {
  const v = e.velocidadEnvasesHora && e.velocidadEnvasesHora > 0 ? e.velocidadEnvasesHora : null
  const transcurrido = Math.max(0, Math.min(e.turnoMin, e.transcurridoMin))
  const programadaYocioso = e.minutosProgramada + e.minutosOcioso

  const disponibleMin = Math.max(0, e.turnoMin - programadaYocioso)
  const operativoMin = Math.max(0, disponibleMin - e.minutosNoProgramada)
  const disponibleAhoraMin = Math.max(0, transcurrido - programadaYocioso)
  const operativoAhoraMin = Math.max(0, disponibleAhoraMin - e.minutosNoProgramada)

  const metaEnvases = v ? Math.round((v * disponibleMin) / 60) : 0
  const esperadoAhora = v ? (v * disponibleAhoraMin) / 60 : 0
  const rendimientoBase = v ? (v * operativoAhoraMin) / 60 : 0

  return {
    disponibleMin,
    operativoMin,
    disponibleAhoraMin,
    operativoAhoraMin,
    metaEnvases,
    metaCajas: e.envasesPorCaja && e.envasesPorCaja > 0 ? Math.round(metaEnvases / e.envasesPorCaja) : null,
    esperadoAhoraEnvases: esperadoAhora,
    realEnvases: e.realEnvases,
    realCajas: e.envasesPorCaja && e.envasesPorCaja > 0 ? Math.round(e.realEnvases / e.envasesPorCaja) : null,
    avancePct: pct(e.realEnvases, metaEnvases),
    eficienciaPct: pct(e.realEnvases, esperadoAhora),
    disponibilidadPct: pct(operativoAhoraMin, disponibleAhoraMin),
    rendimientoPct: pct(e.realEnvases, rendimientoBase),
    paradasExcedenTiempo: programadaYocioso + e.minutosNoProgramada > transcurrido + 1,
  }
}

/** Velocidad de la línea: promedio de las velocidades de sus corridas ponderado por los envases contados (la de la corrida activa, o la última, si aún no hay contador). */
export function velocidadDeLinea(corridasLinea: Corrida[], contadores: ContadorRegistro[]): number | null {
  if (corridasLinea.length === 0) return null
  const envasesDe = (c: Corrida) =>
    contadores.filter((k) => k.corridaId === c.id).reduce((a, k) => a + k.envasesLlenadora, 0)
  const pesos = corridasLinea.map((c) => ({ c, envases: envasesDe(c) }))
  const total = pesos.reduce((a, p) => a + p.envases, 0)
  if (total > 0) return pesos.reduce((a, p) => a + p.c.envasesHora * p.envases, 0) / total
  const referencia = corridasLinea.find((c) => c.activa) ?? corridasLinea[corridasLinea.length - 1]
  return referencia.envasesHora
}

export interface EntradaTurno {
  turnoTipo: string
  estado: "ABIERTO" | "CERRADO"
  /** Horas transcurridas desde el inicio del turno (solo importa con el turno abierto). */
  horasTranscurridas: number
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  presentaciones: PresentacionLive[]
  /** Paradas del turno: manuales y de Mantenimiento ya recortadas a su ventana. */
  paradas: Parada[]
  /** Códigos de línea (los del catálogo, LINEA_1… o LINEA_T1…). */
  lineas: string[]
  ahora?: Date
}

export interface EficienciaTurno {
  porLinea: Map<string, ResultadoEficiencia>
  /** Suma de todas las líneas que cuentan. null si el turno no tiene base (12x12) o ninguna línea cuenta. */
  total: ResultadoEficiencia | null
}

/**
 * Meta y eficiencia de cada línea del turno. Solo cuentan las líneas con al menos
 * una corrida en el turno («sin programación no cuenta nada»). Sin base de turno
 * (12x12) devuelve todo vacío.
 */
export function eficienciaDelTurno(t: EntradaTurno): EficienciaTurno {
  const vacio: EficienciaTurno = { porLinea: new Map(), total: null }
  const turnoMin = duracionBaseTurnoMin(t.turnoTipo)
  if (turnoMin === null) return vacio

  const transcurridoMin = t.estado === "CERRADO" ? turnoMin : t.horasTranscurridas * 60
  const ahora = t.ahora ?? new Date()
  const porLinea = new Map<string, ResultadoEficiencia>()
  const acumulado = { real: 0, meta: 0, esperado: 0, metaCajas: 0, realCajas: 0, disponibleAhora: 0, operativoAhora: 0, cajasConocidas: true, excede: false }

  for (const codigo of t.lineas) {
    const corridasLinea = t.corridas.filter((c) => c.linea === codigo)
    if (corridasLinea.length === 0) continue

    const minutos: Record<ClaseParada, number> = { PROGRAMADA: 0, NO_PROGRAMADA: 0, OCIOSO: 0 }
    for (const p of t.paradas) {
      if (numeroLinea(p.lineaCodigo) === numeroLinea(codigo)) minutos[p.clase] += duracionMin(p, ahora)
    }

    const ids = new Set(corridasLinea.map((c) => c.id))
    const conteo = t.contadores.filter((k) => k.corridaId !== null && ids.has(k.corridaId))
    const realEnvases = conteo.reduce((a, k) => a + k.envasesLlenadora, 0)

    // Envases por caja: total de envases ÷ total de cajas de sus corridas; sin contador, el de la corrida de referencia.
    let cajas = 0
    for (const c of corridasLinea) {
      const exc = t.presentaciones.find((p) => p.codigo === c.presentacion)?.envasesXCaja ?? 0
      const env = conteo.filter((k) => k.corridaId === c.id).reduce((a, k) => a + k.envasesLlenadora, 0)
      if (exc > 0) cajas += env / exc
    }
    const referencia = corridasLinea.find((c) => c.activa) ?? corridasLinea[corridasLinea.length - 1]
    const excReferencia = t.presentaciones.find((p) => p.codigo === referencia.presentacion)?.envasesXCaja ?? null
    const envasesPorCaja = realEnvases > 0 && cajas > 0 ? realEnvases / cajas : excReferencia

    const r = calcularEficiencia({
      turnoMin,
      transcurridoMin,
      minutosProgramada: minutos.PROGRAMADA,
      minutosOcioso: minutos.OCIOSO,
      minutosNoProgramada: minutos.NO_PROGRAMADA,
      velocidadEnvasesHora: velocidadDeLinea(corridasLinea, t.contadores),
      realEnvases,
      envasesPorCaja,
    })
    porLinea.set(codigo, r)

    acumulado.real += r.realEnvases
    acumulado.meta += r.metaEnvases
    acumulado.disponibleAhora += r.disponibleAhoraMin
    acumulado.operativoAhora += r.operativoAhoraMin
    acumulado.excede = acumulado.excede || r.paradasExcedenTiempo
    if (r.metaCajas === null || r.realCajas === null) acumulado.cajasConocidas = false
    else {
      acumulado.metaCajas += r.metaCajas
      acumulado.realCajas += r.realCajas
    }
    acumulado.esperado += r.esperadoAhoraEnvases
  }

  if (porLinea.size === 0) return vacio
  const total: ResultadoEficiencia = {
    disponibleMin: 0,
    operativoMin: 0,
    disponibleAhoraMin: acumulado.disponibleAhora,
    operativoAhoraMin: acumulado.operativoAhora,
    metaEnvases: acumulado.meta,
    metaCajas: acumulado.cajasConocidas ? acumulado.metaCajas : null,
    esperadoAhoraEnvases: acumulado.esperado,
    realEnvases: acumulado.real,
    realCajas: acumulado.cajasConocidas ? acumulado.realCajas : null,
    avancePct: pct(acumulado.real, acumulado.meta),
    eficienciaPct: pct(acumulado.real, acumulado.esperado),
    disponibilidadPct: pct(acumulado.operativoAhora, acumulado.disponibleAhora),
    rendimientoPct: null,
    paradasExcedenTiempo: acumulado.excede,
  }
  return { porLinea, total }
}
