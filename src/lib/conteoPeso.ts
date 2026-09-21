import { supabase } from "@/lib/supabase"

export type Redondeo = "ARRIBA" | "ABAJO"

export interface TipoConteoPeso {
  id: string
  nombre: string
  pesoVacioKg: number
  pesoUnidadG: number
  redondeo: Redondeo
  activo: boolean
}

interface FilaTipoConteoPeso {
  tipo_id: string
  nombre: string
  peso_vacio_kg: number
  peso_unidad_g: number
  redondeo: Redondeo
  activo: boolean
}

export async function listarTiposConteoPeso(): Promise<TipoConteoPeso[]> {
  const { data, error } = await supabase.rpc("listar_tipos_conteo_peso")
  if (error || !data) return []
  return (data as FilaTipoConteoPeso[]).map((t) => ({
    id: t.tipo_id,
    nombre: t.nombre,
    pesoVacioKg: t.peso_vacio_kg,
    pesoUnidadG: t.peso_unidad_g,
    redondeo: t.redondeo,
    activo: t.activo,
  }))
}

/**
 * Unidades restantes (pitillos o tapas) a partir del peso actual de
 * la caja, tal cual la hoja "Cálculos" del Excel. Pitillos redondean
 * hacia abajo (conservador); tapas hacia arriba.
 */
export function calcularUnidadesPorPeso(
  pesoActualKg: number,
  tipo: Pick<TipoConteoPeso, "pesoVacioKg" | "pesoUnidadG" | "redondeo">,
): number {
  // Redondeado a 6 decimales antes de floor/ceil: (peso - vacío) suele
  // dar algo como 1.7999999999999998 por precisión de punto flotante en
  // JS, y eso hace que "1.8 exacto" caiga al entero de abajo por error.
  const valor = Math.round(((pesoActualKg - tipo.pesoVacioKg) / tipo.pesoUnidadG) * 1000 * 1e6) / 1e6
  return tipo.redondeo === "ARRIBA" ? Math.ceil(valor) : Math.floor(valor)
}
