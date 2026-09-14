import { supabase } from "@/lib/supabase"

/*
 * Módulo Paradas — downtime de las líneas. Rumbo 2026-09-10 (ver
 * plan-paradas.md): el eje pasa a PROGRAMADA / NO_PROGRAMADA / OCIOSO.
 *
 *  - PROGRAMADA y OCIOSO: las carga el supervisor a mano en la página de
 *    Registro (elige línea, tipo del catálogo, hora de inicio; luego
 *    vuelve y cierra con hora de fin).
 *  - NO_PROGRAMADA: solo lectura en la app; idealmente se sincroniza del
 *    Sheet de Mantenimiento (FASE C′ — todavía sin base).
 *
 * FASE A′: todo corre contra src/lib/paradasDemoFixture.ts para iterar el
 * diseño sin Supabase.
 *
 * Regla de negocio (dueño, 2026-09-09): la duración la calcula el
 * programa (fin − inicio). Cada tipo trae un "tiempo guía" (duración
 * estándar); el desvío (real − guía) alimenta la eficiencia.
 */

export type ClaseParada = "PROGRAMADA" | "NO_PROGRAMADA" | "OCIOSO"
export type OrigenParada = "MANUAL" | "SHEET"

/** Orden fijo para todos los repartos por clase. */
export const CLASES_PARADA: ClaseParada[] = ["PROGRAMADA", "NO_PROGRAMADA", "OCIOSO"]

export const NOMBRE_CLASE: Record<ClaseParada, string> = {
  PROGRAMADA: "Programada",
  NO_PROGRAMADA: "No programada",
  OCIOSO: "Tiempo ocioso",
}

/** Color semántico por clase (tokens del tema). */
export const COLOR_CLASE: Record<ClaseParada, string> = {
  PROGRAMADA: "bg-info",
  NO_PROGRAMADA: "bg-danger",
  OCIOSO: "bg-warning",
}

// ------------------------------------------------------------
// Catálogo de tipos
// ------------------------------------------------------------

/** Un tipo del catálogo de paradas. En FASE B′ pasa a la tabla `paradas_tipos` (editable en Edición de Datos). */
export interface TipoParada {
  codigo: string
  nombre: string
  clase: ClaseParada
  /** Duración estándar en minutos. null = sin guía (ej. "Final de Producción"). */
  tiempoGuiaMin: number | null
  /** Código de la planilla de Mantenimiento (PPL1 / PPEL1…). Se guarda tal cual. */
  codigoPlanilla: string
}

/*
 * Seed del catálogo PROGRAMADA (lista del dueño, 2026-09-10). Los códigos
 * PPL1 / PPEL1 se guardan tal cual, a la espera de confirmar qué agrupan.
 */
export const CATALOGO_PROGRAMADA: TipoParada[] = [
  { codigo: "ARRANQUE_PRODUCCION", nombre: "Arranque de Producción", clase: "PROGRAMADA", tiempoGuiaMin: 180, codigoPlanilla: "PPL1" },
  { codigo: "CAMBIO_LOTE", nombre: "Cambio de Lote", clase: "PROGRAMADA", tiempoGuiaMin: 10, codigoPlanilla: "PPL1" },
  { codigo: "CAMBIO_SABOR", nombre: "Cambio de Sabor", clase: "PROGRAMADA", tiempoGuiaMin: 25, codigoPlanilla: "PPL1" },
  { codigo: "DESCANSO_LEGAL", nombre: "Descanso Legal", clase: "PROGRAMADA", tiempoGuiaMin: 30, codigoPlanilla: "PPL1" },
  { codigo: "FINAL_PRODUCCION", nombre: "Final de Producción", clase: "PROGRAMADA", tiempoGuiaMin: null, codigoPlanilla: "PPL1" },
  { codigo: "LIMPIEZA_INTERMEDIA", nombre: "Limpieza Intermedia Programada", clase: "PROGRAMADA", tiempoGuiaMin: 180, codigoPlanilla: "PPL1" },
  { codigo: "ORDEN_LIMPIEZA_FIN_TURNO", nombre: "Orden y Limpieza del Área — Final de Turno", clase: "PROGRAMADA", tiempoGuiaMin: 15, codigoPlanilla: "PPL1" },
  { codigo: "MANTENIMIENTO_PROGRAMADO", nombre: "Mantenimiento Programado / Cambio de Presentación", clase: "PROGRAMADA", tiempoGuiaMin: 180, codigoPlanilla: "PPL1" },
  { codigo: "DESARROLLO_PRODUCTO", nombre: "Desarrollo de Producto / Insumo", clase: "PROGRAMADA", tiempoGuiaMin: null, codigoPlanilla: "PPL1" },
  { codigo: "LIBERACION_VAPOR", nombre: "Liberación de Vapor", clase: "PROGRAMADA", tiempoGuiaMin: null, codigoPlanilla: "PPL1" },
  { codigo: "TRANSFERENCIA_ENERGIA", nombre: "Transferencia de Energía Eléctrica / Preventivo", clase: "PROGRAMADA", tiempoGuiaMin: null, codigoPlanilla: "PPEL1" },
]

export const tipoProgramadaPorCodigo = (codigo: string) => CATALOGO_PROGRAMADA.find((t) => t.codigo === codigo) ?? null

// ------------------------------------------------------------
// Líneas y turnos
// ------------------------------------------------------------

/** Las 3 líneas físicas (mismo criterio en todas las áreas). */
export const LINEAS_PARADAS = [
  { codigo: "LINEA_1", nombre: "Línea 1" },
  { codigo: "LINEA_2", nombre: "Línea 2" },
  { codigo: "LINEA_3", nombre: "Línea 3" },
] as const

export const nombreLineaParada = (codigo: string) =>
  LINEAS_PARADAS.find((l) => l.codigo === codigo)?.nombre ?? codigo
export const nombreTurnoParada = (tt: string) => `Turno ${tt.replace("TURNO_", "")}`

// ------------------------------------------------------------
// Una parada
// ------------------------------------------------------------

/** Una parada, con los nombres ya resueltos (forma que devolverá `listar_paradas`). */
export interface Parada {
  id: string
  clase: ClaseParada
  origen: OrigenParada
  lineaCodigo: string // 'LINEA_1' | 'LINEA_2' | 'LINEA_3'
  turnoTipo: string // 'TURNO_1' | 'TURNO_2' | 'TURNO_3'
  /** Tipo del catálogo. null solo para OCIOSO (texto libre). */
  tipoCodigo: string | null
  tipoNombre: string
  /** Heredado del tipo al momento de registrar (o cargado a mano en Ocioso). */
  tiempoGuiaMin: number | null
  /** Texto libre — obligatorio en OCIOSO, opcional en el resto. */
  nota: string | null
  /** ISO local 'YYYY-MM-DDTHH:MM:SS'. */
  inicio: string
  /** null = parada abierta (en curso / "Continúa" al cerrar el turno). */
  fin: string | null
  supervisorNombre: string | null
  /**
   * Sabor/familia/presentación que corría en esa línea al momento de la
   * parada — opcionales: null/undefined cuando no aplica (CIP, orden y
   * limpieza, liberación de vapor: la línea no tenía nada corriendo) o
   * cuando quien registra la parada no lo sabe (RegistroParadas no pide
   * este dato — no es algo que el supervisor tipee). Hoy solo lo trae el
   * fixture de demo (FASE A′); en la base real se resuelve por
   * línea+instante contra Producción (`turno_lineas`), Paradas no lo
   * guarda por su cuenta.
   */
  saborNombre?: string | null
  familiaNombre?: string | null
  presentacionMl?: number | null
}

export const paradaAbierta = (p: Parada) => p.fin === null

/**
 * Paradas abiertas ("— Continúa") de estas líneas — usado por Finalizar
 * Turno / el Acta (FASE A′, plan-paradas.md §3): vista previa contra el
 * fixture, todavía no está atada al `turno_id` real (eso es FASE B′).
 */
export function paradasAbiertasDeLineas(paradas: Parada[], lineasCodigos: Iterable<string>): Parada[] {
  const set = new Set(lineasCodigos)
  return paradas.filter((p) => paradaAbierta(p) && set.has(p.lineaCodigo))
}

// ------------------------------------------------------------
// Duración y desvío
// ------------------------------------------------------------

/** Duración en minutos: `fin − inicio` (o `ahora − inicio` si está abierta). */
export function duracionMin(p: Pick<Parada, "inicio" | "fin">, ahora: Date = new Date()): number {
  const ini = new Date(p.inicio).getTime()
  const fin = p.fin ? new Date(p.fin).getTime() : ahora.getTime()
  return Math.max(0, Math.round((fin - ini) / 60000))
}

/**
 * Desvío contra el tiempo guía: `duración real − tiempo guía`.
 * Positivo = se pasó; negativo = más corta. null si el tipo no tiene guía.
 */
export function desvioMin(p: Parada, ahora?: Date): number | null {
  if (p.tiempoGuiaMin == null) return null
  return duracionMin(p, ahora) - p.tiempoGuiaMin
}

export function fmtDuracion(min: number): string {
  if (min < 1) return "< 1 min"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "+18 min" / "−5 min" / "en guía". */
export function fmtDesvio(min: number): string {
  if (min === 0) return "en guía"
  const signo = min > 0 ? "+" : "−"
  return `${signo}${fmtDuracion(Math.abs(min))}`
}

// ------------------------------------------------------------
// Agregaciones (compartidas por el Panel de Paradas y el de Producción)
// ------------------------------------------------------------

export interface ResumenClase {
  clase: ClaseParada
  etiqueta: string
  veces: number
  minutos: number
}
/** Reparto del tiempo perdido entre Programada / No programada / Ocioso (orden fijo). */
export function resumenPorClase(paradas: Parada[], ahora?: Date): ResumenClase[] {
  return CLASES_PARADA.map((clase) => {
    const dela = paradas.filter((p) => p.clase === clase)
    return {
      clase,
      etiqueta: NOMBRE_CLASE[clase],
      veces: dela.length,
      minutos: dela.reduce((a, p) => a + duracionMin(p, ahora), 0),
    }
  })
}

export interface ResumenLineaParada {
  linea: string
  veces: number
  minutos: number
  /** minutos por clase, para el desglose de cada línea. */
  porClase: Record<ClaseParada, number>
}
export function minutosPorLinea(paradas: Parada[], ahora?: Date): ResumenLineaParada[] {
  const m = new Map<string, ResumenLineaParada>()
  for (const l of LINEAS_PARADAS) {
    m.set(l.codigo, { linea: l.codigo, veces: 0, minutos: 0, porClase: { PROGRAMADA: 0, NO_PROGRAMADA: 0, OCIOSO: 0 } })
  }
  for (const p of paradas) {
    const g = m.get(p.lineaCodigo) ?? {
      linea: p.lineaCodigo,
      veces: 0,
      minutos: 0,
      porClase: { PROGRAMADA: 0, NO_PROGRAMADA: 0, OCIOSO: 0 },
    }
    const min = duracionMin(p, ahora)
    g.veces += 1
    g.minutos += min
    g.porClase[p.clase] += min
    m.set(p.lineaCodigo, g)
  }
  return [...m.values()].sort((a, b) => a.linea.localeCompare(b.linea))
}

export interface GrupoTipo {
  codigo: string
  nombre: string
  clase: ClaseParada
  veces: number
  minutos: number
  /** suma del tiempo guía de las paradas de este tipo que SÍ tienen guía. */
  guiaMin: number
  /** minutos − guiaMin, contando solo las que tienen guía. null si ninguna la tiene. */
  desvioMin: number | null
  /** Solo cuando el agrupado distingue línea (porTipoYLinea) — undefined en porTipo()/porTipoPorFrecuencia(). */
  lineaCodigo?: string
}
/** Minutos + frecuencia + desvío por TIPO — "qué tipo pesa más y cuánto se pasa de su guía". */
export function porTipo(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  const m = new Map<string, GrupoTipo & { _conGuia: number }>()
  for (const p of paradas) {
    const clave = p.tipoCodigo ?? `OCIOSO:${p.tipoNombre}`
    const g = m.get(clave) ?? {
      codigo: clave,
      nombre: p.tipoNombre,
      clase: p.clase,
      veces: 0,
      minutos: 0,
      guiaMin: 0,
      desvioMin: null,
      _conGuia: 0,
    }
    const min = duracionMin(p, ahora)
    g.veces += 1
    g.minutos += min
    if (p.tiempoGuiaMin != null) {
      g.guiaMin += p.tiempoGuiaMin
      g._conGuia += min
    }
    m.set(clave, g)
  }
  return [...m.values()]
    .map(({ _conGuia, ...g }) => ({
      ...g,
      desvioMin: g.guiaMin > 0 || _conGuia > 0 ? _conGuia - g.guiaMin : null,
    }))
    .sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

/** Mismo agrupado de porTipo(), pero ordenado por CANTIDAD de veces en vez de minutos — "Top Paradas por Frecuencia". */
export function porTipoPorFrecuencia(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  return porTipo(paradas, ahora).sort((a, b) => b.veces - a.veces || b.minutos - a.minutos)
}

/**
 * Como porTipo(), pero agrupa por TIPO + LÍNEA (no solo tipo) — para los
 * rankings que mezclan las 3 líneas (Top Paradas por Frecuencia/Tiempo del
 * Panel): el mismo tipo puede repetirse una vez por línea, y cada fila
 * sabe de cuál línea es (`lineaCodigo`).
 */
export function porTipoYLinea(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  const m = new Map<string, GrupoTipo & { _conGuia: number }>()
  for (const p of paradas) {
    const clave = `${p.lineaCodigo}::${p.tipoCodigo ?? `OCIOSO:${p.tipoNombre}`}`
    const g = m.get(clave) ?? {
      codigo: clave,
      nombre: p.tipoNombre,
      clase: p.clase,
      lineaCodigo: p.lineaCodigo,
      veces: 0,
      minutos: 0,
      guiaMin: 0,
      desvioMin: null,
      _conGuia: 0,
    }
    const min = duracionMin(p, ahora)
    g.veces += 1
    g.minutos += min
    if (p.tiempoGuiaMin != null) {
      g.guiaMin += p.tiempoGuiaMin
      g._conGuia += min
    }
    m.set(clave, g)
  }
  return [...m.values()]
    .map(({ _conGuia, ...g }) => ({
      ...g,
      desvioMin: g.guiaMin > 0 || _conGuia > 0 ? _conGuia - g.guiaMin : null,
    }))
    .sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

/** Mismo agrupado de porTipoYLinea(), ordenado por CANTIDAD de veces — "Top Paradas por Frecuencia". */
export function porTipoYLineaPorFrecuencia(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  return porTipoYLinea(paradas, ahora).sort((a, b) => b.veces - a.veces || b.minutos - a.minutos)
}

// ------------------------------------------------------------
// Por sabor / familia / presentación — qué se estaba corriendo cuando
// pasó la parada (ver nota de `Parada`, más abajo del todo). Las que no
// tienen dato (CIP, orden y limpieza, liberación de vapor) quedan afuera.
// ------------------------------------------------------------

export interface GrupoAtributo {
  clave: string
  veces: number
  minutos: number
}

function agruparPorAtributo(paradas: Parada[], obtenerClave: (p: Parada) => string | null | undefined, ahora?: Date): GrupoAtributo[] {
  const m = new Map<string, GrupoAtributo>()
  for (const p of paradas) {
    const clave = obtenerClave(p)
    if (clave == null) continue
    const g = m.get(clave) ?? { clave, veces: 0, minutos: 0 }
    g.veces += 1
    g.minutos += duracionMin(p, ahora)
    m.set(clave, g)
  }
  return [...m.values()].sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

export function porSabor(paradas: Parada[], ahora?: Date): GrupoAtributo[] {
  return agruparPorAtributo(paradas, (p) => p.saborNombre, ahora)
}

export function porFamilia(paradas: Parada[], ahora?: Date): GrupoAtributo[] {
  return agruparPorAtributo(paradas, (p) => p.familiaNombre, ahora)
}

export function porPresentacion(paradas: Parada[], ahora?: Date): GrupoAtributo[] {
  return agruparPorAtributo(paradas, (p) => (p.presentacionMl != null ? `${p.presentacionMl} ml` : null), ahora)
}

const MINUTOS_POR_TURNO_APROX = 8 * 60

/**
 * Disponibilidad aproximada de un conjunto de paradas: 1 − (minutos
 * perdidos ÷ minutos planificados). `MINUTOS_POR_TURNO_APROX` asume 8h
 * parejas por turno — aproximación de FASE A′ para el Panel de Paradas;
 * se afina en FASE B′ contra la duración real de cada `turno_tipo`
 * (`horasTranscurridasTurno` en src/lib/reportes/index.ts ya hace eso
 * para un turno puntual, no para un rango).
 */
export function disponibilidadAprox(paradas: Parada[], cantidadTurnos: number, cantidadLineas: number, ahora?: Date): number {
  const planificados = cantidadTurnos * MINUTOS_POR_TURNO_APROX * cantidadLineas
  if (planificados <= 0) return 100
  const perdidos = paradas.reduce((a, p) => a + duracionMin(p, ahora), 0)
  return Math.max(0, Math.min(100, Math.round((1 - perdidos / planificados) * 100)))
}

export interface PuntoDiaParada {
  dia: string // 'YYYY-MM-DD'
  minutos: number
  veces: number
}
export function agruparPorDia(paradas: Parada[], ahora?: Date): PuntoDiaParada[] {
  const m = new Map<string, PuntoDiaParada>()
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
  linea?: string
  clase?: ClaseParada
}

/**
 * FASE A′: lee el fixture (todo el rango, se filtra en memoria).
 * FASE B′: pasa a `supabase.rpc("listar_paradas", {...})` — la firma y la
 * forma de `Parada` no cambian, así que las páginas no se tocan.
 */
export async function listarParadas(filtros: FiltrosParadas): Promise<Parada[]> {
  void supabase // FASE B′/C′
  const { paradasDemo } = await import("@/lib/paradasDemoFixture")
  return paradasDemo().filter((p) => {
    const dia = p.inicio.slice(0, 10)
    if (dia < filtros.desde || dia > filtros.hasta) return false
    if (filtros.linea && p.lineaCodigo !== filtros.linea) return false
    if (filtros.clase && p.clase !== filtros.clase) return false
    return true
  })
}
