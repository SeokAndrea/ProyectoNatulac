import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/*
 * Calidad analiza y libera los lotes (migración 20261086). El supervisor
 * prepara; Calidad registra Brix, acidez y conformidad. Si es conforme, el
 * mismo registro libera el lote y el tanque queda LISTO.
 *
 * Interruptor por área (areas.calidad_libera): encendido, solo Calidad
 * libera; apagado, el supervisor libera desde Preparación como antes.
 */

export interface AnalisisCalidad {
  id: string
  preparacionId: string
  brix: number
  acidez: number
  conforme: boolean
  observacion: string | null
  analistaNombre: string
  creadoEn: string
}

export interface DatosAnalisisCalidad {
  brix: number
  acidez: number
  conforme: boolean
  observacion: string | null
}

/** Un análisis con los datos del lote, para la tabla de registros. */
export interface RegistroCalidad extends Omit<AnalisisCalidad, "preparacionId"> {
  turnoCodigo: string
  numeroTanque: number
  saborNombre: string | null
  lote: string | null
}

interface FilaAnalisis {
  id: string
  preparacion_id: string
  brix: number | string
  acidez: number | string
  conforme: boolean
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
    p_conforme: datos.conforme,
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
    observacion: f.observacion,
    analistaNombre: f.analista_nombre,
    creadoEn: f.creado_en,
    turnoCodigo: f.turno_codigo,
    numeroTanque: f.numero_tanque,
    saborNombre: f.sabor_nombre,
    lote: f.lote,
  }))
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
