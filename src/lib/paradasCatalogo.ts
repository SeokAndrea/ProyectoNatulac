import { useEffect, useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"
import { CATALOGO_TIPOS, codigoPlanilla, listarParadas, type FamiliaParada, type LineaDeTipo, type Parada, type TipoParada } from "@/lib/paradas"

/*
 * Catálogo de tipos de parada EDITABLE. Vive en la tabla `paradas_tipos`
 * (migración 20261061): se lee con `listar_paradas_tipos` y solo el
 * SUPERADMINISTRADOR lo modifica (`guardar_parada_tipo`,
 * `cambiar_activo_parada_tipo`, ambas con auditoría). Si la lectura falla
 * (ej. migración sin aplicar) se usa el seed de `CATALOGO_TIPOS` y se
 * avisa con `useErrorCatalogo()`.
 */

export interface TipoParadaEditable extends TipoParada {
  activo: boolean
}

interface FilaTipo {
  codigo: string
  nombre: string
  clase: TipoParada["clase"]
  familia: FamiliaParada
  equipo_codigo: string | null
  tiempo_guia_min: number | null
  prefijo_planilla: string
  secuencia_planilla: number | null
  codigo_con_linea: boolean
  activo: boolean
  lineas?: LineaDeTipo[] | null
}

const SIN_CARGAR: TipoParadaEditable[] = []

const semilla = (): TipoParadaEditable[] => CATALOGO_TIPOS.map((t) => ({ ...t, activo: true }))

let cache: TipoParadaEditable[] | null = null
let errorCarga: string | null = null
let cargando = false
const oyentes = new Set<() => void>()

const avisar = () => oyentes.forEach((f) => f())

export async function recargarCatalogo(): Promise<void> {
  cargando = true
  const { data, error } = await supabase.rpc("listar_paradas_tipos")
  cargando = false
  if (error || !data) {
    errorCarga = "No se pudo leer el catálogo de paradas. Se muestra el listado inicial."
    cache = semilla()
  } else {
    errorCarga = null
    cache = (data as FilaTipo[]).map((f) => ({
      codigo: f.codigo,
      nombre: f.nombre,
      clase: f.clase,
      familia: f.familia,
      equipoCodigo: f.equipo_codigo,
      codigoConLinea: f.codigo_con_linea,
      lineas: f.lineas ?? [],
      tiempoGuiaMin: f.tiempo_guia_min != null ? Number(f.tiempo_guia_min) : null,
      prefijoPlanilla: f.prefijo_planilla,
      secuenciaPlanilla: f.secuencia_planilla,
      activo: f.activo,
    }))
  }
  avisar()
}

const suscribir = (f: () => void) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/** Catálogo completo (activos e inactivos), reactivo. Vacío mientras carga. */
export function useCatalogoParadas(): TipoParadaEditable[] {
  useEffect(() => {
    if (cache === null && !cargando) void recargarCatalogo()
  }, [])
  return useSyncExternalStore(
    suscribir,
    () => cache ?? SIN_CARGAR,
    () => SIN_CARGAR,
  )
}

/** Solo los activos — lo que ofrece el Registro de Paradas. */
export function useTiposActivos(): TipoParadaEditable[] {
  const todos = useCatalogoParadas()
  return todos.filter((t) => t.activo)
}

/** Mensaje si la última lectura del catálogo falló; null si todo bien. */
export function useErrorCatalogo(): string | null {
  return useSyncExternalStore(
    suscribir,
    () => errorCarga,
    () => null,
  )
}

/** Crea (sin `codigoOriginal`) o edita un tipo. Devuelve el mensaje de error, o null si salió bien. */
export async function guardarTipo(
  usuario: string,
  tipo: TipoParadaEditable,
  codigoOriginal: string | undefined,
  pagina: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("guardar_parada_tipo", {
    p_usuario: usuario,
    p_codigo_original: codigoOriginal ?? null,
    p_codigo: tipo.codigo,
    p_nombre: tipo.nombre,
    p_familia: tipo.familia,
    p_equipo_codigo: tipo.equipoCodigo ?? null,
    p_tiempo_guia_min: tipo.clase === "PROGRAMADA" ? tipo.tiempoGuiaMin : null,
    p_prefijo_planilla: tipo.prefijoPlanilla,
    p_secuencia_planilla: tipo.secuenciaPlanilla,
    p_codigo_con_linea: tipo.codigoConLinea ?? true,
    p_lineas: tipo.lineas ?? [],
    p_pagina: pagina,
  })
  if (error) return error.message || "No se pudo guardar el tipo. Intenta de nuevo."
  await recargarCatalogo()
  return null
}

/** Activa o desactiva un tipo. Devuelve el mensaje de error, o null si salió bien. */
export async function cambiarActivo(usuario: string, codigo: string, activo: boolean, pagina: string): Promise<string | null> {
  const { error } = await supabase.rpc("cambiar_activo_parada_tipo", {
    p_usuario: usuario,
    p_codigo: codigo,
    p_activo: activo,
    p_pagina: pagina,
  })
  if (error) return error.message || "No se pudo cambiar el estado. Intenta de nuevo."
  await recargarCatalogo()
  return null
}

/**
 * Código de planilla de una parada ya registrada, con el catálogo cargado (incluye
 * los tipos creados después del seed). null si no tiene tipo (Ocioso libre) o el
 * catálogo aún no cargó — quien lo use debería llamar antes a `useCatalogoParadas()`.
 */
export function codigoDeParadaLive(p: Pick<Parada, "tipoCodigo" | "lineaCodigo">): string | null {
  if (!p.tipoCodigo) return null
  const tipo = (cache ?? []).find((t) => t.codigo === p.tipoCodigo)
  return tipo ? codigoPlanilla(tipo, p.lineaCodigo) : null // sin área: se empareja por número de línea
}

/**
 * Paradas de un turno, con el catálogo ya cargado para poder mostrar su código
 * (`codigoDeParadaLive`). Es lo que consume el Acta y el resumen de Finalizar Turno.
 */
export async function cargarParadasDelTurno(turnoId: string): Promise<Parada[]> {
  if (cache === null) await recargarCatalogo()
  return listarParadas({ desde: "2000-01-01", hasta: "2999-12-31", turnoId })
}

/** null si el tipo es válido; si no, el mensaje de error (el servidor valida de nuevo). */
export function validarTipo(t: TipoParadaEditable, codigoOriginal?: string): string | null {
  if (!t.nombre.trim()) return "El nombre es obligatorio."
  if (!t.codigo.trim()) return "El código interno es obligatorio."
  if (t.clase !== "OCIOSO" && !t.prefijoPlanilla.trim()) return "El prefijo de planilla es obligatorio."
  if (t.clase === "PROGRAMADA" && t.tiempoGuiaMin != null && (!Number.isFinite(t.tiempoGuiaMin) || t.tiempoGuiaMin <= 0)) {
    return "El tiempo guía debe ser mayor que 0 (o dejarlo vacío)."
  }
  if ((cache ?? []).some((x) => x.codigo === t.codigo && x.codigo !== (codigoOriginal ?? null))) {
    return "Ya existe un tipo con ese código interno."
  }
  return null
}
