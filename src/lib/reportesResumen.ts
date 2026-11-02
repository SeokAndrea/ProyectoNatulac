import type { ParadaConFalla } from "@/lib/catalogoFallas/analisis"
import type { OpcionFalla } from "@/lib/catalogoFallas/paradas"
import { duracionMin, esParadaLNPE, fmtDuracion, type Parada, type ResponsableParada } from "@/lib/paradas"
import type { EstadoSif, Sif } from "@/lib/sif"
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

/** Las que cuentan como falla: no programadas, sin la línea no programada (LNPE) ni el ocioso. */
export const esFallaDelResumen = (p: Parada) => p.clase === "NO_PROGRAMADA" && !esParadaLNPE(p)

/** Las paradas del resumen: solo fallas (no programadas), sin las +1 pendientes y con los filtros puestos. */
export function filtrarResumen(paradas: Parada[], f: FiltrosResumen): Parada[] {
  return paradas.filter(
    (p) =>
      !p.pendiente &&
      esFallaDelResumen(p) &&
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
export function comparacionPeriodo(actual: Totales, anterior: Totales | null): TextosComparacion {
  // Todavía cargando o no se pudo leer: no se compara (no es lo mismo que «no hubo paradas»).
  if (!anterior) return { veces: "—", tiempo: "—", promedio: "—" }
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
  /** Código con el que la SIF reconoce la falla (tipo_codigo de listar_sif); null si no hay. */
  codigoSif: string | null
  /** Líneas donde pasó (la SIF es por línea). */
  lineas: string[]
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
  codigoSif?: string | null
}

/** El código que arma codigo_falla() en la base: CF-SUP-CAM-01. */
export const codigoDeFalla = (o: OpcionFalla) => `${o.equipo.sufijo}-${o.sistema.sufijo}-${o.subsistema.sufijo}-${String(o.falla.numero).padStart(2, "0")}`

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Quita del nombre el «Equipo · » del comienzo cuando el equipo ya se muestra aparte. */
function sinEquipo(nombre: string, equipo: string | null): string {
  if (!equipo) return nombre
  const prefijo = `${equipo} · `
  return nombre.toLowerCase().startsWith(prefijo.toLowerCase()) && nombre.length > prefijo.length ? nombre.slice(prefijo.length) : nombre
}

/** La línea de abajo: las partes sin repetirse entre sí ni repetir el título. */
function linea2(titulo: string, ...partes: (string | null)[]): string | null {
  const vistas: string[] = [titulo]
  for (const x of partes) if (x && !vistas.some((v) => igual(v, x))) vistas.push(x)
  return vistas.length > 1 ? vistas.slice(1).join(" · ") : null
}

/** Cómo se ve una parada en cada nivel; `falla` es la falla concreta dentro del grupo. */
function etiquetas(p: Parada, nueva: ParadaConFalla | undefined, nivel: NivelResumen): { grupo: Etiqueta; falla: Etiqueta } {
  if (nueva) {
    const { falla, subsistema, sistema, equipo } = nueva.cuenta
    const f: Etiqueta = { clave: `n:falla:${falla.id}`, nombre: falla.nombre, detalle: linea2(falla.nombre, subsistema.nombre, equipo.nombre), codigoSif: codigoDeFalla(nueva.cuenta) }
    const g: Record<NivelResumen, Etiqueta> = {
      SUBSISTEMA: { clave: `n:sub:${subsistema.id}`, nombre: subsistema.nombre, detalle: linea2(subsistema.nombre, equipo.nombre) },
      EQUIPO: { clave: `n:eq:${equipo.id}`, nombre: equipo.nombre, detalle: null },
      SISTEMA: { clave: `n:sis:${sistema.id}`, nombre: sistema.nombre, detalle: linea2(sistema.nombre, equipo.nombre) },
      FALLA: f,
    }
    return { grupo: g[nivel], falla: f }
  }
  const equipo = p.mttoEquipoNombre ?? p.equipoNombre ?? null
  const nombreTipo = sinEquipo(p.tipoNombre, equipo)
  const tipo: Etiqueta = { clave: `v:tipo:${p.tipoCodigo ?? `LIBRE:${p.tipoNombre}`}`, nombre: nombreTipo, detalle: linea2(nombreTipo, equipo), codigoSif: p.tipoCodigo }
  if (nivel === "SUBSISTEMA" && p.subsistemaCodigo && p.subsistemaCodigo !== SIN_SUBSISTEMA) {
    const nombre = sinEquipo(p.subsistemaNombre ?? p.subsistemaCodigo, equipo)
    return { grupo: { clave: `v:sub:${p.subsistemaCodigo}`, nombre, detalle: linea2(nombre, equipo) }, falla: tipo }
  }
  return { grupo: tipo, falla: tipo }
}

type ConCuenta = Etiqueta & { veces: number; minutos: number; lineas: Set<string> }
interface Acumulado extends ConCuenta {
  fallas: Map<string, ConCuenta>
}

const aSub = (a: ConCuenta): SubFalla => ({
  clave: a.clave,
  nombre: a.nombre,
  detalle: a.detalle,
  veces: a.veces,
  minutos: a.minutos,
  promedio: promedioDe(a.minutos, a.veces),
  codigoSif: a.codigoSif ?? null,
  lineas: [...a.lineas].sort(),
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
    const g = m.get(grupo.clave) ?? { ...grupo, veces: 0, minutos: 0, lineas: new Set<string>(), fallas: new Map() }
    g.veces += 1
    g.minutos += min
    g.lineas.add(p.lineaCodigo)
    const f = g.fallas.get(falla.clave) ?? { ...falla, veces: 0, minutos: 0, lineas: new Set<string>() }
    f.veces += 1
    f.minutos += min
    f.lineas.add(p.lineaCodigo)
    g.fallas.set(falla.clave, f)
    m.set(grupo.clave, g)
  }
  return [...m.values()]
    .map((g) => {
      const fallas = nivel === "FALLA" ? [] : [...g.fallas.values()].map(aSub).sort(porTiempo)
      const comun = [...fallas].sort(porVeces)[0] ?? null
      // Si la falla más común se llama igual que el grupo, no dice nada nuevo.
      return { ...aSub(g), fallas, fallaMasComun: comun && !igual(comun.nombre, g.nombre) ? comun : null }
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

const FUERZA: Record<EstadoSif, number> = { INSPECCION: 1, REVISADA: 1, PENDIENTE: 2, EN_REPARACION: 2, CERRADA: 2 }

export type SifMin = Pick<Sif, "id" | "estado" | "fechaJornada" | "lineaCodigo" | "tipoCodigo" | "generadaEn">

/** Texto de la etiqueta: el estado de la SIF, siempre diciendo si es Inspección o Intervención. */
export function etiquetaSif(estado: EstadoSif): string {
  if (estado === "INSPECCION") return "Inspección"
  if (estado === "REVISADA") return "Inspección revisada"
  if (estado === "PENDIENTE") return "Intervención pendiente"
  if (estado === "EN_REPARACION") return "Intervención en reparación"
  return "Intervención cerrada"
}

/**
 * La SIF de una falla en el período: misma línea y mismo código (tipo_codigo de
 * listar_sif = código de la falla nueva, o el tipo viejo) con jornada dentro del
 * período. Si hay varias, la más fuerte (Intervención antes que Inspección) y,
 * a igual fuerza, la más reciente. null si no hay vínculo.
 */
export function sifDeFalla(f: Pick<SubFalla, "codigoSif" | "lineas">, sifs: SifMin[], rango: Rango): SifMin | null {
  if (!f.codigoSif) return null
  const candidatas = sifs.filter(
    (s) => s.tipoCodigo === f.codigoSif && f.lineas.includes(s.lineaCodigo) && s.fechaJornada >= rango.desde && s.fechaJornada <= rango.hasta,
  )
  return candidatas.sort((a, b) => FUERZA[b.estado] - FUERZA[a.estado] || b.generadaEn.localeCompare(a.generadaEn))[0] ?? null
}
