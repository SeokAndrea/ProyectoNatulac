import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/*
 * Switch del catálogo modular, por área (areas.catalogo_modular, migración
 * 20261113790000). Encendido: las fallas de equipo se registran con Equipo ›
 * Sistema › Subsistema › Falla. Lo cambia solo la dueña.
 */

/** ¿Está encendido en el área? Sin área, Aséptico. null mientras carga. */
export function useCatalogoModular(area: string | null): boolean | null {
  const [resultado, setResultado] = useState<{ area: string | null; valor: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc("catalogo_modular_area", { p_area_codigo: area }).then(({ data, error }) => {
      // Sin la migración en el servidor, la función no existe: se comporta como apagado.
      if (vivo) setResultado({ area, valor: !error && data === true })
    })
    return () => {
      vivo = false
    }
  }, [area])
  return resultado?.area === area ? resultado.valor : null
}

export async function guardarCatalogoModular(usuario: string, area: string, activo: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_catalogo_modular", { p_usuario: usuario, p_area_codigo: area, p_activo: activo })
  return error ? { ok: false, error: error.message || "No se pudo cambiar el ajuste." } : { ok: true }
}
