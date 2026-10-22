import { supabase } from "@/lib/supabase"
import type { LineaCodigo } from "@/lib/catalogos"

/*
 * Última configuración usada por una línea (presentación + velocidad),
 * para prellenar el formulario de "Activar Línea" — ver
 * supabase/migrations/20260994090000_ultima_configuracion_linea.sql y
 * docs/plan-rework-tanques-lineas-recepcion.md §12. No depende de que exista
 * un lote "siguiente" liberado: mira la línea física, sin importar el
 * turno ni el sabor.
 */
export interface UltimaConfiguracionLinea {
  presentacionVolumenMl: number | null
  envasesHora: number | null
  litrosHora: number | null
}

export async function obtenerUltimaConfiguracionLinea(
  areaCodigo: string,
  lineaCodigo: LineaCodigo,
): Promise<UltimaConfiguracionLinea | null> {
  const { data, error } = await supabase.rpc("ultima_configuracion_linea", {
    p_area_codigo: areaCodigo,
    p_linea_codigo: lineaCodigo,
  })
  if (error || !data || data.length === 0) return null

  const fila = data[0] as { presentacion_volumen_ml: number | null; envases_hora: number | null; litros_hora: number | string | null }
  return {
    presentacionVolumenMl: fila.presentacion_volumen_ml,
    envasesHora: fila.envases_hora,
    litrosHora: fila.litros_hora === null ? null : Number(fila.litros_hora),
  }
}
