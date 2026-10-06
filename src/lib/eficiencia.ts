import { minutosPorClaseSinSolape, type Parada } from "@/lib/paradas"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import { tramoT2 } from "@/lib/turno12x12"

/*
 * Meta y eficiencia de línea con paradas — plan-eficiencia-meta.md.
 * Es el ÚNICO lugar donde se calculan: el Panel de Producción y el Acta usan
 * estas funciones, así los números coinciden entre pantallas.
 *
 * Idea (dueña, 2026-09-22 — corrige la de 2026-09-21): la base es siempre la
 * duración completa del turno. Las paradas PROGRAMADAS y el TIEMPO OCIOSO
 * reducen el tiempo disponible (no castigan); las NO PROGRAMADAS son lo que
 * hace perder eficiencia. La Meta usa la velocidad ELEGIDA (el compromiso del
 * supervisor al activar la línea).
 *
 * Eficiencia (dueña, 2026-10-06): es de TIEMPO, no de envases. Arranca en
 * 100 % y baja solo con las no programadas que se van cargando; el tiempo
 * que nadie explicó no castiga. Ej.: T1 480 min, 30 de Descanso y 45 de una
 * falla → (450 − 45) ÷ 450 = 90 %.
 *
 * El OEE (Disponibilidad × Rendimiento, contra la velocidad MÁXIMA del
 * catálogo) sigue aparte para el Panel de Paradas (oeeDePeriodo). Calidad = 1.
 * Se calcula por línea y turno, en general (no por corrida): las paradas no
 * se ligan a una corrida.
 *
 *   Disponible      = Turno − Programadas − Ocioso
 *   Operativo       = Disponible − No programadas
 *   Eficiencia      = Operativo ÷ Disponible (turno completo, con lo cargado hasta ahora)
 *   Meta            = velocidad ELEGIDA × Disponible
 *   Avance          = Real ÷ Meta del turno
 *   Disponibilidad  = Operativo ÷ Disponible, hasta ahora (OEE)
 *   Rendimiento     = Real ÷ (velocidad MÁXIMA × Operativo hasta ahora) (OEE)
 */

/** Duración base de cada turno, en minutos (dueño, 2026-09-21; el 12x12 = 12 h, dueño 2026-09-28). */
const DURACION_TURNO_MIN: Record<string, number> = { TURNO_1: 8 * 60, TURNO_2: 7.5 * 60, TURNO_3: 8.5 * 60, "12X12": 12 * 60 }

/**
 * Minutos base del turno, o null si el tipo es desconocido. En 12x12 el T2 se
 * parte a las 19:00 (src/lib/turno12x12.ts): el del día dura 4 h y el de la noche 3,5 h.
 */
export function duracionBaseTurnoMin(
  turnoTipo: string | null | undefined,
  turno?: { esquema?: string | null; horaInicio?: string | null },
): number | null {
  const tramo = tramoT2(turno?.esquema, turnoTipo, turno?.horaInicio)
  if (tramo) return tramo.minutos
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
  /** Velocidad ELEGIDA (envases/h) — la base de la Meta, el compromiso del supervisor. null = sin dato. */
  velocidadElegidaEnvasesHora: number | null
  /** Velocidad MÁXIMA del catálogo (envases/h) — la base del OEE (Rendimiento y Eficiencia), nunca la elegida. null = sin dato. */
  velocidadMaximaEnvasesHora: number | null
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
  /** Lo que debía llevar hasta ahora contra el techo del catálogo: velocidad MÁXIMA × disponible hasta ahora. */
  esperadoAhoraEnvases: number
  realEnvases: number
  realCajas: number | null
  /** Real ÷ Meta del turno (velocidad ELEGIDA), 0–100+. null si no hay meta. */
  avancePct: number | null
  /** Eficiencia de tiempo: Operativo ÷ Disponible del turno completo. 100 % sin no programadas. null sin tiempo disponible. */
  eficienciaPct: number | null
  /** Disponibilidad (OEE): Operativo ÷ Disponible, hasta ahora. */
  disponibilidadPct: number | null
  /** Rendimiento (OEE): Real ÷ (velocidad MÁXIMA × operativo hasta ahora). */
  rendimientoPct: number | null
  /** Las paradas registradas suman más que el tiempo transcurrido: hay algo mal cargado. */
  paradasExcedenTiempo: boolean
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

export function calcularEficiencia(e: EntradaEficiencia): ResultadoEficiencia {
  const vElegida = e.velocidadElegidaEnvasesHora && e.velocidadElegidaEnvasesHora > 0 ? e.velocidadElegidaEnvasesHora : null
  const vMaxima = e.velocidadMaximaEnvasesHora && e.velocidadMaximaEnvasesHora > 0 ? e.velocidadMaximaEnvasesHora : null
  const transcurrido = Math.max(0, Math.min(e.turnoMin, e.transcurridoMin))
  const programadaYocioso = e.minutosProgramada + e.minutosOcioso

  const disponibleMin = Math.max(0, e.turnoMin - programadaYocioso)
  const operativoMin = Math.max(0, disponibleMin - e.minutosNoProgramada)
  const disponibleAhoraMin = Math.max(0, transcurrido - programadaYocioso)
  const operativoAhoraMin = Math.max(0, disponibleAhoraMin - e.minutosNoProgramada)

  const metaEnvases = vElegida ? Math.round((vElegida * disponibleMin) / 60) : 0
  const esperadoAhora = vMaxima ? (vMaxima * disponibleAhoraMin) / 60 : 0
  const rendimientoBase = vMaxima ? (vMaxima * operativoAhoraMin) / 60 : 0

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
    eficienciaPct: pct(operativoMin, disponibleMin),
    disponibilidadPct: pct(operativoAhoraMin, disponibleAhoraMin),
    rendimientoPct: pct(e.realEnvases, rendimientoBase),
    paradasExcedenTiempo: programadaYocioso + e.minutosNoProgramada > transcurrido + 1,
  }
}

/** Promedio de una velocidad por corrida, ponderado por los envases contados de cada una (la corrida activa, o la última, si aún no hay contador). */
function velocidadPonderada(corridasLinea: Corrida[], contadores: ContadorRegistro[], velocidadDe: (c: Corrida) => number): number | null {
  if (corridasLinea.length === 0) return null
  const envasesDe = (c: Corrida) =>
    contadores.filter((k) => k.corridaId === c.id).reduce((a, k) => a + k.envasesLlenadora, 0)
  const pesos = corridasLinea.map((c) => ({ c, envases: envasesDe(c) }))
  const total = pesos.reduce((a, p) => a + p.envases, 0)
  if (total > 0) return pesos.reduce((a, p) => a + velocidadDe(p.c) * p.envases, 0) / total
  const referencia = corridasLinea.find((c) => c.activa) ?? corridasLinea[corridasLinea.length - 1]
  return velocidadDe(referencia)
}

/** Velocidad ELEGIDA de la línea (la de cada corrida) — la base de la Meta. */
export function velocidadDeLinea(corridasLinea: Corrida[], contadores: ContadorRegistro[]): number | null {
  return velocidadPonderada(corridasLinea, contadores, (c) => c.envasesHora)
}

/**
 * Velocidad MÁXIMA del catálogo para la línea y presentación de cada corrida — la base del
 * OEE (Disponibilidad × Rendimiento), nunca la elegida. Si el catálogo no trae opciones para
 * esa línea/presentación (cambió después de activar), el piso es la propia velocidad elegida.
 */
export function velocidadMaximaDeLinea(corridasLinea: Corrida[], contadores: ContadorRegistro[], velocidades: VelocidadLive[]): number | null {
  return velocidadPonderada(corridasLinea, contadores, (c) => {
    const opciones = velocidades.filter((v) => v.activo && v.linea === c.linea && v.presentacion === c.presentacion).map((v) => v.envasesHora)
    return opciones.length > 0 ? Math.max(...opciones, c.envasesHora) : c.envasesHora
  })
}

export interface EntradaTurno {
  turnoTipo: string
  /** Con horaInicio, distingue el T2 del día y el de la noche en 12x12. */
  esquema?: string | null
  horaInicio?: string | null
  estado: "ABIERTO" | "CERRADO"
  /** Horas transcurridas desde el inicio del turno (solo importa con el turno abierto). */
  horasTranscurridas: number
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  presentaciones: PresentacionLive[]
  /** Catálogo de velocidades — de acá sale la velocidad MÁXIMA del OEE (por línea y presentación). */
  velocidades: VelocidadLive[]
  /** Paradas del turno: manuales y de Mantenimiento ya recortadas a su ventana. */
  paradas: Parada[]
  /** Códigos de línea (los del catálogo, LINEA_1… o LINEA_T1…). */
  lineas: string[]
  ahora?: Date
}

export interface EficienciaTurno {
  porLinea: Map<string, ResultadoEficiencia>
  /** Suma de todas las líneas que cuentan. null si el turno no tiene base (tipo desconocido) o ninguna línea cuenta. */
  total: ResultadoEficiencia | null
}

/**
 * Meta y eficiencia de cada línea del turno. Solo cuentan las líneas con al menos
 * una corrida en el turno («sin programación no cuenta nada»). Sin base de turno
 * (tipo desconocido) devuelve todo vacío.
 */
export function eficienciaDelTurno(t: EntradaTurno): EficienciaTurno {
  const vacio: EficienciaTurno = { porLinea: new Map(), total: null }
  const turnoMin = duracionBaseTurnoMin(t.turnoTipo, t)
  if (turnoMin === null) return vacio

  const transcurridoMin = t.estado === "CERRADO" ? turnoMin : t.horasTranscurridas * 60
  const ahora = t.ahora ?? new Date()
  const porLinea = new Map<string, ResultadoEficiencia>()
  const acumulado = { real: 0, meta: 0, esperado: 0, metaCajas: 0, realCajas: 0, disponible: 0, operativo: 0, disponibleAhora: 0, operativoAhora: 0, cajasConocidas: true, excede: false }

  for (const codigo of t.lineas) {
    const corridasLinea = t.corridas.filter((c) => c.linea === codigo)
    if (corridasLinea.length === 0) continue

    /*
     * La línea puede haber arrancado su primera corrida del turno bien
     * entrada la jornada (activación tardía, cambio de presentación
     * largo, etc.). Si nadie cargó una Parada para ese hueco previo, no
     * debe contarse como Disponible perdido de esta línea — el Ritmo
     * caía a ~8% en líneas recién activadas por castigar un hueco que
     * nadie tuvo que explicar. Disponible/Operativo "hasta ahora" de
     * esta línea arrancan en su propia primera activación, nunca antes
     * (decisión 2026-09-25). El turno completo (Meta, Avance) sigue
     * igual: eso mide el compromiso del turno entero, no cambia acá.
     */
    const activacionesMs = corridasLinea.map((c) => new Date(c.activadaEn).getTime()).filter((ms) => !Number.isNaN(ms))
    // activadaEn inválido/ausente en las 3 corridas: no se puede saber cuándo arrancó, se sigue midiendo desde el inicio del turno (comportamiento de antes).
    const primeraActivacionMs = activacionesMs.length > 0 ? Math.min(...activacionesMs) : -Infinity
    const minutosDesdeActivacion = Math.max(0, Math.round((ahora.getTime() - primeraActivacionMs) / 60000))
    const transcurridoLineaMin = Math.min(transcurridoMin, minutosDesdeActivacion)

    // Sin solape: si supervisor y Mantenimiento registran la misma falla, cuenta una vez.
    const minutos = minutosPorClaseSinSolape(
      t.paradas.filter((p) => numeroLinea(p.lineaCodigo) === numeroLinea(codigo)),
      ahora,
      primeraActivacionMs,
    )

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
      transcurridoMin: transcurridoLineaMin,
      minutosProgramada: minutos.PROGRAMADA,
      minutosOcioso: minutos.OCIOSO,
      minutosNoProgramada: minutos.NO_PROGRAMADA,
      velocidadElegidaEnvasesHora: velocidadDeLinea(corridasLinea, t.contadores),
      velocidadMaximaEnvasesHora: velocidadMaximaDeLinea(corridasLinea, t.contadores, t.velocidades),
      realEnvases,
      envasesPorCaja,
    })
    porLinea.set(codigo, r)

    acumulado.real += r.realEnvases
    acumulado.meta += r.metaEnvases
    acumulado.disponible += r.disponibleMin
    acumulado.operativo += r.operativoMin
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
    disponibleMin: acumulado.disponible,
    operativoMin: acumulado.operativo,
    disponibleAhoraMin: acumulado.disponibleAhora,
    operativoAhoraMin: acumulado.operativoAhora,
    metaEnvases: acumulado.meta,
    metaCajas: acumulado.cajasConocidas ? acumulado.metaCajas : null,
    esperadoAhoraEnvases: acumulado.esperado,
    realEnvases: acumulado.real,
    realCajas: acumulado.cajasConocidas ? acumulado.realCajas : null,
    avancePct: pct(acumulado.real, acumulado.meta),
    eficienciaPct: pct(acumulado.operativo, acumulado.disponible),
    disponibilidadPct: pct(acumulado.operativoAhora, acumulado.disponibleAhora),
    rendimientoPct: null,
    paradasExcedenTiempo: acumulado.excede,
  }
  return { porLinea, total }
}

/** OEE de una línea en un PERÍODO (varios turnos) — Panel de Paradas. */
export interface OeePeriodo {
  /** Disponibilidad × Rendimiento (Calidad = 1). null si no hubo producción que medir. */
  oeePct: number | null
  disponibilidadPct: number | null
  rendimientoPct: number | null
  /** Cuántos turnos con esa línea en producción entraron en el cálculo. */
  turnos: number
}

/**
 * Junta el resultado de eficienciaDelTurno() de UNA línea en varios turnos.
 * No promedia porcentajes (un turno corto pesaría igual que uno largo):
 * suma envases reales, envases esperados y minutos, y recién ahí divide —
 * igual que el `total` de eficienciaDelTurno() suma las líneas.
 *   OEE            = Σ Real ÷ Σ (velocidad MÁXIMA × Disponible)
 *   Disponibilidad = Σ Operativo ÷ Σ Disponible
 *   Rendimiento    = Σ Real ÷ Σ (velocidad MÁXIMA × Operativo)
 */
export function oeeDePeriodo(resultados: ResultadoEficiencia[]): OeePeriodo {
  let real = 0
  let esperado = 0
  let baseRendimiento = 0
  let disponible = 0
  let operativo = 0
  for (const r of resultados) {
    real += r.realEnvases
    esperado += r.esperadoAhoraEnvases
    disponible += r.disponibleAhoraMin
    operativo += r.operativoAhoraMin
    // velocidad MÁXIMA × Operativo = esperado × (Operativo ÷ Disponible) — el esperado ya trae la velocidad de ese turno
    if (r.disponibleAhoraMin > 0) baseRendimiento += (r.esperadoAhoraEnvases * r.operativoAhoraMin) / r.disponibleAhoraMin
  }
  return {
    oeePct: pct(real, esperado),
    disponibilidadPct: pct(operativo, disponible),
    rendimientoPct: pct(real, baseRendimiento),
    turnos: resultados.length,
  }
}
