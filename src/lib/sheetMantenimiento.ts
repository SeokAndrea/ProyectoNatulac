import { supabase } from "@/lib/supabase"
import type { TipoParada } from "@/lib/paradas"
import { catalogoParadas } from "@/lib/paradasCatalogo"
import { fechaPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Paradas de Mantenimiento desde su Google Sheet (plan-sheet-vacio-produccion.md,
 * sección 1; migración 20261108490000). El navegador lee la pestaña ÁREAS
 * como CSV (gviz responde con CORS), resuelve las fechas y propone el tipo
 * de cada equipo + subsistema; el servidor guarda cada reporte por su id.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

export const PESTANA_REPORTES = "ÁREAS"

/** Enlace del Sheet (cualquier forma: /edit, /view…) → CSV de la pestaña de reportes. null si no es un Sheet. */
export function urlCsvDelSheet(enlace: string, pestana = PESTANA_REPORTES): string | null {
  const id = enlace.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  return id ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(pestana)}` : null
}

/** CSV → filas (comillas dobles, comas y saltos de línea dentro de una celda). */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ""
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"') entreComillas = true
    else if (c === ",") {
      fila.push(celda)
      celda = ""
    } else if (c === "\n") {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ""
    } else if (c !== "\r") celda += c
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

// ------------------------------------------------------------
// Fechas: Mantenimiento a veces pone mal la fecha de inicio en el turno de
// noche ("8/10 23:17 → 07/10 23:37"). La hora y el DOWNTIME son confiables.
// ------------------------------------------------------------

/** 'YYYY-MM-DDTHH:MM:SS' (hora de planta) ↔ milisegundos, sin pasar por la zona del navegador. */
const aMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), +iso.slice(11, 13), +iso.slice(14, 16), +iso.slice(17, 19))
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 19)

/** "7/10/2026" → "2026-10-07". null si no se entiende. */
export function fechaSheet(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null
}

/** "4:36:00" o "4:36" → segundos desde las 00:00 (también sirve para DOWNTIME, que puede pasar de 24 h). */
export function horaSheet(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null
}

const conHora = (fecha: string, seg: number) => aIso(aMs(`${fecha}T00:00:00`) + seg * 1000)
const DIA = 24 * 3600 * 1000

/**
 * Inicio y fin reales de un reporte. `ahora`: 'YYYY-MM-DDTHH:MM:SS' de planta.
 * PENDIENTE en el Sheet es trabajo que quedó pendiente, NO la línea parada
 * (hay reportes pendientes de hace meses): cuenta 0 min (fin = inicio) hasta
 * que Mantenimiento lo finalice y entre con su duración real.
 * `corregida`: la fecha de inicio y la de cierre no cuadraban con el DOWNTIME y se eligió la que tiene sentido.
 */
export function resolverHoras(
  r: { fechaInicio: string; horaInicio: string; fechaCierre: string; horaCierre: string; downtime: string; pendiente: boolean },
  ahora: string,
): { inicio: string; fin: string | null; corregida: boolean } | null {
  const fi = fechaSheet(r.fechaInicio)
  const hi = horaSheet(r.horaInicio)
  if (!fi || hi === null) return null
  const ahoraMs = aMs(ahora)
  let iniA = aMs(conHora(fi, hi))
  // Un inicio en el futuro es la fecha mal puesta: fue el día anterior.
  const inicioFuturo = iniA > ahoraMs + 5 * 60000
  const hc = horaSheet(r.horaCierre)
  if (r.pendiente || hc === null) {
    if (inicioFuturo) iniA -= DIA
    return { inicio: aIso(iniA), fin: aIso(iniA), corregida: inicioFuturo }
  }

  const fc = fechaSheet(r.fechaCierre)
  const finB = fc ? aMs(conHora(fc, hc)) : null
  const durDowntime = horaSheet(r.downtime)
  const dur = (durDowntime ?? (((hc - hi) % 86400) + 86400) % 86400) * 1000

  const a = { ini: iniA, fin: iniA + dur }
  if (finB !== null && Math.abs(a.fin - finB) < 2 * 60000) return { inicio: aIso(a.ini), fin: aIso(a.fin), corregida: false }
  if (finB !== null && (inicioFuturo || a.fin > ahoraMs + 5 * 60000)) return { inicio: aIso(finB - dur), fin: aIso(finB), corregida: true }
  if (inicioFuturo) return { inicio: aIso(a.ini - DIA), fin: aIso(a.fin - DIA), corregida: true }
  return { inicio: aIso(a.ini), fin: aIso(a.fin), corregida: finB !== null }
}

// ------------------------------------------------------------
// Propuesta de tipo: equipo del Sheet → equipo del catálogo, y el
// subsistema → el tipo de ese equipo con el nombre más parecido. Sin
// parecido, la falla general del equipo. Se confirma en Equivalencias.
// ------------------------------------------------------------
const EQUIPOS: Record<string, string> = {
  A3CFLEX: "A3_COMPACT_FLEX",
  A3FLEX: "A3_FLEX",
  TAVIL: "ROBOT_TAVIL",
  "ROBOT TAVIL": "ROBOT_TAVIL",
  CBP32: "CARDBOARD_PACKER",
  FW32: "FILM_WRAPPER",
  HELIX: "HELIX",
  DOMINO: "DOMINO",
  CAP: "CAP_APPLICATOR",
  SA: "STRAW_APPLICATOR",
  FLEX: "FLEX_DRINK",
  DRINK: "FLEX_DRINK",
}
const VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "EN", "A", "POR", "CON", "FALLA", "UNIDAD", "SISTEMA"])
const palabras = (s: string) => normal(s).split(" ").filter((p) => p.length > 1 && !VACIAS.has(p))
/** Raíz para comparar: "PALETAS" y "PALET", "VACIAS" y "VACIO", "LLENAS" y "LLENO" coinciden. */
const raiz = (p: string) => (p.length >= 4 ? p.slice(0, 4) : p)

export function sugerirTipo(equipo: string, subsistema: string, tipos: TipoParada[]): string | null {
  const equipoCodigo = EQUIPOS[normal(equipo)]
  if (!equipoCodigo) return null
  const delEquipo = tipos.filter((t) => t.equipoCodigo === equipoCodigo)
  // "CBP-EMP-05 /EMPUJADOR" → "EMPUJADOR"
  const nombreSub = subsistema.includes("/") ? subsistema.slice(subsistema.indexOf("/") + 1) : subsistema
  const buscadas = palabras(nombreSub)
  let mejor: { codigo: string; puntaje: number } | null = null
  if (buscadas.length > 0) {
    for (const t of delEquipo) {
      const delTipo = new Set(palabras(t.nombre).map(raiz))
      const comunes = buscadas.filter((p) => delTipo.has(raiz(p))).length
      // Mismo puntaje: gana el tipo con menos palabras de sobra (el nombre más justo).
      const puntaje = comunes / buscadas.length - delTipo.size / 1000
      if (puntaje > (mejor?.puntaje ?? 0)) mejor = { codigo: t.codigo, puntaje }
    }
  }
  if (mejor && mejor.puntaje >= 0.49) return mejor.codigo
  if (delEquipo.length === 1) return delEquipo[0].codigo
  return delEquipo.find((t) => t.codigo.endsWith("_GENERAL"))?.codigo ?? null
}

// ------------------------------------------------------------
// Filas del Sheet → lo que recibe el servidor
// ------------------------------------------------------------
export interface FilaSheet {
  id: string
  area: string
  linea: string
  equipo: string
  subsistema: string
  falla: string
  estatus: string
  inicio: string
  fin: string | null
  tipo_sugerido: string | null
}

export function filasDelSheet(csv: string, tipos: TipoParada[], ahora: string): { filas: FilaSheet[]; corregidas: number; sinFecha: number } {
  const [cabecera, ...datos] = parsearCsv(csv)
  if (!cabecera) return { filas: [], corregidas: 0, sinFecha: 0 }
  const col = (nombre: string) => cabecera.findIndex((c) => normal(c).startsWith(nombre))
  const i = {
    id: col("IDNUMERO"),
    area: col("AREA"),
    linea: col("LINEA"),
    equipo: col("EQUIPO"),
    subsistema: col("CODIGO SUBSISTEMA"),
    estatus: col("ESTATUS"),
    falla: col("TIPO DE FALLA"),
    fechaInicio: col("FECHA DE INICIO"),
    horaInicio: col("HORA DE INICIO"),
    fechaCierre: col("FECHA DE CIERRE"),
    horaCierre: col("HORA DE CIERRE"),
    downtime: col("DOWNTIME"),
  }
  const v = (r: string[], k: keyof typeof i) => (i[k] >= 0 ? (r[i[k]] ?? "").trim() : "")
  const filas: FilaSheet[] = []
  let corregidas = 0
  let sinFecha = 0
  for (const r of datos) {
    if (!normal(v(r, "area")).startsWith("ASEPTICO") || !v(r, "id")) continue
    const pendiente = normal(v(r, "estatus")) === "PENDIENTE"
    const horas = resolverHoras(
      {
        fechaInicio: v(r, "fechaInicio"),
        horaInicio: v(r, "horaInicio"),
        fechaCierre: v(r, "fechaCierre"),
        horaCierre: v(r, "horaCierre"),
        downtime: v(r, "downtime"),
        pendiente,
      },
      ahora,
    )
    if (!horas) {
      sinFecha++
      continue
    }
    if (horas.corregida) corregidas++
    filas.push({
      id: v(r, "id"),
      area: v(r, "area"),
      linea: v(r, "linea"),
      equipo: v(r, "equipo"),
      subsistema: v(r, "subsistema"),
      falla: v(r, "falla"),
      estatus: v(r, "estatus"),
      inicio: horas.inicio,
      fin: horas.fin,
      tipo_sugerido: sugerirTipo(v(r, "equipo"), v(r, "subsistema"), tipos),
    })
  }
  return { filas, corregidas, sinFecha }
}

export interface ResumenSync {
  nuevas: number
  actualizadas: number
  sinCambios: number
  omitidas: number
  corregidas: number
}

/** Lee el Sheet y guarda las paradas de Aséptico. */
/** El CSV de la pestaña de reportes, con el enlace guardado. */
async function leerCsvSheet(): Promise<Resultado<string>> {
  const { data: enlace } = await supabase.rpc("obtener_configuracion", { p_clave: "sheet_mantenimiento_url" })
  const url = typeof enlace === "string" ? urlCsvDelSheet(enlace) : null
  if (!url) return { ok: false, error: "No hay un enlace del Sheet de Mantenimiento guardado." }
  let csv: string
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error()
    csv = await r.text()
  } catch {
    return { ok: false, error: "No se pudo leer el Sheet de Mantenimiento. Revisa que siga compartido con el enlace." }
  }
  if (csv.trimStart().startsWith("<")) return { ok: false, error: "El Sheet no está compartido: pide que lo compartan con «cualquiera con el enlace»." }
  return { ok: true, datos: csv }
}

/** Los reportes de Aséptico tal cual vienen del Sheet (con las fechas ya resueltas), sin guardar nada. */
export async function reportesDelSheet(): Promise<Resultado<FilaSheet[]>> {
  const csv = await leerCsvSheet()
  if (!csv.ok) return csv
  return { ok: true, datos: filasDelSheet(csv.datos, [], `${fechaPlanta()}T${horaPlanta()}`).filas }
}

export async function actualizarDesdeSheet(usuario: string): Promise<Resultado<ResumenSync>> {
  const lectura = await leerCsvSheet()
  if (!lectura.ok) return lectura
  const csv = lectura.datos
  const { filas, corregidas } = filasDelSheet(csv, (await catalogoParadas()).filter((t) => t.activo), `${fechaPlanta()}T${horaPlanta()}`)
  const { data, error } = await supabase.rpc("sincronizar_paradas_mantenimiento", { p_usuario: usuario, p_filas: filas })
  if (error) return { ok: false, error: error.message || "No se pudieron guardar las paradas." }
  const d = data as { nuevas: number; actualizadas: number; sin_cambios: number; omitidas: number }
  return { ok: true, datos: { nuevas: d.nuevas, actualizadas: d.actualizadas, sinCambios: d.sin_cambios, omitidas: d.omitidas, corregidas } }
}

/** El enlace del Sheet guardado (Edición de Datos), o null. */
export async function obtenerEnlaceSheet(): Promise<string | null> {
  const { data } = await supabase.rpc("obtener_configuracion", { p_clave: "sheet_mantenimiento_url" })
  return typeof data === "string" && data.trim() ? data : null
}

/** Guarda el enlace (solo el dueño, guardar_configuracion). */
export async function guardarEnlaceSheet(usuario: string, enlace: string): Promise<Resultado<null>> {
  if (!urlCsvDelSheet(enlace)) return { ok: false, error: "El enlace tiene que ser de un Google Sheet (https://docs.google.com/spreadsheets/…)." }
  const { error } = await supabase.rpc("guardar_configuracion", {
    p_usuario: usuario,
    p_clave: "sheet_mantenimiento_url",
    p_valor: enlace.trim(),
    p_pagina: "Edición de Datos",
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar el enlace." } : { ok: true, datos: null }
}

/** Lee el Sheet sin guardar nada: cuántos reportes de Aséptico trae. Para probar el enlace. */
export async function probarEnlaceSheet(enlace: string): Promise<Resultado<{ reportes: number; enCurso: number }>> {
  const url = urlCsvDelSheet(enlace)
  if (!url) return { ok: false, error: "El enlace tiene que ser de un Google Sheet." }
  try {
    const r = await fetch(url)
    const csv = await r.text()
    if (!r.ok || csv.trimStart().startsWith("<")) {
      return { ok: false, error: "No se pudo leer: el Sheet tiene que estar compartido con «cualquiera con el enlace» y tener la pestaña ÁREAS." }
    }
    const { filas } = filasDelSheet(csv, [], `${fechaPlanta()}T${horaPlanta()}`)
    return { ok: true, datos: { reportes: filas.length, enCurso: filas.filter((f) => !f.fin).length } }
  } catch {
    return { ok: false, error: "No se pudo leer el Sheet." }
  }
}

/** Fecha y hora de la última actualización (ISO), o null. */
export async function ultimaActualizacionSheet(): Promise<string | null> {
  const { data } = await supabase.rpc("obtener_configuracion", { p_clave: "sheet_mantenimiento_ultima_sync" })
  if (typeof data !== "string") return null
  try {
    return (JSON.parse(data) as { en?: string }).en ?? null
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// Equivalencias
// ------------------------------------------------------------
export interface Equivalencia {
  equipo: string
  subsistema: string
  reportes: number
  tipoCodigo: string | null
  confirmada: boolean
}

export async function listarEquivalencias(usuario: string): Promise<Resultado<Equivalencia[]>> {
  const { data, error } = await supabase.rpc("listar_equivalencias_mtto", { p_usuario: usuario })
  if (error) return { ok: false, error: error.message || "No se pudieron leer las equivalencias." }
  return {
    ok: true,
    datos: ((data ?? []) as { equipo: string; subsistema: string; reportes: number; tipo_codigo: string | null; confirmada: boolean }[]).map((f) => ({
      equipo: f.equipo,
      subsistema: f.subsistema,
      reportes: Number(f.reportes),
      tipoCodigo: f.tipo_codigo,
      confirmada: f.confirmada,
    })),
  }
}

export async function guardarEquivalencia(usuario: string, equipo: string, subsistema: string, tipoCodigo: string): Promise<Resultado<null>> {
  const { error } = await supabase.rpc("guardar_equivalencia_mtto", {
    p_usuario: usuario,
    p_equipo: equipo,
    p_subsistema: subsistema,
    p_tipo_codigo: tipoCodigo,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar." } : { ok: true, datos: null }
}
