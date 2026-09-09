import { supabase } from "@/lib/supabase"

/*
 * Módulo Paradas (downtime de Mantenimiento). Los datos vienen de un
 * Google Sheet externo que se sincroniza a la tabla `paradas`
 * (FASE B — todavía sin migración). FASE A: la página y el Panel se
 * arman contra `src/lib/paradasDemoFixture.ts` para revisar el diseño
 * sin base.
 *
 * Regla de negocio (dueño, 2026-09-09): la duración la calcula el
 * programa (`fin − inicio`), NO se usa la columna DOWNTIME del Sheet.
 * `procuraMin` (tiempo de espera de repuesto) se guarda como dato
 * informativo y no entra en la duración.
 */

export type EstatusParada = "FINALIZADO" | "PENDIENTE" | (string & {})

/**
 * Categoría de parada:
 *  - OPERACIONAL: la carga el supervisor ("Parada Operacional" — pausa de línea con motivo).
 *  - EXTERNA: la carga el supervisor (causa fuera de la línea — falta de insumo, corte de luz, etc.).
 *  - MECANICA: la carga Mantenimiento en el Sheet (falla de equipo). Es la que sincroniza `paradas`.
 */
export type CategoriaParada = "OPERACIONAL" | "EXTERNA" | "MECANICA"

export const NOMBRE_CATEGORIA: Record<CategoriaParada, string> = {
  OPERACIONAL: "Operacional",
  EXTERNA: "Externa",
  MECANICA: "Mecánica (Mantenimiento)",
}

/**
 * Corte de luz: tras la caída de suministro la máquina aséptica pide
 * CIP antes de rearrancar, así que el impacto real se asume en al menos
 * `PISO_LUZ_MIN` minutos aunque el reporte muestre un tramo más corto.
 */
export const PISO_LUZ_MIN = 180

/** ¿Es una parada por corte de luz? (subsistema de suministro eléctrico o mención explícita). */
export function esParadaDeLuz(p: Pick<Parada, "subsistemaCodigo" | "descripcion">): boolean {
  if (p.subsistemaCodigo && /-ELE-|SUMINISTRO EL[EÉ]CTRICO/i.test(p.subsistemaCodigo)) return true
  return /(ca[ií]da|corte|falla)\s+(de\s+)?(suministro\s+el[eé]ctrico|luz|energ[ií]a)/i.test(p.descripcion)
}

/** Una parada, con los nombres ya resueltos (forma que devolverá `listar_paradas`). */
export interface Parada {
  id: string
  categoria: CategoriaParada
  area: string // 'ASEPTICO' | 'VACIO'
  turnoTipo: string // 'TURNO_1' | 'TURNO_2' | 'TURNO_3'
  turnoCodigo: string | null
  linea: string // 'LINEA_1' | 'LINEA_2' | 'LINEA_3'
  equipoCodigo: string
  equipoNombre: string
  subsistemaCodigo: string | null
  subsistemaNombre: string | null
  descripcion: string
  supervisorNombre: string
  reporta: string | null // 'SUPERVISOR' | 'TECNICO'
  estatus: EstatusParada
  /** ISO local 'YYYY-MM-DDTHH:MM:SS'. */
  inicio: string
  /** null = parada abierta (en curso). */
  fin: string | null
  /** TIEMPO DE PROCURA — informativo, NO entra en la duración. */
  procuraMin: number | null
  /** DOWNTIME crudo del Sheet — solo para comparar con el cálculo propio. */
  downtimeSheetMin: number | null
  /** Piso de minutos asumido (ej. 180 para corte de luz por el CIP). `duracionMin` nunca devuelve menos. */
  pisoMin: number | null
}

/** Las 3 líneas físicas (mismo criterio en todas las áreas). */
export const LINEAS_PARADAS = [
  { codigo: "LINEA_1", nombre: "Línea 1" },
  { codigo: "LINEA_2", nombre: "Línea 2" },
  { codigo: "LINEA_3", nombre: "Línea 3" },
] as const

export const nombreLineaParada = (codigo: string) =>
  LINEAS_PARADAS.find((l) => l.codigo === codigo)?.nombre ?? codigo
export const nombreTurnoParada = (tt: string) => `Turno ${tt.replace("TURNO_", "")}`

export interface EquipoParada {
  codigo: string
  nombre: string
}
export interface SubsistemaParada {
  equipoCodigo: string
  codigo: string
  nombre: string
}

/** Forma cruda del fixture: las fechas son relativas a HOY (ver `paradasDemo()`). */
export interface ParadaDemoRaw {
  reporteId: string
  categoria: CategoriaParada
  pisoMin: number | null
  area: string
  turnoTipo: string
  lineaCodigo: string
  equipoCodigo: string
  equipoNombre: string
  subsistemaCodigo: string | null
  subsistemaNombre: string | null
  descripcion: string
  supervisorNombre: string
  reporta: string | null
  estatus: string
  offsetDias: number
  hora: string
  duracionMinReal: number | null
  procuraMin: number | null
  downtimeSheetMin: number | null
}

// ------------------------------------------------------------
// Cálculo propio de la duración
// ------------------------------------------------------------

/**
 * Duración en minutos: `fin − inicio` (o `ahora − inicio` si está
 * abierta), nunca menos que `pisoMin` (ej. 180 min para corte de luz
 * por el CIP forzado).
 */
export function duracionMin(p: Parada, ahora: Date = new Date()): number {
  const ini = new Date(p.inicio).getTime()
  const fin = p.fin ? new Date(p.fin).getTime() : ahora.getTime()
  const calc = Math.max(0, Math.round((fin - ini) / 60000))
  return Math.max(calc, p.pisoMin ?? 0)
}

export const paradaAbierta = (p: Parada) => p.fin === null

export function fmtDuracion(min: number): string {
  if (min < 1) return "< 1 min"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// ------------------------------------------------------------
// Agregaciones (compartidas por la página y el Panel de Producción)
// ------------------------------------------------------------

export interface GrupoParada {
  /** código (de subsistema o de equipo). */
  clave: string
  /** texto legible para mostrar. */
  etiqueta: string
  veces: number
  minutos: number
}

/** Frecuencia + minutos por CÓDIGO de subsistema — "cuántas veces se repite cada código". */
export function agruparPorCodigo(paradas: Parada[], ahora?: Date): GrupoParada[] {
  const m = new Map<string, GrupoParada>()
  for (const p of paradas) {
    const clave = p.subsistemaCodigo ?? "—"
    const etiqueta = p.subsistemaCodigo
      ? `${p.subsistemaCodigo}${p.subsistemaNombre ? ` · ${p.subsistemaNombre}` : ""}`
      : "Sin código de subsistema"
    const g = m.get(clave) ?? { clave, etiqueta, veces: 0, minutos: 0 }
    g.veces += 1
    g.minutos += duracionMin(p, ahora)
    m.set(clave, g)
  }
  return [...m.values()].sort((a, b) => b.veces - a.veces || b.minutos - a.minutos)
}

/** Minutos + frecuencia por EQUIPO (para el "Top Fallas" del Panel). */
export function agruparPorEquipo(paradas: Parada[], ahora?: Date): GrupoParada[] {
  const m = new Map<string, GrupoParada>()
  for (const p of paradas) {
    const g = m.get(p.equipoCodigo) ?? { clave: p.equipoCodigo, etiqueta: p.equipoNombre, veces: 0, minutos: 0 }
    g.veces += 1
    g.minutos += duracionMin(p, ahora)
    m.set(p.equipoCodigo, g)
  }
  return [...m.values()].sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

export interface ResumenCategoria {
  categoria: CategoriaParada
  etiqueta: string
  veces: number
  minutos: number
}
/** Reparto del tiempo perdido entre Operacional / Externa / Mecánica. */
export function resumenPorCategoria(paradas: Parada[], ahora?: Date): ResumenCategoria[] {
  const orden: CategoriaParada[] = ["OPERACIONAL", "EXTERNA", "MECANICA"]
  return orden.map((categoria) => {
    const dela = paradas.filter((p) => p.categoria === categoria)
    return {
      categoria,
      etiqueta: NOMBRE_CATEGORIA[categoria],
      veces: dela.length,
      minutos: dela.reduce((a, p) => a + duracionMin(p, ahora), 0),
    }
  })
}

export interface ResumenLinea {
  linea: string
  veces: number
  minutos: number
}
export function minutosPorLinea(paradas: Parada[], ahora?: Date): ResumenLinea[] {
  const m = new Map<string, ResumenLinea>()
  for (const p of paradas) {
    const g = m.get(p.linea) ?? { linea: p.linea, veces: 0, minutos: 0 }
    g.veces += 1
    g.minutos += duracionMin(p, ahora)
    m.set(p.linea, g)
  }
  return [...m.values()].sort((a, b) => a.linea.localeCompare(b.linea))
}

export interface PuntoDia {
  dia: string // 'YYYY-MM-DD'
  minutos: number
  veces: number
}
export function agruparPorDia(paradas: Parada[], ahora?: Date): PuntoDia[] {
  const m = new Map<string, PuntoDia>()
  for (const p of paradas) {
    const dia = p.inicio.slice(0, 10)
    const g = m.get(dia) ?? { dia, minutos: 0, veces: 0 }
    g.minutos += duracionMin(p, ahora)
    g.veces += 1
    m.set(dia, g)
  }
  return [...m.values()].sort((a, b) => a.dia.localeCompare(b.dia))
}

// ------------------------------------------------------------
// Capa de datos
// ------------------------------------------------------------

export interface FiltrosParadas {
  desde: string // 'YYYY-MM-DD'
  hasta: string
  area?: string
  linea?: string
  equipo?: string
}

/**
 * FASE A: lee el fixture (todo el rango, se filtra en memoria).
 * FASE B: pasa a `supabase.rpc("listar_paradas", {...})` — la firma y la
 * forma de `Parada` no cambian, así que la página no se toca.
 */
export async function listarParadas(filtros: FiltrosParadas): Promise<Parada[]> {
  void supabase // FASE B
  const { paradasDemo } = await import("@/lib/paradasDemoFixture")
  return paradasDemo().filter((p) => {
    const dia = p.inicio.slice(0, 10)
    if (dia < filtros.desde || dia > filtros.hasta) return false
    if (filtros.area && p.area !== filtros.area) return false
    if (filtros.linea && p.linea !== filtros.linea) return false
    if (filtros.equipo && p.equipoCodigo !== filtros.equipo) return false
    return true
  })
}
