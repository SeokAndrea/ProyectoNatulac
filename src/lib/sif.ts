import { useCallback, useEffect, useState } from "react"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
import { supabase } from "@/lib/supabase"
import { fechaPlanta, horaPlanta } from "@/lib/tiempoPlanta"

/*
 * Solicitudes de Falla (SIF), migraciones 20261109390000 y 20261111690000.
 * Las genera el servidor solo: a la 3.ª vez que el mismo código de parada se
 * repite en una línea en la jornada (7:00 → 7:00) nace una de Inspección
 * (solo aviso; Mantenimiento la marca revisada) y a la 4.ª esa misma sube a
 * Intervención. Mantenimiento (SIF_GESTIONAR) asigna el responsable y la
 * cierra; el resto la ve.
 */

export const RUTA_SIF = "/solicitudes-intervencion"

export type EstadoSif = "INSPECCION" | "REVISADA" | "PENDIENTE" | "EN_REPARACION" | "CERRADA"

export const NOMBRE_ESTADO_SIF: Record<EstadoSif, string> = {
  INSPECCION: "Inspección",
  REVISADA: "Inspección revisada",
  PENDIENTE: "Intervención pendiente",
  EN_REPARACION: "En reparación",
  CERRADA: "Cerrada",
}

/** Inspección (3.ª falla) o Intervención (4.ª, o la que volvió tras cerrar). */
export function esInspeccion(estado: EstadoSif): boolean {
  return estado === "INSPECCION" || estado === "REVISADA"
}

/** "Solicitud de Inspección" / "Solicitud de Intervención". */
export function nombreSolicitud(estado: EstadoSif): string {
  return esInspeccion(estado) ? "Solicitud de Inspección" : "Solicitud de Intervención"
}

/** Ya no espera nada: revisada o cerrada. */
export function sifTerminada(estado: EstadoSif): boolean {
  return estado === "REVISADA" || estado === "CERRADA"
}

export interface Sif {
  id: string
  codigo: string
  fechaJornada: string
  estado: EstadoSif
  generadaEn: string
  /** Cuando la Inspección pasó a Intervención (null si sigue siendo Inspección o nació como Intervención). */
  escaladaEn: string | null
  revisadaEn: string | null
  revisadaPor: string | null
  /** Nota de Mantenimiento al marcarla revisada. */
  revision: string | null
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
/** Una lectura que puede fallar: sin esto, una caída de la red se veía como "no hay nada". */
export type Lectura<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Texto para mostrar de un error de la base. Los de las reglas ya vienen en
 * español y dicen qué hacer ("La solicitud ya no está pendiente. Recarga la
 * pantalla."); los de red o técnicos se cambian por uno que se entienda.
 */
export function mensajeErrorSif(mensaje: string | null | undefined): string {
  const m = mensaje ?? ""
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return "No hay conexión con el servidor. Revisa la red e intenta de nuevo."
  }
  if (!m || /PGRST|violates|duplicate key|syntax error|does not exist|column|relation|function/i.test(m)) {
    return "No se pudo completar. Intenta de nuevo; si sigue pasando, avisa a la administración."
  }
  return m
}

/** El error pide volver a cargar (otra persona ya la cambió). */
export function errorDesactualizado(mensaje: string): boolean {
  return /recarga la pantalla/i.test(mensaje)
}

interface FilaSif {
  sif_id: string
  codigo: string
  fecha_jornada: string
  estado: EstadoSif
  generada_en: string
  escalada_en: string | null
  revisada_en: string | null
  revisada_por: string | null
  revision: string | null
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

/** Las abiertas y las últimas `cerradas` terminadas. */
export async function listarSif(usuario: string, cerradas = 100): Promise<Lectura<Sif[]>> {
  const { data, error } = await supabase.rpc("listar_sif", { p_usuario: usuario, p_cerradas: cerradas })
  if (error || !data) return { ok: false, error: mensajeErrorSif(error?.message) }
  const lista: Sif[] = (data as FilaSif[]).map((f) => ({
    id: f.sif_id,
    codigo: f.codigo,
    fechaJornada: f.fecha_jornada,
    estado: f.estado,
    generadaEn: f.generada_en,
    escaladaEn: f.escalada_en,
    revisadaEn: f.revisada_en,
    revisadaPor: f.revisada_por,
    revision: f.revision,
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
  return { ok: true, data: lista }
}

export async function listarFallasSif(usuario: string, sifId: string): Promise<Lectura<FallaSif[]>> {
  const { data, error } = await supabase.rpc("listar_paradas_sif", { p_usuario: usuario, p_sif_id: sifId })
  if (error || !data) return { ok: false, error: mensajeErrorSif(error?.message) }
  const fallas: FallaSif[] = (data as FilaFalla[]).map((f) => ({
    id: f.parada_id,
    inicio: f.inicio,
    fin: f.fin,
    origen: f.origen === "SHEET" ? "Mantenimiento" : "Producción",
    equipo: f.equipo,
    subsistema: f.subsistema,
    registro: f.registro,
  }))
  return { ok: true, data: fallas }
}

export async function listarSupervisoresEntrega(usuario: string, sifId: string): Promise<Lectura<SupervisorEntrega[]>> {
  const { data, error } = await supabase.rpc("listar_supervisores_entrega_sif", { p_usuario: usuario, p_sif_id: sifId })
  if (error || !data) return { ok: false, error: mensajeErrorSif(error?.message) }
  return { ok: true, data: (data as { nombre: string; turno_codigo: string }[]).map((f) => ({ nombre: f.nombre, turnoCodigo: f.turno_codigo })) }
}

export async function asignarResponsableSif(usuario: string, sifId: string, responsable: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("asignar_responsable_sif", {
    p_usuario: usuario,
    p_sif_id: sifId,
    p_responsable: responsable,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: mensajeErrorSif(error.message) } : { ok: true }
}

export async function marcarRevisadaSif(usuario: string, sifId: string, revision: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("marcar_revisada_sif", {
    p_usuario: usuario,
    p_sif_id: sifId,
    p_revision: revision,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: mensajeErrorSif(error.message) } : { ok: true }
}

export async function cerrarSif(usuario: string, sifId: string, trabajo: string, entregadaA: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("cerrar_sif", {
    p_usuario: usuario,
    p_sif_id: sifId,
    p_trabajo: trabajo,
    p_entregada_a: entregadaA,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: mensajeErrorSif(error.message) } : { ok: true }
}

/** "09/10/2026 14:05" en hora de planta. */
export function fechaHoraSif(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const [a, m, dia] = fechaPlanta(d).split("-")
  return `${dia}/${m}/${a} ${horaPlanta(d).slice(0, 5)}`
}

export interface PasoSif {
  titulo: string
  valor: string
  hecho: boolean
  actual: boolean
}

/** Los pasos con sus horas: Inspección → Revisada, o (Inspección → Revisada →) Intervención → Inicio de reparación → Cerrada. */
export function pasosSif(sif: Sif): PasoSif[] {
  const inspeccion: PasoSif = { titulo: "Inspección", valor: fechaHoraSif(sif.generadaEn), hecho: true, actual: false }
  const revisada: PasoSif = {
    titulo: "Revisada",
    valor: sif.revisadaEn ? fechaHoraSif(sif.revisadaEn) : "Al marcarla revisada",
    hecho: !!sif.revisadaEn,
    actual: sif.estado === "INSPECCION",
  }
  if (esInspeccion(sif.estado)) return [inspeccion, revisada]

  const antes: PasoSif[] = sif.escaladaEn
    ? [
        inspeccion,
        ...(sif.revisadaEn ? [revisada] : []),
        { titulo: "Pasó a intervención", valor: fechaHoraSif(sif.escaladaEn), hecho: true, actual: false },
      ]
    : [{ titulo: "Generada", valor: fechaHoraSif(sif.generadaEn), hecho: true, actual: false }]
  return [
    ...antes,
    {
      titulo: "Inicio de reparación",
      valor: sif.inicioReparacion ? fechaHoraSif(sif.inicioReparacion) : "Al guardar el responsable",
      hecho: !!sif.inicioReparacion,
      actual: sif.estado === "PENDIENTE",
    },
    { titulo: "Cerrada", valor: sif.cierre ? fechaHoraSif(sif.cierre) : "Al cerrar la solicitud", hecho: !!sif.cierre, actual: sif.estado === "EN_REPARACION" },
  ]
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

/** Cada cuánto se revisan las SIF pendientes (aviso de arriba). */
const REFRESCO_PENDIENTES_MS = 2 * 60 * 1000

/** Lo que espera a Mantenimiento: Intervenciones sin responsable y luego Inspecciones sin revisar. */
export function sifPorAtender(lista: Sif[]): Sif[] {
  return [...lista.filter((s) => s.estado === "PENDIENTE"), ...lista.filter((s) => s.estado === "INSPECCION")]
}

/** "1 solicitud de intervención pendiente" / "2 solicitudes de inspección por revisar" / las dos juntas. */
export function textoPorAtender(lista: Sif[]): string {
  const intervenciones = lista.filter((s) => s.estado === "PENDIENTE").length
  const inspecciones = lista.filter((s) => s.estado === "INSPECCION").length
  const solicitudes = (n: number) => (n === 1 ? "1 solicitud" : `${n} solicitudes`)
  if (intervenciones > 0 && inspecciones > 0) {
    return `${solicitudes(intervenciones)} de intervención y ${inspecciones} de inspección por atender`
  }
  if (intervenciones > 0) return `${solicitudes(intervenciones)} de intervención ${intervenciones === 1 ? "pendiente" : "pendientes"}`
  return `${solicitudes(inspecciones)} de inspección por revisar`
}

/** SIF por atender, refrescadas cada 2 min. Solo pide si `activo` (quien gestiona SIF). */
export function useSifPendientes(usuario: string | null, activo: boolean): Sif[] {
  const [pendientes, setPendientes] = useState<Sif[]>([])

  const cargar = useCallback(async () => {
    if (!usuario || !activo) return
    const r = await listarSif(usuario, 0)
    // Si falla, queda el aviso que había: que se caiga la red no significa que ya no haya pendientes.
    if (r.ok) setPendientes(sifPorAtender(r.data))
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
