import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/*
 * Calidad analiza y libera los lotes (migraciones 20261086 y 20261088). El
 * supervisor prepara; Calidad registra el análisis sensorial, el Brix y la
 * acidez. El resultado es conforme si el sensorial es conforme y el Brix y
 * la acidez están dentro del rango del sabor; si es conforme, el mismo
 * registro libera el lote y el tanque queda LISTO. Los rangos por sabor los
 * edita el Supervisor de Calidad (CALIDAD_PARAMETROS).
 *
 * Interruptor por área (areas.calidad_libera): encendido, solo Calidad
 * libera; apagado, el supervisor libera desde Preparación como antes.
 */

/** Rango de Brix y acidez con el que se evalúa un sabor. */
export interface RangoCalidad {
  brixMin: number
  brixMax: number
  acidezMin: number
  acidezMax: number
}

export interface AnalisisCalidad {
  id: string
  preparacionId: string
  brix: number
  acidez: number
  /** Resultado: sensorial conforme + Brix y acidez dentro del rango. */
  conforme: boolean
  sensorialConforme: boolean
  /** Rango vigente al momento del análisis. null en los análisis anteriores a los rangos. */
  rango: RangoCalidad | null
  observacion: string | null
  analistaNombre: string
  creadoEn: string
}

export interface DatosAnalisisCalidad {
  brix: number
  acidez: number
  sensorialConforme: boolean
  observacion: string | null
}

/** Parámetros de un sabor (rango null = sin cargar). */
export interface ParametrosSabor {
  saborId: string
  saborNombre: string
  familiaNombre: string
  rango: RangoCalidad | null
  actualizadoEn: string | null
  actualizadoPorNombre: string | null
}

export const brixEnRango = (brix: number, r: RangoCalidad) => brix >= r.brixMin && brix <= r.brixMax
export const acidezEnRango = (acidez: number, r: RangoCalidad) => acidez >= r.acidezMin && acidez <= r.acidezMax

/** "11,5 – 12,5" */
export function textoRango(min: number, max: number): string {
  const f = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 3 })
  return `${f(min)} – ${f(max)}`
}

interface FilaRango {
  brix_min: number | string | null
  brix_max: number | string | null
  acidez_min: number | string | null
  acidez_max: number | string | null
}

function mapearRango(f: FilaRango): RangoCalidad | null {
  if (f.brix_min === null || f.brix_max === null || f.acidez_min === null || f.acidez_max === null) return null
  return { brixMin: Number(f.brix_min), brixMax: Number(f.brix_max), acidezMin: Number(f.acidez_min), acidezMax: Number(f.acidez_max) }
}

/** Un análisis con los datos del lote, para la tabla de registros. */
export interface RegistroCalidad extends Omit<AnalisisCalidad, "preparacionId"> {
  turnoCodigo: string
  numeroTanque: number
  saborNombre: string | null
  lote: string | null
}

interface FilaAnalisis extends FilaRango {
  id: string
  preparacion_id: string
  brix: number | string
  acidez: number | string
  conforme: boolean
  /** undefined si el servidor todavía no tiene la migración 20261088. */
  sensorial_conforme?: boolean
  observacion: string | null
  analista_nombre: string
  creado_en: string
}

type FilaRegistro = Omit<FilaAnalisis, "preparacion_id"> & {
  turno_codigo: string
  numero_tanque: number
  sabor_nombre: string | null
  lote: string | null
}

const mapearAnalisis = (f: FilaAnalisis): AnalisisCalidad => ({
  id: f.id,
  preparacionId: f.preparacion_id,
  brix: Number(f.brix),
  acidez: Number(f.acidez),
  conforme: f.conforme,
  sensorialConforme: f.sensorial_conforme ?? f.conforme,
  rango: mapearRango(f),
  observacion: f.observacion,
  analistaNombre: f.analista_nombre,
  creadoEn: f.creado_en,
})

/** Guarda el análisis; si es conforme, libera el lote. Devuelve el turno (turno_json) para refrescar tanques. */
export async function registrarAnalisisCalidad(
  usuario: string,
  turnoId: string,
  loteId: string,
  datos: DatosAnalisisCalidad,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("registrar_analisis_calidad", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_lote_id: loteId,
    p_brix: datos.brix,
    p_acidez: datos.acidez,
    // En el servidor p_conforme es el análisis sensorial; el resultado lo calcula él con el rango del sabor.
    p_conforme: datos.sensorialConforme,
    p_observacion: datos.observacion,
  })
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar el análisis. Intenta de nuevo." }
  return { ok: true, data }
}

export async function analisisDeLotes(loteIds: string[]): Promise<AnalisisCalidad[]> {
  if (loteIds.length === 0) return []
  const { data, error } = await supabase.rpc("analisis_calidad_de_lotes", { p_lote_ids: loteIds })
  if (error || !data) return []
  return (data as FilaAnalisis[]).map(mapearAnalisis)
}

export async function listarAnalisisCalidad(usuario: string, desde: string, hasta: string, area: string | null): Promise<RegistroCalidad[]> {
  const { data, error } = await supabase.rpc("listar_analisis_calidad", {
    p_usuario: usuario,
    p_desde: desde,
    p_hasta: hasta,
    p_area_codigo: area,
  })
  if (error || !data) return []
  return (data as FilaRegistro[]).map((f) => ({
    id: f.id,
    brix: Number(f.brix),
    acidez: Number(f.acidez),
    conforme: f.conforme,
    sensorialConforme: f.sensorial_conforme ?? f.conforme,
    rango: mapearRango(f),
    observacion: f.observacion,
    analistaNombre: f.analista_nombre,
    creadoEn: f.creado_en,
    turnoCodigo: f.turno_codigo,
    numeroTanque: f.numero_tanque,
    saborNombre: f.sabor_nombre,
    lote: f.lote,
  }))
}

export async function listarParametrosCalidad(): Promise<ParametrosSabor[]> {
  const { data, error } = await supabase.rpc("listar_parametros_calidad")
  if (error || !data) return []
  return (
    data as (FilaRango & {
      sabor_id: string
      sabor_nombre: string
      familia_nombre: string
      actualizado_en: string | null
      actualizado_por_nombre: string | null
    })[]
  ).map((f) => ({
    saborId: f.sabor_id,
    saborNombre: f.sabor_nombre,
    familiaNombre: f.familia_nombre,
    rango: mapearRango(f),
    actualizadoEn: f.actualizado_en,
    actualizadoPorNombre: f.actualizado_por_nombre,
  }))
}

export async function guardarParametrosCalidad(
  usuario: string,
  saborId: string,
  rango: RangoCalidad,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_parametros_calidad", {
    p_usuario: usuario,
    p_sabor_id: saborId,
    p_brix_min: rango.brixMin,
    p_brix_max: rango.brixMax,
    p_acidez_min: rango.acidezMin,
    p_acidez_max: rango.acidezMax,
  })
  if (error) return { ok: false, error: error.message || "No se pudieron guardar los rangos. Intenta de nuevo." }
  return { ok: true }
}

/** Rangos de todos los sabores activos. `recargar` los vuelve a pedir (después de editar uno). */
export function useParametrosCalidad() {
  const [parametros, setParametros] = useState<ParametrosSabor[] | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let vivo = true
    listarParametrosCalidad().then((lista) => vivo && setParametros(lista))
    return () => {
      vivo = false
    }
  }, [version])
  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  return { parametros, recargar }
}

/** ¿En esta área libera Calidad? null mientras carga. Sin área: Aséptico. */
export function useCalidadLibera(area: string | null): boolean | null {
  const [resultado, setResultado] = useState<{ area: string | null; valor: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc("calidad_libera_area", { p_area_codigo: area }).then(({ data, error }) => {
      // Si la migración todavía no está en el servidor, la función no existe: se comporta como antes.
      if (vivo) setResultado({ area, valor: !error && data === true })
    })
    return () => {
      vivo = false
    }
  }, [area])
  return resultado?.area === area ? resultado.valor : null
}

/**
 * Análisis de los lotes dados, agrupados por lote (el más nuevo primero).
 * `refrescar` vuelve a pedirlos (después de registrar uno).
 */
export function useAnalisisCalidad(loteIds: string[]) {
  const clave = [...loteIds].sort().join(",")
  const [porLote, setPorLote] = useState<Map<string, AnalisisCalidad[]>>(new Map())
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vivo = true
    analisisDeLotes(clave ? clave.split(",") : []).then((lista) => {
      if (!vivo) return
      const m = new Map<string, AnalisisCalidad[]>()
      for (const a of lista) m.set(a.preparacionId, [...(m.get(a.preparacionId) ?? []), a])
      setPorLote(m)
    })
    return () => {
      vivo = false
    }
  }, [clave, version])

  const refrescar = useCallback(() => setVersion((v) => v + 1), [])
  return { porLote, refrescar }
}
