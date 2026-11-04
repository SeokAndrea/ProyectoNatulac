import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/*
 * Robot Tavil: el operador cuenta las paletas que salen del robot («+» y «−»
 * por línea) y escribe el Resto de la corrida. Es una PRECARGA: el supervisor
 * la ve en la tarjeta de Producto Terminado y la confirma o la corrige con el
 * registro de PT de siempre. Las reglas viven en la base (migración
 * 20261114690000): qué corrida cuenta cada línea, cuándo se bloquea y cuándo
 * pide «Iniciar con el lote». Ver
 * docs/superpowers/specs/2026-11-04-operador-robot-tavil-design.md.
 */

export type Lectura<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * EN_CURSO: cuenta en su corrida. LOTE_NUEVO: el supervisor cargó otro lote
 * (hay que tocar Iniciar). ENTREGADA: la línea pasó al turno siguiente, que
 * todavía no abrió. TERMINADA: la corrida se cerró y no hay lote nuevo.
 */
export type EstadoLineaRobot = "EN_CURSO" | "LOTE_NUEVO" | "ENTREGADA" | "TERMINADA"

export interface CorridaRobot {
  id: string
  lote: string | null
  saborNombre: string | null
  presentacionMl: number | null
  paletas: number
  ultimaPaletaEn: string | null
  resto: number
  entregada: boolean
}

export interface LineaRobot {
  lineaCodigo: string
  lineaNombre: string
  estado: EstadoLineaRobot
  /** Se puede tocar «+» (y «−»). */
  puedeSumar: boolean
  corrida: CorridaRobot
  /** Paletas que salieron con la línea entregada, todavía sin corrida. */
  sinCorrida: number
  /** El lote que cargó el supervisor (solo en LOTE_NUEVO). */
  nueva: CorridaRobot | null
  /** El lote anterior, mientras la corrida nueva no tenga paletas. */
  anterior: CorridaRobot | null
}

/** Lo que cargó el operador en una corrida, para la tarjeta de Producto Terminado. */
export interface PrecargaRobot {
  corridaId: string
  paletas: number
  ultimaPaletaEn: string | null
  ultimaPaletaPor: string | null
  /** null = el operador no escribió Resto. */
  resto: number | null
  restoEn: string | null
  restoPor: string | null
}

interface FilaCorridaRobot {
  id: string
  lote: string | null
  sabor_nombre: string | null
  presentacion_volumen_ml: number | null
  paletas: number | string
  ultima_paleta_en: string | null
  resto: number | string | null
  entregada: boolean
}

interface FilaLineaRobot {
  linea_codigo: string
  linea_nombre: string
  estado: EstadoLineaRobot
  puede_sumar: boolean
  corrida: FilaCorridaRobot
  sin_corrida: number | string | null
  nueva: FilaCorridaRobot | null
  anterior: FilaCorridaRobot | null
}

interface FilaPrecarga {
  turno_linea_id: string
  paletas: number | string
  ultima_paleta_en: string | null
  ultima_paleta_por: string | null
  resto: number | string | null
  resto_en: string | null
  resto_por: string | null
}

function mapearCorrida(f: FilaCorridaRobot): CorridaRobot {
  return {
    id: f.id,
    lote: f.lote,
    saborNombre: f.sabor_nombre,
    presentacionMl: f.presentacion_volumen_ml,
    paletas: Number(f.paletas) || 0,
    ultimaPaletaEn: f.ultima_paleta_en,
    resto: Number(f.resto) || 0,
    entregada: f.entregada,
  }
}

/** Lo que devuelven robot_tavil_estado y las acciones del operador → líneas de la pantalla. */
export function mapearPantallaRobot(data: unknown): LineaRobot[] {
  const filas = ((data as { lineas?: FilaLineaRobot[] } | null)?.lineas ?? []) as FilaLineaRobot[]
  return filas.map((f) => ({
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    estado: f.estado,
    puedeSumar: f.puede_sumar,
    corrida: mapearCorrida(f.corrida),
    sinCorrida: Number(f.sin_corrida) || 0,
    nueva: f.nueva ? mapearCorrida(f.nueva) : null,
    anterior: f.anterior ? mapearCorrida(f.anterior) : null,
  }))
}

export function mapearPrecargas(data: unknown): PrecargaRobot[] {
  return ((data as FilaPrecarga[] | null) ?? []).map((f) => ({
    corridaId: f.turno_linea_id,
    paletas: Number(f.paletas) || 0,
    ultimaPaletaEn: f.ultima_paleta_en,
    ultimaPaletaPor: f.ultima_paleta_por,
    resto: f.resto === null ? null : Number(f.resto) || 0,
    restoEn: f.resto_en,
    restoPor: f.resto_por,
  }))
}

/** Mensaje de la base para el operador; los técnicos se cambian por uno corto. */
export function mensajeErrorRobot(mensaje: string | null | undefined): string {
  const m = mensaje ?? ""
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return "No hay conexión con el servidor. Revisa la red e intenta de nuevo."
  }
  if (!m || /PGRST|violates|duplicate key|syntax error|does not exist|column|relation|function/i.test(m)) {
    return "No se pudo completar. Intenta de nuevo; si sigue pasando, avisa a la administración."
  }
  return m
}

/** Error de la lectura cuando el switch del Robot Tavil está apagado en el área. */
export const ROBOT_TAVIL_APAGADO = "ROBOT_TAVIL_APAGADO"

async function llamar(funcion: string, args: Record<string, unknown>): Promise<Lectura<LineaRobot[]>> {
  const { data, error } = await supabase.rpc(funcion, args)
  if (error) return { ok: false, error: mensajeErrorRobot(error.message) }
  if ((data as { habilitado?: boolean } | null)?.habilitado === false) return { ok: false, error: ROBOT_TAVIL_APAGADO }
  return { ok: true, data: mapearPantallaRobot(data) }
}

/*
 * Switch del Robot Tavil, por área (areas.robot_tavil, migración
 * 20261114690000). Encendido: el operador carga paletas y el supervisor ve la
 * precarga. Lo cambia solo la dueña.
 */

/** ¿Está encendido en el área? Sin área, Aséptico. null mientras carga. */
export function useRobotTavilActivo(area: string | null): boolean | null {
  const [resultado, setResultado] = useState<{ area: string | null; valor: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc("robot_tavil_area_activo", { p_area_codigo: area }).then(({ data, error }) => {
      // Sin la migración en el servidor, la función no existe: se comporta como apagado.
      if (vivo) setResultado({ area, valor: !error && data === true })
    })
    return () => {
      vivo = false
    }
  }, [area])
  return resultado?.area === area ? resultado.valor : null
}

export async function guardarRobotTavilActivo(usuario: string, area: string, activo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_robot_tavil", { p_usuario: usuario, p_area_codigo: area, p_activo: activo })
  return error ? { ok: false, error: error.message || "No se pudo cambiar el ajuste." } : { ok: true }
}

export const leerPantallaRobot = (usuario: string) => llamar("robot_tavil_estado", { p_usuario: usuario })
export const sumarPaleta = (usuario: string, linea: string) => llamar("robot_tavil_sumar", { p_usuario: usuario, p_linea_codigo: linea })
export const restarPaleta = (usuario: string, linea: string) => llamar("robot_tavil_restar", { p_usuario: usuario, p_linea_codigo: linea })
export const guardarResto = (usuario: string, linea: string, cajas: number) =>
  llamar("robot_tavil_guardar_resto", { p_usuario: usuario, p_linea_codigo: linea, p_cajas: cajas })
export const iniciarLote = (usuario: string, linea: string) => llamar("robot_tavil_iniciar", { p_usuario: usuario, p_linea_codigo: linea })

export async function listarPrecargas(usuario: string, turnoId: string): Promise<Lectura<PrecargaRobot[]>> {
  const { data, error } = await supabase.rpc("listar_precarga_robot_tavil", { p_usuario: usuario, p_turno_id: turnoId })
  if (error) return { ok: false, error: mensajeErrorRobot(error.message) }
  return { ok: true, data: mapearPrecargas(data) }
}

/** El operador se relee cada 10 s: así ve enseguida cuando el supervisor cierra o carga un lote. */
const REFRESCO_OPERADOR_MS = 10_000
/** La tarjeta del supervisor, cada 20 s. */
const REFRESCO_PRECARGA_MS = 20_000

/**
 * Pantalla del operador. Cada acción devuelve la pantalla ya actualizada.
 * `ejecutar` deja el error a la vista y no lo pisa el próximo refresco.
 */
export function useRobotTavil(usuario: string | null) {
  const [lineas, setLineas] = useState<LineaRobot[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apagado, setApagado] = useState(false)

  useEffect(() => {
    if (!usuario) return
    let vivo = true
    async function cargar() {
      const r = await leerPantallaRobot(usuario!)
      if (!vivo) return
      setApagado(!r.ok && r.error === ROBOT_TAVIL_APAGADO)
      if (r.ok) setLineas(r.data)
      else if (r.error !== ROBOT_TAVIL_APAGADO) setError(r.error)
      setCargando(false)
    }
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_OPERADOR_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [usuario])

  const ejecutar = useCallback(async (accion: () => Promise<Lectura<LineaRobot[]>>): Promise<boolean> => {
    setError(null)
    try {
      const r = await accion()
      if (r.ok) setLineas(r.data)
      else setError(r.error)
      return r.ok
    } catch {
      setError("No se pudo conectar. Intenta de nuevo.")
      return false
    }
  }, [])

  return { lineas, cargando, error, apagado, ejecutar }
}

/** Precarga del Robot Tavil de las corridas del turno (vacía sin turno). */
export function usePrecargaRobot(usuario: string | null | undefined, turnoId: string | null): PrecargaRobot[] {
  // Guardada con su turno: al cambiar de turno no se muestra la del anterior.
  const [leida, setLeida] = useState<{ turnoId: string; precargas: PrecargaRobot[] } | null>(null)

  useEffect(() => {
    if (!usuario || !turnoId) return
    let vivo = true
    async function cargar() {
      const r = await listarPrecargas(usuario!, turnoId!)
      if (vivo && r.ok) setLeida({ turnoId: turnoId!, precargas: r.data })
    }
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_PRECARGA_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [usuario, turnoId])

  return usuario && leida?.turnoId === turnoId ? leida.precargas : SIN_PRECARGAS
}

const SIN_PRECARGAS: PrecargaRobot[] = []

/** Nivel estimado de un tanque en el Panel: el oficial y lo precargado que falta confirmar. */
export interface EstimacionTanque {
  numeroTanque: number
  volumenOficialL: number
  litrosPendientes: number
}

interface FilaEstimacion {
  numero_tanque: number
  volumen_oficial_l: number | string | null
  litros_pendientes: number | string | null
}

export function mapearEstimaciones(data: unknown): EstimacionTanque[] {
  return ((data as FilaEstimacion[] | null) ?? []).map((f) => ({
    numeroTanque: Number(f.numero_tanque),
    volumenOficialL: Number(f.volumen_oficial_l) || 0,
    litrosPendientes: Number(f.litros_pendientes) || 0,
  }))
}

/** El Panel relee la estimación cada 30 s; el resto del Panel sigue con su refresco. */
const REFRESCO_ESTIMACION_MS = 30_000

/**
 * Estimación de los tanques de un turno (vacía sin turno, con el switch
 * apagado o con el turno cerrado). Trae también el volumen oficial del mismo
 * momento, para que estimado y oficial no se desfasen.
 */
export function useEstimacionTanques(usuario: string | null | undefined, turnoId: string | null): EstimacionTanque[] {
  const [leida, setLeida] = useState<{ turnoId: string; estimaciones: EstimacionTanque[] } | null>(null)

  useEffect(() => {
    if (!usuario || !turnoId) return
    let vivo = true
    async function cargar() {
      const { data, error } = await supabase.rpc("estimacion_tanques_robot_tavil", { p_usuario: usuario, p_turno_id: turnoId })
      if (vivo && !error) setLeida({ turnoId: turnoId!, estimaciones: mapearEstimaciones(data) })
    }
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_ESTIMACION_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [usuario, turnoId])

  return usuario && leida?.turnoId === turnoId ? leida.estimaciones : SIN_ESTIMACIONES
}

const SIN_ESTIMACIONES: EstimacionTanque[] = []

/** Lo que muestra un tanque: el estimado (oficial − pendiente, nunca negativo) y si la precarga supera lo que queda. */
export function nivelEstimado(e: EstimacionTanque): { estimadoL: number; excede: boolean } {
  return { estimadoL: Math.max(0, e.volumenOficialL - e.litrosPendientes), excede: e.litrosPendientes > e.volumenOficialL }
}
