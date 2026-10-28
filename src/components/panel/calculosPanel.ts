import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import type { EficienciaTurno } from "@/lib/eficiencia"
import { duracionMin, minutosPorLinea, type Parada } from "@/lib/paradas"
import { paradaEnVivo, type ParadaEnVivo } from "@/lib/paradasEnVivo"
import type { ProduccionDiaItem } from "@/lib/panelProduccion"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida, LineaEstado } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { ProgramacionItem as PlanDiaItem } from "@/lib/programacion"
import { mermaLineaTurno } from "@/lib/reportes"

/*
 * Cuentas del Panel de Producción — funciones puras, sin React. La meta y
 * la eficiencia (OEE) NO se calculan acá: salen de eficienciaDelTurno()
 * (src/lib/eficiencia.ts, único lugar donde se calculan); las mermas, de
 * src/lib/reportes.
 */

/** La merma de semielaborado tiene su propia tolerancia, más estricta que la de envases — amarillo/rojo proporcionales a ese máximo, en vez de los umbrales fijos (3%/5%) de la merma de envase. */
export const MERMA_SEMIELABORADO_MAX = 1.5
export const MERMA_SEMIELABORADO_WARN = (MERMA_SEMIELABORADO_MAX * 2) / 3

/** En el Panel la merma de envase tolera hasta 3% (rojo pasado eso, desde 3,01%); amarillo pasado 2,5%. */
export const MERMA_ENVASE_PANEL_MAX = 3
export const MERMA_ENVASE_PANEL_WARN = 2.5

export const HORARIOS: Record<string, { inicio: string; fin: string }> = {
  TURNO_1: { inicio: "07:00", fin: "15:00" },
  TURNO_2: { inicio: "15:00", fin: "22:30" },
  TURNO_3: { inicio: "22:30", fin: "07:00" },
  "12X12": { inicio: "07:00", fin: "19:00" },
}

export type EstadoLinea =
  | "activa"
  | "parada"
  | "esperando_cierre"
  | "cambio_presentacion"
  | "cip"
  | "sin_programacion"
  | "detenida"
  | "libre"

export interface LineaConEstado {
  codigo: string
  nombre: string
  estado: EstadoLinea
  corrida: Corrida | null
  /** Falla u observación cargada al dejar la línea en DETENIDA — solo cuando aplica. null si no hay. */
  observacion: string | null
  /** Parada abierta ahora mismo (solo en vivo, ver aplicarParadasEnVivo). */
  paradaEnVivo?: ParadaEnVivo | null
}

/** Fila de la tabla "Líneas activas": estado + producción + merma, todo junto. */
export interface FilaLineaCompacta extends LineaConEstado {
  cajas: number
  litros: number
  eficienciaPct: number | null
  mermaPct: number | null
  /** Suma de los minutos de TODAS las paradas registradas de esta línea en el turno (Módulo Paradas) — null si no tiene ninguna. */
  minutosParada: number | null
  /** Total de la parada completa (todos los turnos), solo si alguna empezó en un turno anterior: va en el title de «Tiempo de parada». */
  minutosParadaTotal: number | null
  /**
   * TP = Tiempo de Producción del turno (dueña, 2026-10-28): desde que
   * arrancó la corrida o desde que empezó el turno (lo último), menos lo
   * que la línea estuvo parada en ese lapso. null si no hay corrida activa
   * ahora mismo. Antes era el reloj desde que arrancó la corrida, sin
   * restar paradas y cruzando turnos (salía «11 h» en una línea parada).
   */
  minutosProduccion: number | null
}

export interface ProduccionLinea {
  linea: string
  cajas: number
  litros: number
}

/** Renglón del carrusel "Programación diaria". */
export interface ProgramacionItem {
  sabor: string
  /** Presentación en ml — null si es un sabor producido sin presentación identificable. */
  presentacionMl: number | null
  /** Cajas ya producidas (real). */
  hecho: number
  /** Objetivo del día en cajas — null si se produjo un sabor+presentación que no estaba en el plan. */
  plan: number | null
}

/** "125 min" hasta la hora, "2h 5min" de ahí para arriba. */
export function formatDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`
}

/** "hace Ns" / "hace N min" / "hace N h", mismo criterio que la "Última actualización" del banner. */
export function tiempoRelativo(fechaIso: string, ahora: Date): string {
  const segundos = Math.max(0, Math.round((ahora.getTime() - new Date(fechaIso).getTime()) / 1000))
  if (segundos < 60) return `hace ${segundos}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  return `hace ${Math.floor(minutos / 60)} h`
}

/**
 * "Última actualización" real: el máximo de todos los timestamps que
 * ya traen los 3 módulos de dominio (corridas, tanques, contadores,
 * producto terminado, preparaciones) — NO cuándo esta pantalla hizo el
 * último fetch. Así no se resetea a "hace 0s" cada vez que se entra o
 * se cambia de pantalla y se vuelve; solo se mueve cuando alguien
 * realmente cargó algo.
 */
export function ultimaAccionDeTurno(
  corridas: Corrida[],
  tanques: TanqueRecepcion[],
  contadores: ContadorRegistro[],
  productoTerminado: ProductoTerminadoRegistro[],
  preparaciones: PreparacionRegistro[],
): Date | null {
  const timestamps = [
    ...corridas.map((l) => l.activadaEn),
    ...tanques.map((t) => t.activadaEn),
    ...contadores.map((c) => c.creadoEn),
    ...productoTerminado.map((p) => p.creadoEn),
    ...preparaciones.map((p) => p.creadoEn),
  ].filter((t): t is string => Boolean(t))

  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps.map((t) => new Date(t).getTime())))
}

/** "hace 12s" / "hace 3 min" desde la última acción, o null si no hubo ninguna. */
export function textoUltimaActualizacion(ultimaAccion: Date | null, ahora: Date): string | null {
  if (!ultimaAccion) return null
  const segundos = Math.max(0, Math.round((ahora.getTime() - ultimaAccion.getTime()) / 1000))
  return segundos < 60 ? `hace ${segundos}s` : `hace ${Math.floor(segundos / 60)} min`
}

/** Condición continua de la línea (sin corrida) → estado del Panel. */
const ESTADO_POR_CONDICION: Partial<Record<LineaEstado["condicion"], EstadoLinea>> = {
  CAMBIO_PRESENTACION: "cambio_presentacion",
  CIP: "cip",
  SIN_PROGRAMACION: "sin_programacion",
  DETENIDA: "detenida",
  // LISTA (o sin registro) → "libre".
}

/** Una fila por línea del área (catálogo completo), cruzada con la corrida actual/últimamente tocada de las corridas del módulo Producción. */
export function estadoDeLineas(corridas: Corrida[], lineasEstado: LineaEstado[], lineasCatalogo: LineaLive[]): LineaConEstado[] {
  return lineasCatalogo.map((lc) => {
    const corridasLinea = corridas.filter((l) => l.linea === lc.codigo)
    const estadoContinuo = lineasEstado.find((e) => e.linea === lc.codigo)
    // La nota se muestra con la línea Detenida o en CIP (motivo + descripción del supervisor, migración 20261091).
    const observacion =
      estadoContinuo?.condicion === "DETENIDA" || estadoContinuo?.condicion === "CIP" ? estadoContinuo.observacion : null

    const activa = corridasLinea.find((l) => l.activa)
    if (activa) {
      // Pausada por un CIP en el que el lote sigue: se ve "En CIP", con su motivo.
      const enCip = activa.pausadaEn && estadoContinuo?.condicion === "CIP"
      return {
        codigo: lc.codigo,
        nombre: lc.nombre,
        estado: enCip ? "cip" : activa.pausadaEn ? "parada" : "activa",
        corrida: activa,
        observacion: enCip ? observacion : null,
      }
    }
    const esperandoCierre = corridasLinea.find((l) => l.esperandoCierre)
    if (esperandoCierre) {
      return { codigo: lc.codigo, nombre: lc.nombre, estado: "esperando_cierre", corrida: esperandoCierre, observacion }
    }
    // Sin corrida: el Panel refleja la condición continua de la línea
    // (Cambio de Presentación / CIP / Sin programación / Detenida), no
    // solo "Libre" para todas. Ver LineasEstadoPlanta.tsx.
    const estado: EstadoLinea = (estadoContinuo && ESTADO_POR_CONDICION[estadoContinuo.condicion]) ?? "libre"
    return { codigo: lc.codigo, nombre: lc.nombre, estado, corrida: null, observacion }
  })
}

/**
 * Panel en vivo: las paradas abiertas cambian el estado de la línea (ver
 * src/lib/paradasEnVivo.ts). Con más de 15 min, una línea con corrida se ve
 * "parada" y una sin corrida "detenida"; antes del margen sigue como
 * estaba (la corrida pausada desde Líneas vuelve a verse "activa"), con el
 * aviso en `paradaEnVivo`. CIP y "esperando cierre" no cambian.
 */
export function aplicarParadasEnVivo(lineas: LineaConEstado[], abiertas: Parada[], ahora: Date, desdeTurno: Date | null = null): LineaConEstado[] {
  return lineas.map((le) => {
    if (le.estado === "cip" || le.estado === "esperando_cierre") return le
    const conCorrida = le.estado === "activa" || le.estado === "parada"
    const parada = paradaEnVivo(le.codigo, abiertas, conCorrida ? (le.corrida?.pausadaEn ?? null) : null, ahora, desdeTurno)
    if (conCorrida) return { ...le, estado: parada?.visible ? "parada" : "activa", paradaEnVivo: parada }
    return { ...le, estado: parada?.visible ? "detenida" : le.estado, paradaEnVivo: parada }
  })
}

/**
 * Cajas y litros de CADA línea del catálogo. La eficiencia (OEE) de cada
 * línea NO sale de acá — sale de `eficienciaDelTurno()`.
 */
export function produccionPorLineaDe(
  productoTerminado: ProductoTerminadoRegistro[],
  lineasCatalogo: LineaLive[],
  presentaciones: PresentacionLive[],
): ProduccionLinea[] {
  return lineasCatalogo.map((lc) => {
    const productoLinea = productoTerminado.filter((p) => p.linea === lc.codigo)
    const cajas = productoLinea.reduce((a, p) => {
      const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
      return a + p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas
    }, 0)
    const litros = productoLinea.reduce((a, p) => a + p.litrosProducidos, 0)

    return { linea: lc.codigo, cajas, litros }
  })
}

/**
 * Programación diaria: el carrusel del banner cruza el PLAN del día
 * (módulo Programación, por sabor y en cajas) con lo HECHO. Primero van
 * los sabores del plan; después, cualquier sabor producido que no estaba
 * planificado (plan = null).
 *
 * Lo hecho se cuenta por (sabor + presentación en ml). En vivo se toma el
 * acumulado de la jornada (produccion_dia_de, ya agrupado por sabor+ml);
 * si no, el Producto Terminado del turno cargado — que trae la
 * presentación como string de volumen_ml en p.presentacion.
 */
export function programacionDelDia(
  planDia: PlanDiaItem[],
  produccionDia: ProduccionDiaItem[],
  usarDiario: boolean,
  productoTerminado: ProductoTerminadoRegistro[],
  presentaciones: PresentacionLive[],
): ProgramacionItem[] {
  const hecho = new Map<string, number>()
  const claveDe = (sabor: string, ml: number | null) => `${sabor}|${ml ?? ""}`
  if (usarDiario) {
    for (const p of produccionDia) {
      const k = claveDe(p.saborNombre, p.presentacionMl)
      hecho.set(k, (hecho.get(k) ?? 0) + p.cajas)
    }
  } else {
    for (const p of productoTerminado) {
      const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
      const cajas = p.paletas * (pres?.cajasXPaleta ?? 0) + p.cajasSueltas
      const k = claveDe(p.saborNombre ?? "—", Number(p.presentacion) || null)
      hecho.set(k, (hecho.get(k) ?? 0) + cajas)
    }
  }

  const delPlan: ProgramacionItem[] = planDia.map((p) => ({
    sabor: p.saborNombre,
    presentacionMl: p.presentacionMl,
    hecho: hecho.get(claveDe(p.saborNombre, p.presentacionMl)) ?? 0,
    plan: p.cajasPlan,
  }))
  const clavesPlan = new Set(planDia.map((p) => claveDe(p.saborNombre, p.presentacionMl)))
  const extra: ProgramacionItem[] = [...hecho.entries()]
    .filter(([k]) => !clavesPlan.has(k))
    .sort((a, b) => b[1] - a[1])
    .map(([k, cajas]) => {
      const [sabor, ml] = k.split("|")
      return { sabor, presentacionMl: ml ? Number(ml) : null, hecho: cajas, plan: null }
    })

  return [...delPlan, ...extra]
}

/**
 * Minutos parados dentro de [desde, hasta] (ms): las paradas se juntan antes
 * de sumar, así dos que se solapan (supervisor y Mantenimiento) cuentan una
 * vez. Una abierta cuenta hasta `hasta`; un +1 sin minutos no cuenta.
 */
export function minutosParadosEntre(paradas: Pick<Parada, "inicio" | "fin" | "pendiente">[], desde: number, hasta: number): number {
  const tramos = paradas
    .filter((p) => !p.pendiente)
    .map((p) => [Math.max(new Date(p.inicio).getTime(), desde), Math.min(p.fin ? new Date(p.fin).getTime() : hasta, hasta)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let finAnterior = -Infinity
  for (const [a, b] of tramos) {
    const ini = Math.max(a, finAnterior)
    if (b > ini) total += b - ini
    finAnterior = Math.max(finAnterior, b)
  }
  return total / 60000
}

/** Una fila por línea: estado + producción + merma + paradas juntos. */
export function filasDeLineas(d: {
  lineasEstado: LineaConEstado[]
  produccionPorLinea: ProduccionLinea[]
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  presentaciones: PresentacionLive[]
  eficiencia: EficienciaTurno | null
  /** Minutos de parada por línea, con la línea normalizada LINEA_1/2/3 (ver minutosPorLinea). */
  minutosParadaPorLinea: Map<string, number>
  /** Total con el tramo de otros turnos, por línea normalizada (ver totalesParadaPorLinea). */
  minutosParadaTotalPorLinea?: Map<string, number>
  /** Paradas del turno (línea normalizada LINEA_1/2/3): se restan del TP. */
  paradasTurno?: Parada[]
  /** Desde cuándo cuenta el turno (inicioCuentaTurno): el TP no cuenta antes. */
  desdeTurno?: Date | null
  ahora: Date
}): FilaLineaCompacta[] {
  return d.lineasEstado.map((le) => {
    const prodLinea = d.produccionPorLinea.find((p) => p.linea === le.codigo)
    // Sumando TODAS las corridas de la línea en el turno, igual que el
    // contador — así un lote recién arrancado (sin datos propios
    // todavía) no le hace perder de vista la merma que sí lleva
    // acumulada la línea en este turno.
    const merma = mermaLineaTurno(d.corridas, le.codigo, d.contadores, d.productoTerminado, d.presentaciones)
    // Las paradas vienen con la línea normalizada LINEA_1/2/3 (Pruebas usa LINEA_T#), por eso se busca por número.
    const lineaParadas = "LINEA_" + le.codigo.replace(/^LINEA_T?/, "")
    const minutosParadaAcumulado = d.minutosParadaPorLinea.get(lineaParadas) ?? 0
    let minutosProduccion: number | null = null
    if (le.estado === "activa" && le.corrida) {
      const desde = Math.max(new Date(le.corrida.activadaEn).getTime(), d.desdeTurno?.getTime() ?? -Infinity)
      const parados = minutosParadosEntre((d.paradasTurno ?? []).filter((p) => p.lineaCodigo === lineaParadas), desde, d.ahora.getTime())
      minutosProduccion = Math.max(0, Math.round((d.ahora.getTime() - desde) / 60000 - parados))
    }
    return {
      ...le,
      cajas: prodLinea?.cajas ?? 0,
      litros: prodLinea?.litros ?? 0,
      eficienciaPct: d.eficiencia?.porLinea.get(le.codigo)?.eficienciaPct ?? null,
      mermaPct: merma?.pct ?? null,
      minutosParada: minutosParadaAcumulado > 0 ? minutosParadaAcumulado : null,
      minutosParadaTotal: d.minutosParadaTotalPorLinea?.get(lineaParadas) ?? null,
      minutosProduccion,
    }
  })
}

/** La parada individual más larga del turno (Módulo Paradas) — null si el turno no tuvo ninguna. */
export function paradaMasLargaDe(paradas: Parada[], ahora: Date): Parada | null {
  return [...paradas].sort((a, b) => duracionMin(b, ahora) - duracionMin(a, ahora))[0] ?? null
}

/**
 * Minutos totales (todos los turnos) por línea, solo de las líneas con alguna
 * parada que empezó en un turno anterior. `delTurno` trae el tramo del turno
 * (el servidor ya lo recorta); `completas` la misma parada sin recortar, por id.
 */
export function totalesParadaPorLinea(delTurno: Parada[], completas: Map<string, Parada>, ahora: Date): Map<string, number> {
  const vienenDeAntes = new Set(
    delTurno.filter((p) => {
      const c = completas.get(p.id)
      return c !== undefined && new Date(c.inicio).getTime() < new Date(p.inicio).getTime()
    }).map((p) => p.lineaCodigo),
  )
  if (vienenDeAntes.size === 0) return new Map()
  const totales = minutosPorLinea(delTurno.map((p) => completas.get(p.id) ?? p), ahora)
  return new Map(totales.filter((t) => vienenDeAntes.has(t.linea) && t.minutos > 0).map((t) => [t.linea, t.minutos]))
}
