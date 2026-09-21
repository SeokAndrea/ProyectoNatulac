import { supabase } from "@/lib/supabase"

export type FamiliaFormula = "CLASICOS" | "PREMIUM" | "TE"
export type UnidadBase = "tambor" | "kit"

export interface InsumoFormula {
  insumo: string
  cantidad: number
  unidad: "kg" | "L"
}

export interface VarianteFormula {
  id: string
  familia: FamiliaFormula
  nombre: string
  unidadBase: UnidadBase
  activo: boolean
  insumos: InsumoFormula[]
}

interface FilaFormula {
  variante_id: string
  familia: FamiliaFormula
  variante: string
  unidad_base: UnidadBase
  activo: boolean
  insumo: string
  cantidad: number
  unidad: "kg" | "L"
}

export async function listarFormulas(): Promise<VarianteFormula[]> {
  const { data, error } = await supabase.rpc("listar_formulas")
  if (error || !data) return []

  const variantes = new Map<string, VarianteFormula>()
  for (const fila of data as FilaFormula[]) {
    let variante = variantes.get(fila.variante_id)
    if (!variante) {
      variante = {
        id: fila.variante_id,
        familia: fila.familia,
        nombre: fila.variante,
        unidadBase: fila.unidad_base,
        activo: fila.activo,
        insumos: [],
      }
      variantes.set(fila.variante_id, variante)
    }
    variante.insumos.push({ insumo: fila.insumo, cantidad: fila.cantidad, unidad: fila.unidad })
  }
  return Array.from(variantes.values())
}

export interface InsumoCalculado extends InsumoFormula {
  total: number
}

/**
 * Cuánto pedir de cada insumo para una variante y una cantidad de
 * tambores/kits — cada insumo por separado, no un total sumado (así
 * se arma el pedido real de materia prima).
 */
export function calcularConsumoFormula(insumos: InsumoFormula[], cantidadUnidades: number): InsumoCalculado[] {
  return insumos.map((i) => ({ ...i, total: i.cantidad * cantidadUnidades }))
}
