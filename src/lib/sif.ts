import { useCallback, useEffect, useState } from "react"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { supabase } from "@/lib/supabase"
import { fechaPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Solicitudes de Intervención de Falla (SIF), migración 20261109390000.
 * Las genera el servidor solo, cuando el mismo código de parada se repite 3
 * veces en una línea en la jornada (7:00 → 7:00). Mantenimiento
 * (SIF_GESTIONAR) asigna el responsable y la cierra; el resto la ve.
 */

export const RUTA_SIF = "/solicitudes-intervencion"

export type EstadoSif = "PENDIENTE" | "EN_REPARACION" | "CERRADA"

export const NOMBRE_ESTADO_SIF: Record<EstadoSif, string> = {
  PENDIENTE: "Pendiente",
  EN_REPARACION: "En reparación",
  CERRADA: "Cerrada",
}

export interface Sif {
  id: string
  codigo: string
  fechaJornada: string
  estado: EstadoSif
  generadaEn: string
  responsable: string | null
  inicioReparacion: string | null
  trabajoRealizado: string | null
  entregadaA: string | null
  cierre: string | null
  lineaCodigo: string
  lineaNombre: string
  areaNombre: string
  tipoCodigo: string
  tipoNombre: string
  equipoNombre: string | null
  fallas: number
}

export interface FallaSif {
  id: string
  inicio: string
  fin: string | null
  /** Quién la cargó: Producción (en la app) o Mantenimiento (su Sheet). */
  origen: "Producción" | "Mantenimiento"
  equipo: string | null
  subsistema: string | null
  registro: string | null
}

export interface SupervisorEntrega {
  nombre: string
  turnoCodigo: string
}

type Resultado = { ok: true } | { ok: false; error: string }

interface FilaSif {
  sif_id: string
  codigo: string
  fecha_jornada: string
  estado: EstadoSif
  generada_en: string
  responsable: string | null
  inicio_reparacion: string | null
  trabajo_realizado: string | null
  entregada_a: string | null
  cierre: string | null
  linea_codigo: string
  linea_nombre: string
  area_nombre: string
  tipo_codigo: string
  tipo_nombre: string
  equipo_nombre: string | null
  fallas: number
}

interface FilaFalla {
  parada_id: string
  inicio: string
  fin: string | null
  origen: string
  equipo: string | null
  subsistema: string | null
  registro: string | null
}

/** Las abiertas y las últimas `cerradas` cerradas. */
export async function listarSif(usuario: string, cerradas = 100): Promise<Sif[]> {
  const { data, error } = await supabase.rpc("listar_sif", { p_usuario: usuario, p_cerradas: cerradas })
  if (error || !data) return []
  return (data as FilaSif[]).map((f) => ({
    id: f.sif_id,
    codigo: f.codigo,
    fechaJornada: f.fecha_jornada,
    estado: f.estado,
    generadaEn: f.generada_en,
    responsable: f.responsable,
    inicioReparacion: f.inicio_reparacion,
    trabajoRealizado: f.trabajo_realizado,
    entregadaA: f.entregada_a,
    cierre: f.cierre,
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    areaNombre: f.area_nombre,
    tipoCodigo: f.tipo_codigo,
    tipoNombre: f.tipo_nombre,
    equipoNombre: f.equipo_nombre,
    fallas: f.fallas,
  }))
}

export async function listarFallasSif(usuario: string, sifId: string): Promise<FallaSif[]> {
  const { data, error } = await supabase.rpc("listar_paradas_sif", { p_usuario: usuario, p_sif_id: sifId })
  if (error || !data) return []
  return (data as FilaFalla[]).map((f) => ({
    id: f.parada_id,
    inicio: f.inicio,
    fin: f.fin,
    origen: f.origen === "SHEET" ? "Mantenimiento" : "Producción",
    equipo: f.equipo,
    subsistema: f.subsistema,
    registro: f.registro,
  }))
}

export async function listarSupervisoresEntrega(usuario: string, sifId: string): Promise<SupervisorEntrega[]> {
  const { data, error } = await supabase.rpc("listar_supervisores_entrega_sif", { p_usuario: usuario, p_sif_id: sifId })
  if (error || !data) return []
  return (data as { nombre: string; turno_codigo: string }[]).map((f) => ({ nombre: f.nombre, turnoCodigo: f.turno_codigo }))
}

export async function asignarResponsableSif(usuario: string, sifId: string, responsable: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("asignar_responsable_sif", {
    p_usuario: usuario,
    p_sif_id: sifId,
    p_responsable: responsable,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function cerrarSif(usuario: string, sifId: string, trabajo: string, entregadaA: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("cerrar_sif", {
    p_usuario: usuario,
    p_sif_id: sifId,
    p_trabajo: trabajo,
    p_entregada_a: entregadaA,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** "09/10/2026 14:05" en hora de planta. */
export function fechaHoraSif(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const [a, m, dia] = fechaPlanta(d).split("-")
  return `${dia}/${m}/${a} ${horaPlanta(d).slice(0, 5)}`
}

/** Minutos entre dos instantes (null si falta alguno). */
export function minutosEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null
  return Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000))
}

/** "18 min" / "2 h 05 min". */
export function textoDuracion(min: number | null): string {
  if (min === null) return "—"
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`
}

/** Cada cuánto se revisan las SIF pendientes (aviso grande de Mantenimiento). */
const REFRESCO_PENDIENTES_MS = 2 * 60 * 1000

/** SIF pendientes, refrescadas cada 2 min. Solo pide si `activo` (quien gestiona SIF). */
export function useSifPendientes(usuario: string | null, activo: boolean): Sif[] {
  const [pendientes, setPendientes] = useState<Sif[]>([])

  const cargar = useCallback(async () => {
    if (!usuario || !activo) return
    const lista = await listarSif(usuario, 0)
    setPendientes(lista.filter((s) => s.estado === "PENDIENTE"))
  }, [usuario, activo])

  useEffect(() => {
    void cargar()
    if (!usuario || !activo) return
    const id = setInterval(() => void cargar(), REFRESCO_PENDIENTES_MS)
    return () => clearInterval(id)
  }, [cargar, usuario, activo])

  return activo ? pendientes : []
}

/** Código de planilla de la falla (ej. CPL2-6). Si el catálogo de paradas aún no cargó, el código del tipo. */
export function codigoParadaSif(sif: Pick<Sif, "tipoCodigo" | "lineaCodigo">): string {
  return codigoDeParadaLive({ tipoCodigo: sif.tipoCodigo, lineaCodigo: sif.lineaCodigo }) ?? sif.tipoCodigo
}
