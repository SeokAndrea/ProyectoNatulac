import type { ParadaConFalla } from "@/lib/catalogoFallas/analisis"
import { duracionMin, fmtDuracion, type Parada, type ResponsableParada } from "@/lib/paradas"
import { SIN_SUBSISTEMA } from "@/lib/mttoCatalogo"
import { restarDias } from "@/lib/tiempoPlanta"

/*
 * Cuentas de la pestaña «Resumen» de Reportes de paradas. Puras.
 *
 * Agrupa con el catálogo nuevo (Equipo › Sistema › Subsistema › Falla) cuando
 * la parada tiene falla; las que no (switch apagado, o no son de equipo) se
 * agrupan con el catálogo viejo: el subsistema de Mantenimiento si lo tiene y,
 * si no, el tipo de parada. Así el resumen sirve aunque el switch esté apagado.
 */

export interface Rango {
  desde: string
  hasta: string
}

const dias = (r: Rango) => Math.round((Date.parse(`${r.hasta}T12:00:00Z`) - Date.parse(`${r.desde}T12:00:00Z`)) / 86_400_000) + 1

/** El período de igual largo que termina el día antes de que empiece este. */
export function periodoAnterior(r: Rango): Rango {
  const n = dias(r)
  return { desde: restarDias(r.desde, n), hasta: restarDias(r.desde, 1) }
}

/** Del 1.º del mes de `hoy` hasta `hoy`. */
export const esteMes = (hoy: string): Rango => ({ desde: `${hoy.slice(0, 7)}-01`, hasta: hoy })

/** El mes anterior al de `hoy`, entero. */
export function mesPasado(hoy: string): Rango {
  const primero = `${hoy.slice(0, 7)}-01`
  const ultimo = restarDias(primero, 1)
  return { desde: `${ultimo.slice(0, 7)}-01`, hasta: ultimo }
}

// ---------------------------------------------------------------- filtros

export interface FiltrosResumen {
  linea: string // "TODAS" o LINEA_n
  responsable: "TODOS" | ResponsableParada
  /** Quién la terminó (terminadaPor); "TODOS" = cualquiera. */
  atendio: string
}

/** Las paradas del resumen: sin las +1 pendientes y con los filtros puestos. */
export function filtrarResumen(paradas: Parada[], f: FiltrosResumen): Parada[] {
  return paradas.filter(
    (p) =>
      !p.pendiente &&
      (f.linea === "TODAS" || p.lineaCodigo === f.linea) &&
      (f.responsable === "TODOS" || p.responsable === f.responsable) &&
      (f.atendio === "TODOS" || p.terminadaPor === f.atendio),
  )
}

/** Quiénes terminaron paradas, sin repetir y en orden alfabético. */
export function personasQueAtendieron(paradas: Parada[]): string[] {
  return [...new Set(paradas.map((p) => p.terminadaPor).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, "es"))
}

// ---------------------------------------------------------------- totales

export interface Totales {
  veces: number
  minutos: number
  /** Tiempo total / veces, redondeado a minutos. */
  promedio: number
}

const promedioDe = (minutos: number, veces: number) => (veces ? Math.round(minutos / veces) : 0)

export function totalesResumen(paradas: Parada[], ahora: Date): Totales {
  const minutos = paradas.reduce((t, p) => t + duracionMin(p, ahora), 0)
  return { veces: paradas.length, minutos, promedio: promedioDe(minutos, paradas.length) }
}

export interface TextosComparacion {
  veces: string
  tiempo: string
  promedio: string
}

/** Las frases de las tarjetas contra el período anterior de igual largo. */
export function comparacionPeriodo(actual: Totales, anterior: Totales): TextosComparacion {
  if (anterior.veces === 0) {
    const sin = "el período anterior no tuvo paradas"
    return { veces: sin, tiempo: sin, promedio: sin }
  }
  const d = actual.veces - anterior.veces
  return {
    veces: d === 0 ? "igual que el período anterior" : `${d > 0 ? "+" : "-"}${Math.abs(d)} que el período anterior`,
    tiempo: `período anterior: ${fmtDuracion(anterior.minutos)}`,
    promedio: `período anterior: ${fmtDuracion(anterior.promedio)}`,
  }
}

// ---------------------------------------------------------------- agrupar

export type NivelResumen = "SUBSISTEMA" | "EQUIPO" | "SISTEMA" | "FALLA"

export const NOMBRE_NIVEL: Record<NivelResumen, string> = {
  SUBSISTEMA: "Subsistema",
  EQUIPO: "Equipo",
  SISTEMA: "Sistema",
  FALLA: "Falla",
}

export interface SubFalla {
  clave: string
  nombre: string
  /** Subsistema · equipo (catálogo nuevo); null con el catálogo viejo. */
  detalle: string | null
  veces: number
  minutos: number
  promedio: number
}

export interface GrupoResumen extends SubFalla {
  /** Sus fallas, por tiempo. Vacío cuando se agrupa por Falla. */
  fallas: SubFalla[]
  /** La falla con más veces (desempate por tiempo); null cuando se agrupa por Falla. */
  fallaMasComun: SubFalla | null
}

interface Etiqueta {
  clave: string
  nombre: string
  detalle: string | null
}

/** Cómo se ve una parada en cada nivel; `falla` es la falla concreta dentro del grupo. */
function etiquetas(p: Parada, nueva: ParadaConFalla | undefined, nivel: NivelResumen): { grupo: Etiqueta; falla: Etiqueta } {
  if (nueva) {
    const { falla, subsistema, sistema, equipo } = nueva.cuenta
    const f: Etiqueta = { clave: `n:falla:${falla.id}`, nombre: falla.nombre, detalle: `${subsistema.nombre} · ${equipo.nombre}` }
    const g: Record<NivelResumen, Etiqueta> = {
      SUBSISTEMA: { clave: `n:sub:${subsistema.id}`, nombre: subsistema.nombre, detalle: equipo.nombre },
      EQUIPO: { clave: `n:eq:${equipo.id}`, nombre: equipo.nombre, detalle: null },
      SISTEMA: { clave: `n:sis:${sistema.id}`, nombre: sistema.nombre, detalle: equipo.nombre },
      FALLA: f,
    }
    return { grupo: g[nivel], falla: f }
  }
  const equipo = p.mttoEquipoNombre ?? p.equipoNombre ?? null
  const tipo: Etiqueta = { clave: `v:tipo:${p.tipoCodigo ?? `LIBRE:${p.tipoNombre}`}`, nombre: p.tipoNombre, detalle: equipo }
  if (nivel === "SUBSISTEMA" && p.subsistemaCodigo && p.subsistemaCodigo !== SIN_SUBSISTEMA) {
    return { grupo: { clave: `v:sub:${p.subsistemaCodigo}`, nombre: p.subsistemaNombre ?? p.subsistemaCodigo, detalle: equipo }, falla: tipo }
  }
  return { grupo: tipo, falla: tipo }
}

interface Acumulado extends Etiqueta {
  veces: number
  minutos: number
  fallas: Map<string, Etiqueta & { veces: number; minutos: number }>
}

const aSub = (a: Etiqueta & { veces: number; minutos: number }): SubFalla => ({
  clave: a.clave,
  nombre: a.nombre,
  detalle: a.detalle,
  veces: a.veces,
  minutos: a.minutos,
  promedio: promedioDe(a.minutos, a.veces),
})
const porTiempo = (a: SubFalla, b: SubFalla) => b.minutos - a.minutos || b.veces - a.veces
const porVeces = (a: SubFalla, b: SubFalla) => b.veces - a.veces || b.minutos - a.minutos

/** Los grupos del nivel pedido, del que más tiempo quitó al que menos. */
export function agruparResumen(paradas: Parada[], conFalla: ParadaConFalla[], nivel: NivelResumen, ahora: Date): GrupoResumen[] {
  const nuevas = new Map(conFalla.map((x) => [x.parada.id, x]))
  const m = new Map<string, Acumulado>()
  for (const p of paradas) {
    const { grupo, falla } = etiquetas(p, nuevas.get(p.id), nivel)
    const min = duracionMin(p, ahora)
    const g = m.get(grupo.clave) ?? { ...grupo, veces: 0, minutos: 0, fallas: new Map() }
    g.veces += 1
    g.minutos += min
    const f = g.fallas.get(falla.clave) ?? { ...falla, veces: 0, minutos: 0 }
    f.veces += 1
    f.minutos += min
    g.fallas.set(falla.clave, f)
    m.set(grupo.clave, g)
  }
  return [...m.values()]
    .map((g) => {
      const fallas = nivel === "FALLA" ? [] : [...g.fallas.values()].map(aSub).sort(porTiempo)
      return { ...aSub(g), fallas, fallaMasComun: [...fallas].sort(porVeces)[0] ?? null }
    })
    .sort(porTiempo)
}

export interface Otros {
  /** Cuántos grupos se juntaron. */
  cantidad: number
  veces: number
  minutos: number
  promedio: number
}

/** Los primeros `max` grupos y, sumado, lo que quedó fuera. */
export function limitarGrupos(grupos: GrupoResumen[], max: number): { filas: GrupoResumen[]; otros: Otros | null } {
  const filas = grupos.slice(0, max)
  const resto = grupos.slice(max)
  if (resto.length === 0) return { filas, otros: null }
  const veces = resto.reduce((t, g) => t + g.veces, 0)
  const minutos = resto.reduce((t, g) => t + g.minutos, 0)
  return { filas, otros: { cantidad: resto.length, veces, minutos, promedio: promedioDe(minutos, veces) } }
}

/** Las fallas que se repitieron (2 veces o más), de a 6 como máximo: más veces primero, desempate por tiempo. */
export function fallasQueMasSeRepiten(paradas: Parada[], conFalla: ParadaConFalla[], ahora: Date, max = 6): SubFalla[] {
  return agruparResumen(paradas, conFalla, "FALLA", ahora)
    .filter((g) => g.veces >= 2)
    .sort(porVeces)
    .slice(0, max)
    .map(({ fallas: _f, fallaMasComun: _m, ...sub }) => sub)
}
