import { restarDias } from "@/lib/tiempoPlanta"

/*
 * Programación SEMANAL + DIARIA (dueña, 2026-10-14; prototipo aprobado).
 * Cuentas puras (sin Supabase); la lectura está en src/lib/programacion.ts.
 *
 *  - La semana va de lunes a viernes. La analista carga el plan de la
 *    semana por sabor + presentación.
 *  - Cada día elige qué entra y en qué LÍNEA (ELEGIDO) o lo saca (QUITADO).
 *  - Lo que no se terminó un día pasa SOLO al siguiente, con su línea,
 *    mientras quede pendiente: "pendiente al empezar el día" = plan de la
 *    semana − lo producido los días anteriores.
 *  - El viernes cierra: lo que faltó queda incumplido y no pasa a la otra semana.
 *  - Lo producido es el PT del supervisor (en vivo), de lunes a viernes, más
 *    el sábado/domingo marcado como "Día extraordinario" (se muestra aparte).
 */

export interface ItemSemana {
  id: string
  /** Lunes, 'YYYY-MM-DD'. */
  semana: string
  saborId: string
  saborNombre: string
  presentacionId: string
  presentacionMl: number
  cajasPlan: number
}

export interface DecisionDia {
  itemId: string
  fecha: string
  estado: "ELEGIDO" | "QUITADO"
  /** 'LINEA_1'… null si se quitó. */
  lineaCodigo: string | null
}

export interface ProducidoDia {
  fecha: string
  saborId: string
  presentacionId: string
  cajas: number
}

/** Lo de una semana: el plan, lo decidido cada día y lo producido. */
export interface Semana {
  lunes: string
  items: ItemSemana[]
  decisiones: DecisionDia[]
  producido: ProducidoDia[]
}

/** Un producto en el plan de un día. */
export interface EnElDia {
  item: ItemSemana
  lineaCodigo: string
  /** Pasó solo desde el día anterior (quedaba pendiente). */
  viene: boolean
}

export const NOMBRES_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. Sábado y domingo dan el lunes de esa misma semana. */
export function lunesDe(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 domingo … 6 sábado
  return restarDias(fecha, (dia + 6) % 7)
}

/** Los 5 días (lunes a viernes) de la semana. */
export const diasDeSemana = (lunes: string) => [0, 1, 2, 3, 4].map((i) => restarDias(lunes, -i))

/** La semana ya cerró: el viernes quedó atrás. */
export const semanaCerrada = (lunes: string, hoy: string) => restarDias(lunes, -4) < hoy

const esDe = (item: ItemSemana) => (p: ProducidoDia) => p.saborId === item.saborId && p.presentacionId === item.presentacionId

export const producidoEn = (s: Semana, item: ItemSemana, fecha: string) =>
  s.producido.filter((p) => p.fecha === fecha && esDe(item)(p)).reduce((a, p) => a + p.cajas, 0)

/** Lo producido los días de la semana anteriores a `fecha`. */
export const producidoAntes = (s: Semana, item: ItemSemana, fecha: string) =>
  s.producido.filter((p) => p.fecha >= s.lunes && p.fecha < fecha && esDe(item)(p)).reduce((a, p) => a + p.cajas, 0)

/** Lo producido en toda la semana: lunes a viernes más el sábado/domingo que fue día extraordinario. */
export const producidoSemana = (s: Semana, item: ItemSemana) => producidoAntes(s, item, restarDias(s.lunes, -7))

/** Lo producido en sábado o domingo (día extraordinario); ya cuenta dentro de producidoSemana. */
export const producidoExtraordinario = (s: Semana, item: ItemSemana) =>
  s.producido.filter((p) => p.fecha > restarDias(s.lunes, -4) && esDe(item)(p)).reduce((a, p) => a + p.cajas, 0)

/** Lo que falta al EMPEZAR el día: el plan de la semana menos lo producido antes. */
export const pendienteAl = (s: Semana, item: ItemSemana, fecha: string) => Math.max(0, item.cajasPlan - producidoAntes(s, item, fecha))

/**
 * El plan de un día: lo que viene del día anterior con algo pendiente (pasa
 * solo, con su línea) más lo que eligió la analista; sin lo que sacó.
 */
export function planDelDia(s: Semana, fecha: string): EnElDia[] {
  const dias = diasDeSemana(s.lunes)
  const i = dias.indexOf(fecha)
  if (i < 0) return []
  const anterior = i === 0 ? [] : planDelDia(s, dias[i - 1])
  const delDia = s.decisiones.filter((d) => d.fecha === fecha)
  const decision = (itemId: string) => delDia.find((d) => d.itemId === itemId)

  const vienen: EnElDia[] = anterior
    .filter((x) => pendienteAl(s, x.item, fecha) > 0)
    .map((x) => ({ ...x, viene: true, lineaCodigo: decision(x.item.id)?.lineaCodigo ?? x.lineaCodigo }))
  const elegidos: EnElDia[] = delDia
    .filter((d) => d.estado === "ELEGIDO" && d.lineaCodigo && !vienen.some((v) => v.item.id === d.itemId))
    .flatMap((d) => {
      const item = s.items.find((it) => it.id === d.itemId)
      return item ? [{ item, lineaCodigo: d.lineaCodigo!, viene: false }] : []
    })
  return [...vienen, ...elegidos].filter((x) => decision(x.item.id)?.estado !== "QUITADO")
}

/** El primer día y la última línea con que se programó en la semana (null si nunca). */
export function programacionDe(s: Semana, item: ItemSemana): { primerDia: string; lineaCodigo: string } | null {
  let primerDia: string | null = null
  let lineaCodigo: string | null = null
  for (const fecha of diasDeSemana(s.lunes)) {
    const x = planDelDia(s, fecha).find((y) => y.item.id === item.id)
    if (!x) continue
    primerDia ??= fecha
    lineaCodigo = x.lineaCodigo
  }
  return primerDia && lineaCodigo ? { primerDia, lineaCodigo } : null
}

export type EstadoItem = { tipo: "CUMPLIDO" } | { tipo: "EN_CURSO" } | { tipo: "SIN_PROGRAMAR" } | { tipo: "INCUMPLIDO"; faltan: number }

export function estadoDe(s: Semana, item: ItemSemana, hoy: string): EstadoItem {
  const producido = producidoSemana(s, item)
  if (producido >= item.cajasPlan) return { tipo: "CUMPLIDO" }
  if (semanaCerrada(s.lunes, hoy)) return { tipo: "INCUMPLIDO", faltan: item.cajasPlan - producido }
  return programacionDe(s, item) ? { tipo: "EN_CURSO" } : { tipo: "SIN_PROGRAMAR" }
}

/** "LINEA_1" / "LINEA_T1" → "1". */
export const numeroDeLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/**
 * Plan de las semanas para Indicadores, por mes: cada producto con su plan
 * completo, en el mes de su primer día programado, con la línea con que se
 * programó y su sabor (Indicadores lo lleva a la línea que de verdad lo
 * corrió; la programada queda para lo que no se produjo). Los que nunca se
 * programaron no tienen línea: van aparte, en el mes de su lunes, para
 * repartirlos como antes.
 */
export function planDelMes(
  semanas: Semana[],
  mes: string,
): { conLinea: { linea: string; saborId: string; volumenMl: number; cajas: number }[]; sinLinea: { volumenMl: number; cajas: number }[] } {
  const delMes = (fecha: string) => fecha.slice(0, 7) === mes.slice(0, 7)
  const conLinea: { linea: string; saborId: string; volumenMl: number; cajas: number }[] = []
  const sinLinea: { volumenMl: number; cajas: number }[] = []
  for (const s of semanas) {
    for (const item of s.items) {
      const p = programacionDe(s, item)
      if (p && delMes(p.primerDia)) conLinea.push({ linea: numeroDeLinea(p.lineaCodigo), saborId: item.saborId, volumenMl: item.presentacionMl, cajas: item.cajasPlan })
      else if (!p && delMes(s.lunes)) sinLinea.push({ volumenMl: item.presentacionMl, cajas: item.cajasPlan })
    }
  }
  return { conLinea, sinLinea }
}
