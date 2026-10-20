import { supabase } from "@/lib/supabase"

/*
 * Observación de una corrida (línea + lote de un turno), que la analista
 * guarda en el Resumen Diario junto a su merma y sus paradas; Indicadores
 * las muestra por línea y mes ("Ver observaciones guardadas"). Migración
 * 20261111390000.
 */

type Resultado = { ok: true } | { ok: false; error: string }

export interface ObservacionCorrida {
  corridaId: string
  fecha: string
  turnoTipo: string
  lineaCodigo: string
  sabor: string | null
  lote: string | null
  volumenMl: number | null
  texto: string
}

export async function listarObservacionesCorrida(usuario: string, area: string, desde: string, hasta: string): Promise<ObservacionCorrida[] | { error: string }> {
  const { data, error } = await supabase.rpc("listar_observaciones_corrida", { p_usuario: usuario, p_area_codigo: area, p_desde: desde, p_hasta: hasta })
  if (error) return { error: error.message || "No se pudieron leer las observaciones." }
  return (
    (data ?? []) as {
      turno_linea_id: string
      fecha: string
      turno_tipo_codigo: string
      linea_codigo: string
      sabor_nombre: string | null
      lote: string | null
      presentacion_volumen_ml: number | null
      texto: string
    }[]
  ).map((o) => ({
    corridaId: o.turno_linea_id,
    fecha: o.fecha,
    turnoTipo: o.turno_tipo_codigo,
    lineaCodigo: o.linea_codigo,
    sabor: o.sabor_nombre,
    lote: o.lote,
    volumenMl: o.presentacion_volumen_ml,
    texto: o.texto,
  }))
}

/** Guarda la observación de la corrida; vacía, la borra. */
export async function guardarObservacionCorrida(usuario: string, corridaId: string, texto: string): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_observacion_corrida", { p_usuario: usuario, p_turno_linea_id: corridaId, p_texto: texto })
  return error ? { ok: false, error: error.message || "No se pudo guardar la observación." } : { ok: true }
}
