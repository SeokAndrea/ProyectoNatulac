import { useEffect, useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"
import type { LineaDeTipo } from "@/lib/paradas"

/*
 * Catálogo de EQUIPOS (tabla `paradas_equipos`, migraciones 20261063/64). Cada
 * falla No programada pertenece a un equipo (paradas_tipos.equipo_id) y cada
 * equipo existe solo en algunas líneas — por área: la Línea 1 de Aséptico y la
 * de Vacío no comparten equipos. Solo el SUPERADMINISTRADOR edita; el
 * supervisor solo ve las fallas de los equipos de su línea.
 */

/** Una línea concreta: área + código (LINEA_1/2/3). */
export interface LineaDeEquipo {
  area: string
  linea: string
  /** Presentaciones (ml) en que existe en esa línea (ej. Cap en la Línea 3 solo con 330). Vacío o ausente = todas. */
  presentaciones?: number[] | null
}

/** "330, 500" → [330, 500]. */
export const parsearPresentaciones = (texto: string): number[] =>
  texto
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)

/** ¿La fila aplica con esa presentación? Sin presentación conocida (línea sin corrida activa) no se filtra. */
const aplicaPresentacion = (filas: number[] | null | undefined, presentacionMl: number | null | undefined) =>
  !filas || filas.length === 0 || presentacionMl == null || filas.includes(presentacionMl)

export interface EquipoParada {
  codigo: string
  nombre: string
  activo: boolean
  lineas: LineaDeEquipo[]
}

/** Áreas de producción y sus 3 líneas, para asignar equipos. */
export const AREAS_EQUIPOS = [
  { codigo: "ASEPTICO", nombre: "Aséptico" },
  { codigo: "VACIO", nombre: "Vacío" },
] as const
export const LINEAS_EQUIPOS = ["LINEA_1", "LINEA_2", "LINEA_3"] as const

export const nombreLinea = (codigo: string) => `Línea ${codigo.replace(/^LINEA_T?/, "")}`

const SIN_CARGAR: EquipoParada[] = []

let cache: EquipoParada[] | null = null
let errorCarga: string | null = null
let cargando = false
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach((f) => f())

export async function recargarEquipos(): Promise<void> {
  cargando = true
  const { data, error } = await supabase.rpc("listar_paradas_equipos")
  cargando = false
  if (error || !Array.isArray(data)) {
    errorCarga = "No se pudo leer el catálogo de equipos."
    cache = []
  } else {
    errorCarga = null
    cache = data as EquipoParada[]
  }
  avisar()
}

const suscribir = (f: () => void) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/** Todos los equipos (activos e inactivos), reactivo. Vacío mientras carga. */
export function useEquiposParadas(): EquipoParada[] {
  useEffect(() => {
    if (cache === null && !cargando) void recargarEquipos()
  }, [])
  return useSyncExternalStore(
    suscribir,
    () => cache ?? SIN_CARGAR,
    () => SIN_CARGAR,
  )
}

export function useErrorEquipos(): string | null {
  return useSyncExternalStore(
    suscribir,
    () => errorCarga,
    () => null,
  )
}

/**
 * Equipos activos de una línea. `area` = área del usuario (ASEPTICO / VACIO);
 * el Área de Pruebas (o sin área) ve todos, igual que el servidor.
 */
export function equiposDeLinea(
  equipos: EquipoParada[],
  area: string | null | undefined,
  lineaCodigo: string,
  presentacionMl?: number | null,
): EquipoParada[] {
  const numero = lineaCodigo.replace(/^LINEA_T?/, "")
  const activos = equipos.filter((e) => e.activo)
  if (!area || area === "PRUEBAS") return activos
  return activos.filter((e) =>
    e.lineas.some((l) => l.area === area && l.linea.replace(/^LINEA_T?/, "") === numero && aplicaPresentacion(l.presentaciones, presentacionMl)),
  )
}

export interface DatosEquipo {
  codigo: string
  nombre: string
  lineas: LineaDeEquipo[]
}

/** Crea (sin `codigoOriginal`) o edita un equipo. Devuelve el mensaje de error, o null si salió bien. */
export async function guardarEquipo(
  usuario: string,
  datos: DatosEquipo,
  codigoOriginal: string | undefined,
  pagina: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("guardar_parada_equipo", {
    p_usuario: usuario,
    p_codigo_original: codigoOriginal ?? null,
    p_codigo: datos.codigo,
    p_nombre: datos.nombre,
    p_lineas: datos.lineas,
    p_pagina: pagina,
  })
  if (error) return error.message || "No se pudo guardar el equipo. Intenta de nuevo."
  await recargarEquipos()
  return null
}

/** Activa o desactiva un equipo. Devuelve el mensaje de error, o null si salió bien. */
export async function cambiarActivoEquipo(usuario: string, codigo: string, activo: boolean, pagina: string): Promise<string | null> {
  const { error } = await supabase.rpc("cambiar_activo_parada_equipo", {
    p_usuario: usuario,
    p_codigo: codigo,
    p_activo: activo,
    p_pagina: pagina,
  })
  if (error) return error.message || "No se pudo cambiar el estado. Intenta de nuevo."
  await recargarEquipos()
  return null
}

/** 'Cambio de Bomba' → 'CAMBIO_DE_BOMBA' */
export const codigoDesdeNombreEquipo = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

/**
 * Filtra los tipos del catálogo a los que aplican en una línea: los que no
 * pertenecen a un equipo aplican siempre; los de un equipo, solo si el equipo
 * está activo y asignado a esa línea (el Área de Pruebas ve todos).
 */
export function tiposDeLinea<T extends { equipoCodigo?: string | null; lineas?: LineaDeTipo[] }>(
  tipos: T[],
  equipos: EquipoParada[],
  area: string | null | undefined,
  lineaCodigo: string,
  presentacionMl?: number | null,
): T[] {
  const numero = lineaCodigo.replace(/^LINEA_T?/, "")
  const disponibles = new Set(equiposDeLinea(equipos, area, lineaCodigo, presentacionMl).map((e) => e.codigo))
  return tipos.filter((t) => {
    if (t.equipoCodigo && !disponibles.has(t.equipoCodigo)) return false
    // Un tipo con líneas en el área del usuario existe solo en ellas (el Área de Pruebas ve todos).
    if (area && area !== "PRUEBAS") {
      const delArea = (t.lineas ?? []).filter((l) => l.area === area)
      if (
        delArea.length > 0 &&
        !delArea.some((l) => l.linea.replace(/^LINEA_T?/, "") === numero && aplicaPresentacion(l.presentaciones, presentacionMl))
      ) {
        return false
      }
    }
    return true
  })
}
