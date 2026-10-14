import type { DatosPresentacion, ParadaMes } from "@/lib/indicadores/tipos"

/*
 * Cuentas puras de Indicadores (sin Supabase). Los indicadores se miran en
 * ventana de 3 meses: el elegido y los 2 anteriores (dueña, 2026-10-14);
 * de ahí salen la comparación y el más alto / más bajo.
 */

const NOMBRES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

/** 'YYYY-MM-01' corrido n meses (n negativo = hacia atrás). */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`
}

/** El mes elegido y los 2 anteriores, del más viejo al elegido. */
export const mesesVentana = (mes: string) => [sumarMeses(mes, -2), sumarMeses(mes, -1), mes]

/** Último día del mes: 'YYYY-MM-DD'. */
export function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return `${mes.slice(0, 8)}${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`
}

/** "septiembre" */
export const nombreMes = (mes: string) => NOMBRES[Number(mes.slice(5, 7)) - 1]
/** "Sep" */
export const mesCorto = (mes: string) => nombreMes(mes).slice(0, 3).replace(/^./, (c) => c.toUpperCase())
export const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** "LINEA_T2" / "LINEA_2" → "2". */
export const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/** "TBA-1000" (Tetra Brik, Línea 1) o "TPA-250" (Tetra Prisma). */
export const nombrePresentacion = (maquina: string | undefined, ml: string | number) => `${maquina === "TB" ? "TBA" : "TPA"}-${ml}`

export interface PresentacionDeLinea {
  clave: string
  ml: string
  nombre: string
  /** Posición fija en la línea (de ahí sale su tono). */
  indice: number
}

/**
 * Presentaciones de una línea, de mayor a menor: las del catálogo
 * (velocidades activas) más cualquier otra que traigan los datos (ej. una
 * desactivada que se corrió antes). Sin filtrar por datos.
 */
export function presentacionesDeLinea(
  linea: string,
  velocidades: { linea: string; presentacion: string; maquina: string; activo: boolean }[],
  claves: string[],
): PresentacionDeLinea[] {
  const deLinea = velocidades.filter((v) => numeroLinea(v.linea) === linea)
  const mls = new Set([
    ...deLinea.filter((v) => v.activo).map((v) => v.presentacion),
    ...claves.filter((c) => c.startsWith(`${linea}|`)).map((c) => c.split("|")[1]),
  ])
  return [...mls]
    .sort((a, b) => Number(b) - Number(a))
    .map((ml, indice) => ({ clave: `${linea}|${ml}`, ml, indice, nombre: nombrePresentacion(deLinea.find((v) => v.presentacion === ml)?.maquina ?? (linea === "1" ? "TB" : "TP"), ml) }))
}

/** Producidas ÷ planeadas, %. Sin cajas, el % cargado a mano; si no hay nada, null. */
export function cumplimiento(p: DatosPresentacion | undefined): number | null {
  if (!p) return null
  if (p.prod != null && p.plan) return (p.prod / p.plan) * 100
  return p.cumplimiento ?? null
}

/** Ausentismo total del mes: horas perdidas ÷ horas teóricas, %. */
export const ausentismoTotal = (horasPerdidas: number | null, horasTeoricas: number | null) =>
  horasPerdidas == null || !horasTeoricas ? null : (horasPerdidas / horasTeoricas) * 100

/** Una presentación aparece si se corrió o tenía plan. */
export const tieneDatos = (p: DatosPresentacion | undefined) => !!p && (p.corrio || (p.plan ?? 0) > 0)

export interface PuntoSerie {
  mes: string
  valor: number | null
}

/** Más alto y más bajo de la ventana, sin los meses vacíos. null si no hay ninguno. */
export function extremos(serie: PuntoSerie[]): { alto: PuntoSerie; bajo: PuntoSerie } | null {
  const con = serie.filter((p) => p.valor != null)
  if (con.length === 0) return null
  return {
    alto: con.reduce((a, b) => (b.valor! > a.valor! ? b : a)),
    bajo: con.reduce((a, b) => (b.valor! < a.valor! ? b : a)),
  }
}

/** Diferencia contra el mes anterior. null si falta alguno. */
export const diferencia = (actual: number | null, anterior: number | null) => (actual == null || anterior == null ? null : actual - anterior)

/** Las n paradas que más tiempo quitaron, o las que más veces pasaron. Las sin dato van al final. */
export function topParadas(paradas: ParadaMes[], por: "tiempo" | "veces", n = 3): ParadaMes[] {
  const v = (x: number | null) => x ?? -1
  return [...paradas]
    .filter((p) => p.causa.trim())
    .sort((a, b) => (por === "veces" ? v(b.veces) - v(a.veces) || v(b.minutos) - v(a.minutos) : v(b.minutos) - v(a.minutos)))
    .slice(0, n)
}

/**
 * Lee lo escrito: vacío = null (sin dato, "—"). Los enteros (cajas,
 * minutos, veces) ignoran los puntos de miles; los % aceptan coma o punto.
 */
export function leerNumero(texto: string, entero: boolean): number | null {
  const limpio = entero ? texto.replace(/[^\d]/g, "") : texto.trim().replace(",", ".")
  if (!limpio) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}
